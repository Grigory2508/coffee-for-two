// Ядро игры: чистые функции без DOM и сети. Один и тот же код работает
// в браузере (локальный режим) и на сервере (Supabase Edge Function).
import {
  CONFIG,
  DECOR_BY_ID,
  DRINKS,
  REGULARS,
  REGULAR_ORDER,
  START_MENU,
  STOCK_PACKS,
  UPGRADES,
  type DrinkId,
  type RegularId,
  type StockId,
} from './content.ts';
import { hashString, mulberry32, pick } from './rng.ts';
import {
  GameError,
  type CafeState,
  type Command,
  type CommandEnvelope,
  type GuestResult,
  type LogEntry,
  type LogKind,
  type Player,
  type PlayerId,
  type ShiftGuest,
  type ShiftPlan,
} from './types.ts';

export const NPC_ID = 'npc';
const HOUR = 3600_000;

// ---------- утилиты ----------

export function dayKey(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

/** ISO-неделя вида 2026-W44 (UTC). */
export function weekId(ms: number): string {
  const d = new Date(ms);
  const day = (d.getUTCDay() + 6) % 7; // пн = 0
  const thursday = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - day + 3));
  const yearStart = Date.UTC(thursday.getUTCFullYear(), 0, 1);
  const week = 1 + Math.floor((thursday.getTime() - yearStart) / (7 * 86400_000));
  return `${thursday.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

export const level = (xp: number) => Math.floor(Math.sqrt(xp / 50));
export const xpForLevel = (lvl: number) => lvl * lvl * 50;

export function clone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T;
}

function addLog(s: CafeState, at: number, actor: LogEntry['actor'], kind: LogKind, p?: LogEntry['p']) {
  s.logSeq += 1;
  s.log.push({ id: s.logSeq, at, actor, kind, p });
  if (s.log.length > CONFIG.logMax) s.log.splice(0, s.log.length - CONFIG.logMax);
}

export function humans(s: CafeState): Player[] {
  return s.players.filter((p) => !p.isNpc);
}

export function getPlayer(s: CafeState, id: PlayerId): Player | undefined {
  return s.players.find((p) => p.id === id);
}

export function partnerOf(s: CafeState, id: PlayerId): Player | undefined {
  return s.players.find((p) => p.id !== id);
}

// ---------- энергия ----------

export function energyNow(p: Player, now: number): { energy: number; nextAt: number | null } {
  if (p.energy >= CONFIG.energyMax) return { energy: CONFIG.energyMax, nextAt: null };
  const gained = Math.floor(Math.max(0, now - p.energyAt) / CONFIG.energyRegenMs);
  const energy = Math.min(CONFIG.energyMax, p.energy + gained);
  if (energy >= CONFIG.energyMax) return { energy, nextAt: null };
  return { energy, nextAt: p.energyAt + (gained + 1) * CONFIG.energyRegenMs };
}

function normalizeEnergy(p: Player, now: number) {
  if (p.energy >= CONFIG.energyMax) {
    p.energy = CONFIG.energyMax;
    p.energyAt = now;
    return;
  }
  const gained = Math.floor(Math.max(0, now - p.energyAt) / CONFIG.energyRegenMs);
  p.energy = Math.min(CONFIG.energyMax, p.energy + gained);
  p.energyAt = p.energy >= CONFIG.energyMax ? now : p.energyAt + gained * CONFIG.energyRegenMs;
}

function spendEnergy(p: Player, now: number) {
  normalizeEnergy(p, now);
  if (p.energy < 1) throw new GameError('no_energy');
  if (p.energy >= CONFIG.energyMax) p.energyAt = now;
  p.energy -= 1;
}

// ---------- рейтинг, ворота, склад ----------

export function rating(s: CafeState): number | null {
  if (s.ratingRecent.length < CONFIG.ratingMinGuests) return null;
  const avg = s.ratingRecent.reduce((a, b) => a + b, 0) / s.ratingRecent.length;
  return Math.round(avg * 50) / 10; // 0..5 с шагом 0.1
}

export function roomGate(s: CafeState) {
  const stars = rating(s) ?? 0;
  return {
    stars,
    shifts: s.stats.shifts,
    needStars: CONFIG.roomGateStars,
    needShifts: CONFIG.roomGateShifts,
    met: stars >= CONFIG.roomGateStars && s.stats.shifts >= CONFIG.roomGateShifts,
  };
}

export function capacity(s: CafeState, item: StockId): number {
  if (item === 'milk' && s.upgrades.fridge) return CONFIG.fridgeMilkCapacity;
  return CONFIG.baseCapacity;
}

export function packPrice(s: CafeState, actor: PlayerId, item: StockId): number {
  const p = getPlayer(s, actor);
  const lvl = p ? level(p.managerXp) : 0;
  const discount = Math.min(CONFIG.managerDiscountMax, lvl * CONFIG.managerDiscountPerLevel);
  return Math.round(STOCK_PACKS[item].cost * (1 - discount));
}

export function recipeUsage(drink: DrinkId): Partial<Record<StockId, number>> {
  const use: Partial<Record<StockId, number>> = {};
  for (const c of DRINKS[drink].recipe) {
    const st = c === 'shot' ? 'beans' : c === 'milk' || c === 'foam' ? 'milk' : c === 'syrup' ? 'syrup' : c === 'cocoa' ? 'cocoa' : null;
    if (st) use[st] = (use[st] ?? 0) + 1;
  }
  return use;
}

export function canMake(stock: Record<StockId, number>, drink: DrinkId): boolean {
  const use = recipeUsage(drink);
  return (Object.keys(use) as StockId[]).every((k) => stock[k] >= (use[k] ?? 0));
}

function consume(stock: Record<StockId, number>, drink: DrinkId) {
  const use = recipeUsage(drink);
  for (const k of Object.keys(use) as StockId[]) stock[k] -= use[k] ?? 0;
}

/** Совпадают ли собранные компоненты с рецептом (порядок не важен). */
export function matchesRecipe(made: string[], drink: DrinkId): boolean {
  const a = [...made].sort().join(',');
  const b = [...DRINKS[drink].recipe].sort().join(',');
  return a === b;
}

export function catInCafe(s: CafeState): boolean {
  return !!s.cat && s.cat.hunger > 40 && s.cat.mood > 50;
}

// ---------- создание ----------

function newPlayer(id: PlayerId, name: string, slot: 0 | 1, isNpc: boolean, now: number): Player {
  return {
    id,
    name,
    slot,
    isNpc,
    energy: CONFIG.energyMax,
    energyAt: now,
    baristaXp: 0,
    managerXp: 0,
    joinedAt: now,
    lastSeenAt: now,
    days: [],
    lastPetAt: 0,
  };
}

export function createCafe(opts: {
  code: string;
  owner: { id: PlayerId; name: string };
  npcName: string;
  cafeName: string;
  now: number;
}): CafeState {
  const { now } = opts;
  const s: CafeState = {
    schema: 1,
    code: opts.code,
    name: opts.cafeName,
    version: 1,
    createdAt: now,
    updatedAt: now,
    players: [newPlayer(opts.owner.id, opts.owner.name, 0, false, now), newPlayer(NPC_ID, opts.npcName, 1, true, now)],
    money: CONFIG.startMoney,
    stock: { ...CONFIG.startStock },
    menu: [...START_MENU],
    upgrades: {},
    ratingRecent: [],
    regulars: {},
    activeShifts: {},
    room: { unlocked: false, owned: [], placed: {} },
    cat: null,
    board: [],
    log: [],
    logSeq: 0,
    week: { id: weekId(now), points: 0 },
    stats: { shifts: 0, guestsServed: 0, guestsLost: 0, earned: 0 },
    nextNpcAt: now + CONFIG.npcShiftEveryMs,
    alerts: { stockLowAt: 0, catHungryAt: 0 },
  };
  addLog(s, now, opts.owner.id, 'cafe_opened');
  return s;
}

// ---------- время ----------

function npcShift(s: CafeState, at: number) {
  const npc = s.players.find((p) => p.isNpc);
  if (!npc) return;
  const rnd = mulberry32(hashString(`${s.code}:npc:${at}`));
  let earned = 0;
  let served = 0;
  for (let i = 0; i < 4; i++) {
    const order = pick(rnd, s.menu);
    if (!canMake(s.stock, order)) continue;
    consume(s.stock, order);
    const pay = Math.round(DRINKS[order].price * CONFIG.npcEfficiency);
    earned += pay;
    served += 1;
    pushRating(s, 0.6);
  }
  s.money += earned;
  s.stats.earned += earned;
  s.week.points += served * 6;
  addLog(s, at, npc.id, 'npc_shift', { earned, served });
}

function pushRating(s: CafeState, v: number) {
  s.ratingRecent.push(Math.max(0, Math.min(1, v)));
  if (s.ratingRecent.length > CONFIG.ratingWindow) s.ratingRecent.splice(0, s.ratingRecent.length - CONFIG.ratingWindow);
}

/** Прокрутить мир до момента now: энергия, NPC, кот, неделя, напоминания. Мутирует s. */
export function advanceMut(s: CafeState, now: number) {
  if (now < s.updatedAt) now = s.updatedAt; // время не идёт назад
  for (const p of s.players) normalizeEnergy(p, now);

  // NPC-партнёр работает, пока в кофейне нет второго человека
  let guard = 0;
  while (s.players.some((p) => p.isNpc) && s.nextNpcAt <= now && guard < 8) {
    npcShift(s, s.nextNpcAt);
    s.nextNpcAt += CONFIG.npcShiftEveryMs;
    guard += 1;
  }
  if (s.nextNpcAt <= now) s.nextNpcAt = now + CONFIG.npcShiftEveryMs;

  if (s.cat) {
    const hours = Math.max(0, now - s.cat.updatedAt) / HOUR;
    s.cat.hunger = Math.max(0, s.cat.hunger - hours * CONFIG.catHungerPerHour);
    s.cat.mood = Math.max(0, s.cat.mood - hours * CONFIG.catMoodPerHour);
    s.cat.updatedAt = now;
    if (s.cat.hunger < 30 && now - s.alerts.catHungryAt > 6 * HOUR) {
      s.alerts.catHungryAt = now;
      addLog(s, now, 'system', 'cat_hungry', { name: s.cat.name });
    }
  }

  if ((s.stock.beans < 5 || s.stock.milk < 5) && now - s.alerts.stockLowAt > 6 * HOUR) {
    s.alerts.stockLowAt = now;
    addLog(s, now, 'system', 'stock_low', { beans: s.stock.beans, milk: s.stock.milk });
  }

  const wk = weekId(now);
  if (wk !== s.week.id) s.week = { id: wk, points: 0 };

  if (!s.room.unlocked && roomGate(s).met) {
    s.room.unlocked = true;
    addLog(s, now, 'system', 'room_unlocked');
  }
  s.updatedAt = now;
}

export function advance(s: CafeState, now: number): CafeState {
  const n = clone(s);
  advanceMut(n, now);
  return n;
}

// ---------- смена ----------

export function makeShiftPlan(s: CafeState, actor: PlayerId, now: number): ShiftPlan {
  const seed = hashString(`${s.code}:${actor}:${s.version}:${now}`);
  const rnd = mulberry32(seed);
  const n = CONFIG.shiftGuests;
  const span = CONFIG.shiftDurationMs - 25_000;
  const patience = CONFIG.basePatienceMs + (s.upgrades.cozyHall ? 3000 : 0);
  const guests: ShiftGuest[] = [];
  for (let i = 0; i < n; i++) {
    guests.push({
      order: pick(rnd, s.menu),
      patienceMs: patience + Math.round(rnd() * 4000),
      arriveMs: Math.round((i * span) / n + rnd() * 2500),
    });
  }
  // Постоянный гость: следующий по очереди незаконченной истории
  const pending = REGULAR_ORDER.filter((r) => (s.regulars[r]?.visits ?? 0) < REGULARS[r].beats.length);
  if (pending.length && rnd() < 0.7) {
    const reg: RegularId = pending[Math.floor(rnd() * pending.length) % pending.length];
    const k = 1 + Math.floor(rnd() * (n - 1));
    const fav = REGULARS[reg].favorite;
    guests[k].regular = reg;
    guests[k].order = s.menu.includes(fav) ? fav : guests[k].order;
    guests[k].patienceMs += 4000; // постоянные гости терпеливее
  }
  return { seed, startedAt: now, guests, catInCafe: catInCafe(s) };
}

export interface ShiftSummary {
  earned: number;
  tips: number;
  served: number;
  wrong: number;
  left: number;
  points: number;
  beats: { regular: RegularId; beat: number }[];
  noStock: number;
}

export function tipFor(s: CafeState, p: Player, drink: DrinkId, waitMs: number, patienceMs: number, cat: boolean): number {
  const speed = Math.max(0, 1 - waitMs / patienceMs);
  const mult = (1 + 0.05 * level(p.baristaXp)) * (s.upgrades.machinePro ? 1.15 : 1) * (cat ? 1.1 : 1);
  return Math.round(DRINKS[drink].price * 0.25 * speed * mult);
}

function resolveShift(s: CafeState, actor: PlayerId, plan: ShiftPlan, results: GuestResult[], at: number): ShiftSummary {
  const p = getPlayer(s, actor)!;
  const byIdx = new Map<number, GuestResult>();
  for (const r of results) {
    if (Number.isInteger(r.i) && r.i >= 0 && r.i < plan.guests.length && !byIdx.has(r.i)) byIdx.set(r.i, r);
  }
  const today = dayKey(at);
  const bothActive = humans(s).length === 2 && humans(s).every((h) => h.id === actor || h.days.includes(today));
  const coop = bothActive ? 1.2 : 1;
  const sum: ShiftSummary = { earned: 0, tips: 0, served: 0, wrong: 0, left: 0, points: 0, beats: [], noStock: 0 };

  plan.guests.forEach((g, i) => {
    const r = byIdx.get(i);
    let outcome = r?.outcome ?? 'left';
    const wait = Math.max(0, Math.min(r?.waitMs ?? g.patienceMs, g.patienceMs));
    if (outcome !== 'left' && !canMake(s.stock, g.order)) {
      outcome = 'left';
      sum.noStock += 1;
    }
    let sat = 0;
    if (outcome === 'served') {
      consume(s.stock, g.order);
      const tip = tipFor(s, p, g.order, wait, g.patienceMs, plan.catInCafe);
      sum.earned += DRINKS[g.order].price + tip;
      sum.tips += tip;
      sum.served += 1;
      p.baristaXp += 10;
      sat = Math.min(1, 1 - 0.5 * (wait / g.patienceMs) + (s.upgrades.cozyHall ? 0.05 : 0));
      if (g.regular) {
        const reg = (s.regulars[g.regular] ??= { visits: 0, seenBy: [] });
        if (reg.visits < REGULARS[g.regular].beats.length) {
          sum.beats.push({ regular: g.regular, beat: reg.visits });
          reg.seenBy.push(actor);
          reg.visits += 1;
          addLog(s, at, actor, 'regular_story', { regular: g.regular, beat: reg.visits - 1 });
        }
      }
    } else if (outcome === 'wrong') {
      consume(s.stock, g.order);
      sum.earned += Math.round(DRINKS[g.order].price * 0.5);
      sum.wrong += 1;
      p.baristaXp += 3;
      sat = 0.3;
    } else {
      sum.left += 1;
      s.stats.guestsLost += 1;
    }
    pushRating(s, sat);
    sum.points += Math.round(sat * 10 * coop);
  });

  s.money += sum.earned;
  s.stats.earned += sum.earned;
  s.stats.guestsServed += sum.served;
  s.stats.shifts += 1;
  s.week.points += sum.points;
  addLog(s, at, actor, 'shift_done', { earned: sum.earned, served: sum.served, total: plan.guests.length });
  return sum;
}

// ---------- команды ----------

export interface ApplyResult {
  state: CafeState;
  shiftPlan?: ShiftPlan;
  summary?: ShiftSummary;
}

function markDay(p: Player, at: number) {
  const d = dayKey(at);
  if (!p.days.includes(d)) {
    p.days.push(d);
    if (p.days.length > 60) p.days.shift();
  }
}

function requireMoney(s: CafeState, cost: number) {
  if (s.money < cost) throw new GameError('no_money', { cost });
}

export function apply(state: CafeState, env: CommandEnvelope): ApplyResult {
  const s = clone(state);
  const { actor, at, cmd } = env;
  advanceMut(s, at);
  const out: ApplyResult = { state: s };

  if (cmd.type === 'join') {
    const existing = getPlayer(s, cmd.player.id);
    if (existing) {
      existing.name = cmd.player.name || existing.name;
    } else {
      const npcIdx = s.players.findIndex((p) => p.isNpc);
      if (npcIdx < 0 && s.players.length >= CONFIG.maxPlayers) throw new GameError('cafe_full');
      const np = newPlayer(cmd.player.id, cmd.player.name, 1, false, at);
      if (npcIdx >= 0) s.players.splice(npcIdx, 1, np);
      else s.players.push(np);
      addLog(s, at, np.id, 'partner_joined', { name: np.name });
    }
    bump(s, at);
    return out;
  }

  const p = getPlayer(s, actor);
  if (!p || p.isNpc) throw new GameError('not_member');

  switch (cmd.type) {
    case 'rename': {
      const name = cmd.name.trim().slice(0, 24);
      if (!name) throw new GameError('bad_name');
      s.name = name;
      addLog(s, at, actor, 'renamed', { name });
      break;
    }
    case 'startShift': {
      const prev = s.activeShifts[actor];
      if (prev && at - prev.startedAt < CONFIG.shiftDurationMs + 60_000) {
        out.shiftPlan = prev; // возобновляем незавершённую смену без повторной траты энергии
        return out;
      }
      spendEnergy(p, at);
      const plan = makeShiftPlan(s, actor, at);
      s.activeShifts[actor] = plan;
      out.shiftPlan = plan;
      break;
    }
    case 'finishShift': {
      const plan = s.activeShifts[actor];
      if (!plan) throw new GameError('no_shift');
      out.summary = resolveShift(s, actor, plan, cmd.results, at);
      delete s.activeShifts[actor];
      markDay(p, at);
      break;
    }
    case 'abandonShift': {
      const plan = s.activeShifts[actor];
      if (!plan) throw new GameError('no_shift');
      out.summary = resolveShift(s, actor, plan, [], at);
      delete s.activeShifts[actor];
      break;
    }
    case 'buyStock': {
      const pack = STOCK_PACKS[cmd.item];
      if (!pack) throw new GameError('bad_item');
      const cap = capacity(s, cmd.item);
      if (s.stock[cmd.item] + pack.amount > cap) throw new GameError('capacity', { cap });
      const cost = packPrice(s, actor, cmd.item);
      requireMoney(s, cost);
      s.money -= cost;
      s.stock[cmd.item] += pack.amount;
      p.managerXp += 10;
      markDay(p, at);
      addLog(s, at, actor, 'stock_bought', { item: cmd.item, amount: pack.amount, cost });
      break;
    }
    case 'buyUpgrade': {
      const up = UPGRADES[cmd.id];
      if (!up) throw new GameError('bad_item');
      if (s.upgrades[cmd.id]) throw new GameError('owned');
      requireMoney(s, up.cost);
      s.money -= up.cost;
      s.upgrades[cmd.id] = true;
      p.managerXp += 25;
      markDay(p, at);
      addLog(s, at, actor, 'upgrade_bought', { id: cmd.id });
      break;
    }
    case 'unlockDrink': {
      const d = DRINKS[cmd.id];
      if (!d) throw new GameError('bad_item');
      if (s.menu.includes(cmd.id)) throw new GameError('owned');
      requireMoney(s, d.unlockCost);
      s.money -= d.unlockCost;
      s.menu.push(cmd.id);
      p.managerXp += 15;
      markDay(p, at);
      addLog(s, at, actor, 'drink_unlocked', { id: cmd.id });
      break;
    }
    case 'buyDecor': {
      if (!s.room.unlocked) throw new GameError('room_locked');
      const item = DECOR_BY_ID[cmd.id];
      if (!item) throw new GameError('bad_item');
      if (s.room.owned.includes(item.id)) throw new GameError('owned');
      requireMoney(s, item.cost);
      s.money -= item.cost;
      s.room.owned.push(item.id);
      s.room.placed[item.slot] = item.id; // сразу ставим купленное
      markDay(p, at);
      addLog(s, at, actor, 'decor_bought', { id: item.id });
      break;
    }
    case 'placeDecor': {
      if (!s.room.unlocked) throw new GameError('room_locked');
      if (cmd.id === null) {
        delete s.room.placed[cmd.slot];
      } else {
        const item = DECOR_BY_ID[cmd.id];
        if (!item || item.slot !== cmd.slot || !s.room.owned.includes(item.id)) throw new GameError('bad_item');
        s.room.placed[cmd.slot] = item.id;
        addLog(s, at, actor, 'decor_placed', { id: item.id });
      }
      break;
    }
    case 'adoptCat': {
      if (!s.room.unlocked) throw new GameError('room_locked');
      if (s.cat) throw new GameError('owned');
      const name = cmd.name.trim().slice(0, 20);
      if (!name) throw new GameError('bad_name');
      s.cat = { name, hunger: 80, mood: 80, updatedAt: at };
      s.stock.catFood += 5; // стартовый пакет корма
      markDay(p, at);
      addLog(s, at, actor, 'cat_adopted', { name });
      break;
    }
    case 'feedCat': {
      if (!s.cat) throw new GameError('no_cat');
      if (s.stock.catFood < 1) throw new GameError('no_food');
      s.stock.catFood -= 1;
      s.cat.hunger = Math.min(100, s.cat.hunger + 50);
      s.cat.mood = Math.min(100, s.cat.mood + 5);
      markDay(p, at);
      addLog(s, at, actor, 'cat_fed', { name: s.cat.name });
      break;
    }
    case 'petCat': {
      if (!s.cat) throw new GameError('no_cat');
      if (at - p.lastPetAt < CONFIG.catPetCooldownMs) throw new GameError('cooldown', { at: p.lastPetAt + CONFIG.catPetCooldownMs });
      p.lastPetAt = at;
      s.cat.mood = Math.min(100, s.cat.mood + 20);
      markDay(p, at);
      addLog(s, at, actor, 'cat_petted', { name: s.cat.name });
      break;
    }
    case 'postNote': {
      const text = cmd.text.trim().slice(0, CONFIG.noteMaxLen);
      if (!text && !cmd.sticker) throw new GameError('empty_note');
      s.board.push({ id: `${at}-${s.logSeq}`, author: actor, text, sticker: cmd.sticker, at });
      if (s.board.length > CONFIG.boardMax) s.board.splice(0, s.board.length - CONFIG.boardMax);
      addLog(s, at, actor, 'note', { text: text.slice(0, 60), sticker: cmd.sticker ?? '' });
      break;
    }
    case 'seen': {
      p.lastSeenAt = at;
      break;
    }
    case 'debugRefill': {
      p.energy = CONFIG.energyMax;
      p.energyAt = at;
      s.money += 1000;
      break;
    }
    default: {
      const never: never = cmd;
      throw new GameError('bad_command', { type: String((never as Command).type) });
    }
  }
  advanceMut(s, at); // ворота комнаты и т.п. сразу после действия
  bump(s, at);
  return out;
}

function bump(s: CafeState, at: number) {
  s.version += 1;
  s.updatedAt = Math.max(s.updatedAt, at);
}

/** Сообщения, которые бот отправил бы игроку: всё, что сделали другие с момента его последнего визита. */
export function digestFor(s: CafeState, playerId: PlayerId): LogEntry[] {
  const p = getPlayer(s, playerId);
  if (!p) return [];
  return s.log.filter((e) => e.at > p.lastSeenAt && e.actor !== playerId);
}
