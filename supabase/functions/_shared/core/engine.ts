// Ядро игры: чистые функции без DOM и сети. Один и тот же код работает
// в браузере (локальный режим) и на сервере (Supabase Edge Function).
import {
  COMPONENTS,
  CONFIG,
  DECOR_BY_ID,
  DRINKS,
  MARKETING,
  REGULARS,
  REGULAR_ORDER,
  START_MENU,
  STOCK_PACKS,
  UPGRADES,
  otherRole,
  type DrinkId,
  type RegularId,
  type Role,
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

export function playerByRole(s: CafeState, role: Role): Player | undefined {
  return s.players.find((p) => p.role === role);
}

export const ROLE_LIST: Role[] = ['barista', 'manager'];

export function roleCount(s: CafeState, role: Role): number {
  return humans(s).filter((p) => p.role === role).length;
}

/** Роли, в которые сейчас можно прийти или перейти (с учётом лимитов и общего штата). */
export function freeRoles(s: CafeState): Role[] {
  if (humans(s).length >= CONFIG.maxStaff) return [];
  return ROLE_LIST.filter((r) => roleCount(s, r) < CONFIG.roleMax[r]);
}

function shiftLive(plan: ShiftPlan | undefined, at: number): boolean {
  return !!plan && at - plan.startedAt < CONFIG.shiftDurationMs + 60_000;
}

/** Кто сейчас стоит за кассой (кроме actor). */
export function counterHolder(s: CafeState, actor: PlayerId, at: number): Player | undefined {
  const id = Object.keys(s.activeShifts).find((pid) => pid !== actor && shiftLive(s.activeShifts[pid], at));
  return id ? getPlayer(s, id) : undefined;
}

/** Кто сейчас занимает кабинет менеджера (кроме actor). */
export function officeHolder(s: CafeState, actor: PlayerId, at: number): Player | undefined {
  if (!s.office || s.office.by === actor || s.office.until <= at) return undefined;
  return getPlayer(s, s.office.by);
}

/** Сосед-NPC есть, только пока в какой-то роли нет ни одного человека. */
function syncNpc(s: CafeState, at: number) {
  const empty = ROLE_LIST.filter((r) => roleCount(s, r) === 0);
  const idx = s.players.findIndex((p) => p.isNpc);
  if (empty.length === 1) {
    if (idx >= 0) s.players[idx].role = empty[0];
    else s.players.push(newPlayer(NPC_ID, s.npcName, s.players.length, true, empty[0], at));
  } else if (idx >= 0 && empty.length === 0) {
    s.players.splice(idx, 1);
  }
}

export function newInviteKey(seed: string): string {
  const A = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  let h = hashString(seed);
  let out = '';
  for (let i = 0; i < 5; i++) {
    h = Math.imul(h ^ (h >>> 13), 2654435761) >>> 0;
    out += A[h % A.length];
  }
  return out;
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

function spendEnergy(p: Player, now: number, amount = 1) {
  normalizeEnergy(p, now);
  if (p.energy < amount) throw new GameError('no_energy');
  if (p.energy >= CONFIG.energyMax) p.energyAt = now;
  p.energy -= amount;
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

export function tablesCount(s: CafeState): number {
  return CONFIG.tablesBase + (s.upgrades.terrace ? CONFIG.terraceTables : 0);
}

export function guestsPerShift(s: CafeState): number {
  return CONFIG.shiftGuests + (s.upgrades.terrace ? 1 : 0) + (s.marketing?.guests ?? 0);
}

export function recipeUsage(drink: DrinkId): Partial<Record<StockId, number>> {
  const use: Partial<Record<StockId, number>> = {};
  for (const c of DRINKS[drink].recipe) {
    const st = COMPONENTS[c].uses;
    if (st) use[st] = (use[st] ?? 0) + 1;
  }
  return use;
}

export function canMake(stock: Record<StockId, number>, drink: DrinkId): boolean {
  const use = recipeUsage(drink);
  return (Object.keys(use) as StockId[]).every((k) => stock[k] >= (use[k] ?? 0));
}

function consume(stock: Record<StockId, number>, drink: DrinkId, takeaway = false) {
  const use = recipeUsage(drink);
  for (const k of Object.keys(use) as StockId[]) stock[k] -= use[k] ?? 0;
  if (takeaway) stock.cups -= 1;
}

/** Хватит ли склада на заказ гостя (с собой — ещё и стакан). */
export function canServe(stock: Record<StockId, number>, g: ShiftGuest): boolean {
  return canMake(stock, g.order) && (!g.takeaway || (stock.cups ?? 0) >= 1);
}

/** Совпадают ли собранные компоненты с рецептом (порядок не важен). */
export function matchesRecipe(made: string[], drink: DrinkId): boolean {
  const a = [...made].sort().join(',');
  const b = [...DRINKS[drink].recipe].sort().join(',');
  return a === b;
}

/** Меню дня; если оно пустое или устарело — всё открытое меню. */
export function todayMenu(s: CafeState): DrinkId[] {
  const f = (s.featured ?? []).filter((d) => s.menu.includes(d));
  return f.length ? f : s.menu;
}

export function catInCafe(s: CafeState): boolean {
  return !!s.cat && s.cat.hunger > 40 && s.cat.mood > 50;
}

// ---------- создание ----------

function newPlayer(id: PlayerId, name: string, slot: number, isNpc: boolean, role: Role, now: number): Player {
  return {
    id,
    name,
    slot,
    isNpc,
    role,
    energy: CONFIG.energyMax,
    energyAt: now,
    baristaXp: 0,
    managerXp: 0,
    joinedAt: now,
    lastSeenAt: now,
    lastActionAt: now,
    days: [],
    lastPetAt: 0,
  };
}

export function createCafe(opts: {
  code: string;
  owner: { id: PlayerId; name: string };
  role?: Role;
  npcName: string;
  cafeName: string;
  now: number;
}): CafeState {
  const { now } = opts;
  const role = opts.role ?? 'barista';
  const s: CafeState = {
    schema: 1,
    code: opts.code,
    ownerId: opts.owner.id,
    inviteKey: newInviteKey(`${opts.code}:${now}`),
    npcName: opts.npcName,
    name: opts.cafeName,
    version: 1,
    createdAt: now,
    updatedAt: now,
    players: [newPlayer(opts.owner.id, opts.owner.name, 0, false, role, now), newPlayer(NPC_ID, opts.npcName, 1, true, otherRole(role), now)],
    money: CONFIG.startMoney,
    stock: { ...CONFIG.startStock },
    menu: [...START_MENU],
    featured: [...START_MENU],
    upgrades: {},
    ratingRecent: [],
    regulars: {},
    activeShifts: {},
    swap: null,
    office: null,
    applications: [],
    marketing: null,
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
  addLog(s, now, opts.owner.id, 'cafe_opened', { role });
  return s;
}

// ---------- NPC ----------

/** Роли, которые сейчас закрывает сосед: свободное место и роль надолго пропавшего напарника. */
export function npcCoveredRoles(s: CafeState, now: number): Role[] {
  const roles: Role[] = [];
  const npc = s.players.find((p) => p.isNpc);
  if (npc) roles.push(npc.role);
  const hs = humans(s);
  const someoneActive = hs.some((h) => now - h.lastActionAt < CONFIG.npcCoverActiveWindowMs);
  if (someoneActive && hs.length >= 2) {
    for (const role of ROLE_LIST) {
      const inRole = hs.filter((h) => h.role === role);
      if (inRole.length && inRole.every((h) => now - h.lastActionAt >= CONFIG.npcCoverAfterMs) && !roles.includes(role)) roles.push(role);
    }
  }
  return roles;
}

function npcShift(s: CafeState, at: number, covering: boolean) {
  const rnd = mulberry32(hashString(`${s.code}:npc:${at}`));
  let earned = 0;
  let served = 0;
  for (let i = 0; i < 4; i++) {
    const order = pick(rnd, todayMenu(s));
    if (!canMake(s.stock, order)) continue;
    consume(s.stock, order);
    earned += Math.round(DRINKS[order].price * CONFIG.npcEfficiency);
    served += 1;
    pushRating(s, 0.6);
  }
  s.money += earned;
  s.stats.earned += earned;
  s.week.points += served * 6;
  addLog(s, at, NPC_ID, covering ? 'npc_cover' : 'npc_shift', { role: 'barista', earned, served });
}

function npcRestock(s: CafeState, at: number, covering: boolean) {
  let spent = 0;
  const bought: string[] = [];
  for (const item of ['beans', 'milk'] as StockId[]) {
    const pack = STOCK_PACKS[item];
    const cost = Math.round(pack.cost * CONFIG.npcMarkup);
    if (s.stock[item] < CONFIG.npcRestockBelow && s.money >= cost && s.stock[item] + pack.amount <= capacity(s, item)) {
      s.money -= cost;
      s.stock[item] += pack.amount;
      spent += cost;
      bought.push(item);
    }
  }
  if (bought.length) addLog(s, at, NPC_ID, covering ? 'npc_cover' : 'supply_run', { role: 'manager', spent, items: bought.join(',') });
}

function npcTick(s: CafeState, at: number) {
  const npcRole = s.players.find((p) => p.isNpc)?.role;
  for (const role of npcCoveredRoles(s, at)) {
    const covering = role !== npcRole;
    if (role === 'barista') npcShift(s, at, covering);
    else npcRestock(s, at, covering);
  }
}

function pushRating(s: CafeState, v: number) {
  s.ratingRecent.push(Math.max(0, Math.min(1, v)));
  if (s.ratingRecent.length > CONFIG.ratingWindow) s.ratingRecent.splice(0, s.ratingRecent.length - CONFIG.ratingWindow);
}

// ---------- время ----------

/** Прокрутить мир до момента now: энергия, NPC, кот, неделя, напоминания. Мутирует s. */
export function advanceMut(s: CafeState, now: number) {
  if (now < s.updatedAt) now = s.updatedAt; // время не идёт назад
  for (const p of s.players) normalizeEnergy(p, now);

  let guard = 0;
  while (s.nextNpcAt <= now && guard < 8) {
    npcTick(s, s.nextNpcAt);
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

  if (s.swap && now - s.swap.at > CONFIG.swapExpiresMs) s.swap = null;
  if (s.office && s.office.until <= now) s.office = null;
  if (s.applications.some((a) => now - a.at > CONFIG.applicationExpiresMs)) {
    s.applications = s.applications.filter((a) => now - a.at <= CONFIG.applicationExpiresMs);
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
  const n = migrate(clone(s));
  advanceMut(n, now);
  return n;
}

// ---------- смена ----------

export function makeShiftPlan(s: CafeState, actor: PlayerId, now: number): ShiftPlan {
  const seed = hashString(`${s.code}:${actor}:${s.version}:${now}`);
  const rnd = mulberry32(seed);
  const n = guestsPerShift(s);
  const span = CONFIG.shiftDurationMs - 25_000;
  const patience = CONFIG.basePatienceMs + (s.upgrades.cozyHall ? 3000 : 0);
  const guests: ShiftGuest[] = [];
  for (let i = 0; i < n; i++) {
    guests.push({
      order: pick(rnd, todayMenu(s)),
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
    guests[k].order = todayMenu(s).includes(fav) ? fav : guests[k].order;
    guests[k].patienceMs += 4000; // постоянные гости терпеливее
  }
  // С собой или здесь: постоянные гости всегда садятся за столик (их истории — за столиком)
  for (const g of guests) g.takeaway = !g.regular && rnd() < CONFIG.takeawayShare;
  return { seed, startedAt: now, guests, catInCafe: catInCafe(s), tables: tablesCount(s), tipBonus: s.marketing?.tipBonus ?? 0 };
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
  cleanliness: number;
}

export function tipFor(s: CafeState, p: Player, drink: DrinkId, waitMs: number, patienceMs: number, cat: boolean, tipBonus = 0): number {
  const speed = Math.max(0, 1 - waitMs / patienceMs);
  const mult = (1 + 0.05 * level(p.baristaXp)) * (s.upgrades.machinePro ? 1.15 : 1) * (cat ? 1.1 : 1) * (1 + tipBonus);
  return Math.round(DRINKS[drink].price * 0.25 * speed * mult);
}

function resolveShift(s: CafeState, actor: PlayerId, plan: ShiftPlan, results: GuestResult[], cleanlinessIn: number | undefined, at: number): ShiftSummary {
  const p = getPlayer(s, actor)!;
  const cleanliness = Math.max(0, Math.min(1, Number.isFinite(cleanlinessIn) ? Number(cleanlinessIn) : 1));
  const byIdx = new Map<number, GuestResult>();
  for (const r of results) {
    if (Number.isInteger(r.i) && r.i >= 0 && r.i < plan.guests.length && !byIdx.has(r.i)) byIdx.set(r.i, r);
  }
  const today = dayKey(at);
  // Командный бонус: в этот день работали хотя бы двое
  const activeToday = humans(s).filter((h) => h.id === actor || h.days.includes(today)).length;
  const coop = activeToday >= 2 ? 1.2 : 1;
  const sum: ShiftSummary = { earned: 0, tips: 0, served: 0, wrong: 0, left: 0, points: 0, beats: [], noStock: 0, cleanliness };

  plan.guests.forEach((g, i) => {
    const r = byIdx.get(i);
    let outcome = r?.outcome ?? 'left';
    const wait = Math.max(0, Math.min(r?.waitMs ?? g.patienceMs, g.patienceMs));
    if (outcome !== 'left' && !canServe(s.stock, g)) {
      outcome = 'left';
      sum.noStock += 1;
    }
    let sat = 0;
    if (outcome === 'served') {
      consume(s.stock, g.order, g.takeaway);
      const tip = tipFor(s, p, g.order, wait, g.patienceMs, plan.catInCafe, plan.tipBonus ?? 0);
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
      consume(s.stock, g.order, g.takeaway);
      sum.earned += Math.round(DRINKS[g.order].price * 0.5);
      sum.wrong += 1;
      p.baristaXp += 3;
      sat = 0.3;
    } else {
      sum.left += 1;
      s.stats.guestsLost += 1;
    }
    // Грязные столики портят впечатление
    sat *= 0.8 + 0.2 * cleanliness;
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

function requireRole(p: Player, role: Role) {
  if (p.role !== role) throw new GameError('wrong_role', { role });
}

/** Убрать сотрудника (выход или увольнение). Освободившуюся роль при необходимости закрывает сосед. */
function removePlayer(s: CafeState, playerId: PlayerId, at: number) {
  const idx = s.players.findIndex((p) => p.id === playerId);
  if (idx < 0) return;
  s.players.splice(idx, 1);
  delete s.activeShifts[playerId];
  if (s.office?.by === playerId) s.office = null;
  if (s.swap && (s.swap.by === playerId || s.swap.with === playerId)) s.swap = null;
  for (const a of s.applications) a.approvals = a.approvals.filter((x) => x !== playerId);
  syncNpc(s, at);
  // Если ушёл последний, кто не одобрил заявку, — она проходит
  for (const a of [...s.applications]) tryFinalize(s, a.id, at);
}

function checkCanAdd(s: CafeState, role: Role) {
  if (humans(s).length >= CONFIG.maxStaff) throw new GameError('cafe_full', { max: CONFIG.maxStaff });
  if (roleCount(s, role) >= CONFIG.roleMax[role]) throw new GameError('role_full', { role, max: CONFIG.roleMax[role] });
}

/** Принять заявку, если её одобрили все текущие сотрудники. Возвращает true, если человек принят. */
function tryFinalize(s: CafeState, appId: PlayerId, at: number): boolean {
  const app = s.applications.find((a) => a.id === appId);
  if (!app) return false;
  const all = humans(s).every((h) => app.approvals.includes(h.id));
  if (!all) return false;
  try {
    checkCanAdd(s, app.role);
  } catch {
    return false;
  }
  s.applications = s.applications.filter((a) => a.id !== appId);
  s.players.push(newPlayer(app.id, app.name, s.players.length, false, app.role, at));
  syncNpc(s, at);
  addLog(s, at, app.id, 'staff_joined', { name: app.name, role: app.role });
  return true;
}

function holdOffice(s: CafeState, actor: PlayerId, at: number) {
  const holder = officeHolder(s, actor, at);
  if (holder) throw new GameError('office_busy', { name: holder.name });
  s.office = { by: actor, until: at + CONFIG.officeHoldMs };
}

const MANAGER_COMMANDS = new Set(['supplyRun', 'unlockDrink', 'toggleFeatured', 'buyUpgrade', 'launchMarketing']);
const BARISTA_COMMANDS = new Set(['startShift', 'finishShift', 'abandonShift']);

export function apply(state: CafeState, env: CommandEnvelope): ApplyResult {
  const s = migrate(clone(state));
  const { actor, at, cmd } = env;
  advanceMut(s, at);
  const out: ApplyResult = { state: s };

  if (cmd.type === 'join') {
    // Повторный вход уже принятого сотрудника (обновляем имя). Новые люди приходят через заявку.
    const existing = getPlayer(s, cmd.player.id);
    if (!existing || existing.isNpc) throw new GameError('apply_required');
    existing.name = cmd.player.name || existing.name;
    bump(s, at);
    return out;
  }

  if (cmd.type === 'apply') {
    if (getPlayer(s, cmd.player.id)) throw new GameError('already_member');
    if (cmd.key !== s.inviteKey) throw new GameError('invite_expired');
    if (!ROLE_LIST.includes(cmd.role)) throw new GameError('bad_item');
    const existingApp = s.applications.find((a) => a.id === cmd.player.id);
    if (existingApp) {
      // Передумал с ролью — заявка начинается заново
      s.applications = s.applications.filter((a) => a.id !== cmd.player.id);
    } else if (s.applications.length >= CONFIG.maxPendingApplications) {
      throw new GameError('too_many_applications');
    }
    checkCanAdd(s, cmd.role);
    const name = (cmd.player.name || '').trim().slice(0, 30) || '?';
    s.applications.push({ id: cmd.player.id, name, role: cmd.role, at, approvals: [] });
    addLog(s, at, 'system', 'application_new', { name, role: cmd.role });
    bump(s, at);
    return out;
  }

  if (cmd.type === 'cancelApplication') {
    if (!s.applications.some((a) => a.id === actor)) throw new GameError('no_application');
    s.applications = s.applications.filter((a) => a.id !== actor);
    bump(s, at);
    return out;
  }

  const p = getPlayer(s, actor);
  if (!p || p.isNpc) throw new GameError('not_member');
  if (MANAGER_COMMANDS.has(cmd.type)) {
    requireRole(p, 'manager');
    holdOffice(s, actor, at); // кабинет один: пока там другой менеджер, войти нельзя
  }
  if (BARISTA_COMMANDS.has(cmd.type)) requireRole(p, 'barista');
  if (cmd.type !== 'seen') p.lastActionAt = at;

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
        out.shiftPlan = prev; // возобновляем незавершённую смену без повторной траты сил
        return out;
      }
      const busy = counterHolder(s, actor, at);
      if (busy) throw new GameError('counter_busy', { name: busy.name });
      spendEnergy(p, at);
      const plan = makeShiftPlan(s, actor, at);
      s.activeShifts[actor] = plan;
      if (s.marketing) {
        s.marketing.shiftsLeft -= 1;
        if (s.marketing.shiftsLeft <= 0) s.marketing = null;
      }
      out.shiftPlan = plan;
      break;
    }
    case 'finishShift': {
      const plan = s.activeShifts[actor];
      if (!plan) throw new GameError('no_shift');
      out.summary = resolveShift(s, actor, plan, cmd.results, cmd.cleanliness, at);
      delete s.activeShifts[actor];
      markDay(p, at);
      break;
    }
    case 'abandonShift': {
      const plan = s.activeShifts[actor];
      if (!plan) throw new GameError('no_shift');
      out.summary = resolveShift(s, actor, plan, [], 1, at);
      delete s.activeShifts[actor];
      break;
    }
    case 'supplyRun': {
      // Одна поездка к поставщику = 1 сила, сколько угодно упаковок в пределах склада и денег
      const entries = (Object.entries(cmd.items ?? {}) as [StockId, number][]).filter(([k, n]) => STOCK_PACKS[k] && Number.isInteger(n) && n > 0);
      if (!entries.length) throw new GameError('empty_order');
      let cost = 0;
      for (const [k, n] of entries) {
        const cap = capacity(s, k);
        if (s.stock[k] + STOCK_PACKS[k].amount * n > cap) throw new GameError('capacity', { cap });
        cost += packPrice(s, actor, k) * n;
      }
      requireMoney(s, cost);
      spendEnergy(p, at, CONFIG.managerTaskCost);
      s.money -= cost;
      for (const [k, n] of entries) s.stock[k] += STOCK_PACKS[k].amount * n;
      p.managerXp += 10 * entries.length;
      markDay(p, at);
      addLog(s, at, actor, 'supply_run', { cost, items: entries.map(([k, n]) => `${k}:${n}`).join(',') });
      break;
    }
    case 'buyUpgrade': {
      const up = UPGRADES[cmd.id];
      if (!up) throw new GameError('bad_item');
      if (s.upgrades[cmd.id]) throw new GameError('owned');
      requireMoney(s, up.cost);
      spendEnergy(p, at, CONFIG.managerTaskCost);
      s.money -= up.cost;
      s.upgrades[cmd.id] = true;
      p.managerXp += 25;
      markDay(p, at);
      addLog(s, at, actor, 'upgrade_bought', { id: cmd.id });
      break;
    }
    case 'launchMarketing': {
      const m = MARKETING[cmd.id];
      if (!m) throw new GameError('bad_item');
      if (s.marketing) throw new GameError('marketing_active');
      requireMoney(s, m.cost);
      spendEnergy(p, at, CONFIG.managerTaskCost);
      s.money -= m.cost;
      s.marketing = { id: cmd.id, guests: m.guests, tipBonus: m.tipBonus, shiftsLeft: m.shifts };
      p.managerXp += 15;
      markDay(p, at);
      addLog(s, at, actor, 'marketing_launched', { id: cmd.id });
      break;
    }
    case 'unlockDrink': {
      // Меню — решение, а не работа: силы не тратит
      const d = DRINKS[cmd.id];
      if (!d) throw new GameError('bad_item');
      if (s.menu.includes(cmd.id)) throw new GameError('owned');
      requireMoney(s, d.unlockCost);
      s.money -= d.unlockCost;
      s.menu.push(cmd.id);
      if (s.featured.length < CONFIG.menuSlots) s.featured.push(cmd.id);
      p.managerXp += 15;
      markDay(p, at);
      addLog(s, at, actor, 'drink_unlocked', { id: cmd.id });
      break;
    }
    case 'toggleFeatured': {
      if (!s.menu.includes(cmd.id)) throw new GameError('bad_item');
      if (s.featured.includes(cmd.id)) {
        if (s.featured.length <= 1) throw new GameError('menu_min');
        s.featured = s.featured.filter((d) => d !== cmd.id);
      } else {
        if (s.featured.length >= CONFIG.menuSlots) throw new GameError('menu_full', { max: CONFIG.menuSlots });
        s.featured.push(cmd.id);
      }
      bump(s, at);
      return out;
    }
    case 'proposeSwap': {
      if (s.activeShifts[actor] || s.office?.by === actor) throw new GameError('shift_in_progress');
      const others = s.players.filter((x) => x.id !== actor && x.role !== p.role);
      const target = cmd.with ? others.find((x) => x.id === cmd.with) : others.find((x) => x.isNpc) ?? (others.length === 1 ? others[0] : undefined);
      if (!target) throw new GameError('no_partner');
      if (target.isNpc) {
        // Сосед всегда согласен
        [p.role, target.role] = [target.role, p.role];
        s.swap = null;
        syncNpc(s, at);
        addLog(s, at, actor, 'swap_accepted', { role: p.role });
        break;
      }
      if (shiftLive(s.activeShifts[target.id], at) || s.office?.by === target.id) throw new GameError('shift_in_progress');
      if (s.swap?.by === actor) throw new GameError('swap_pending');
      s.swap = { by: actor, with: target.id, at };
      addLog(s, at, actor, 'swap_proposed', { name: target.name });
      break;
    }
    case 'acceptSwap': {
      if (!s.swap || s.swap.with !== actor) throw new GameError('no_swap');
      const proposer = getPlayer(s, s.swap.by);
      if (!proposer || proposer.isNpc || proposer.role === p.role) {
        s.swap = null;
        throw new GameError('no_swap');
      }
      if (shiftLive(s.activeShifts[actor], at) || shiftLive(s.activeShifts[proposer.id], at)) throw new GameError('shift_in_progress');
      [p.role, proposer.role] = [proposer.role, p.role];
      s.swap = null;
      if (s.office && (s.office.by === actor || s.office.by === proposer.id)) s.office = null;
      addLog(s, at, actor, 'swap_accepted', { role: p.role });
      break;
    }
    case 'declineSwap': {
      if (!s.swap || (s.swap.by !== actor && s.swap.with !== actor)) throw new GameError('no_swap');
      const by = s.swap.by;
      s.swap = null;
      addLog(s, at, actor, 'swap_declined', { cancelledBy: by === actor ? 1 : 0 });
      break;
    }
    case 'switchRole': {
      if (!ROLE_LIST.includes(cmd.role) || cmd.role === p.role) throw new GameError('bad_item');
      if (shiftLive(s.activeShifts[actor], at) || s.office?.by === actor) throw new GameError('shift_in_progress');
      if (roleCount(s, cmd.role) >= CONFIG.roleMax[cmd.role]) throw new GameError('role_full', { role: cmd.role, max: CONFIG.roleMax[cmd.role] });
      // Минимум: в каждой роли хотя бы один человек (если ты здесь не один — тогда роль займёт сосед)
      if (roleCount(s, p.role) === 1 && humans(s).length > 1) throw new GameError('last_in_role', { role: p.role });
      p.role = cmd.role;
      if (s.swap && (s.swap.by === actor || s.swap.with === actor)) s.swap = null;
      syncNpc(s, at);
      addLog(s, at, actor, 'role_switched', { role: p.role });
      break;
    }
    case 'approveApplication': {
      const app = s.applications.find((a) => a.id === cmd.id);
      if (!app) throw new GameError('no_application');
      if (!app.approvals.includes(actor)) app.approvals.push(actor);
      if (!tryFinalize(s, app.id, at)) {
        // все одобрили, но мест уже нет — сообщаем
        if (humans(s).every((h) => app.approvals.includes(h.id))) checkCanAdd(s, app.role);
      }
      break;
    }
    case 'rejectApplication': {
      const app = s.applications.find((a) => a.id === cmd.id);
      if (!app) throw new GameError('no_application');
      s.applications = s.applications.filter((a) => a.id !== cmd.id);
      addLog(s, at, actor, 'application_rejected', { name: app.name });
      break;
    }
    case 'removeStaff': {
      if (actor !== s.ownerId) throw new GameError('owner_only');
      const target = getPlayer(s, cmd.id);
      if (!target || target.isNpc || target.id === actor) throw new GameError('no_partner');
      removePlayer(s, target.id, at);
      addLog(s, at, actor, 'staff_removed', { name: target.name });
      break;
    }
    case 'leaveCafe': {
      if (actor === s.ownerId) throw new GameError('owner_cannot_leave');
      const name = p.name;
      removePlayer(s, actor, at);
      addLog(s, at, 'system', 'partner_left', { name });
      bump(s, at);
      return out;
    }
    case 'enterOffice': {
      requireRole(p, 'manager');
      holdOffice(s, actor, at);
      bump(s, at);
      return out;
    }
    case 'leaveOffice': {
      if (s.office?.by === actor) s.office = null;
      bump(s, at);
      return out;
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
    case 'debugUnlockRoom': {
      // Отладка: открыть квартиру над кофейней, не выполняя цель (3★ и 8 смен)
      if (s.room.unlocked) throw new GameError('owned');
      s.room.unlocked = true;
      addLog(s, at, 'system', 'room_unlocked');
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

/** Старые сохранения (до ролей) приводим к новой схеме. */
export function migrate(s: CafeState): CafeState {
  const x = s as CafeState & Partial<Pick<CafeState, 'ownerId' | 'inviteKey' | 'npcName' | 'swap' | 'marketing'>>;
  if (!x.ownerId) x.ownerId = x.players.find((p) => !p.isNpc)?.id ?? '';
  if (!x.inviteKey) x.inviteKey = newInviteKey(`${x.code}:migrate`);
  if (!x.npcName) x.npcName = x.players.find((p) => p.isNpc)?.name ?? 'Сосед Артур';
  if (x.swap === undefined) x.swap = null;
  if (x.swap && !(x.swap as { with?: string }).with) {
    const other = x.players.find((p) => p.id !== x.swap!.by);
    x.swap = other ? { ...x.swap, with: other.id } : null;
  }
  if ((x as Partial<CafeState>).office === undefined) x.office = null;
  if (!Array.isArray((x as Partial<CafeState>).applications)) x.applications = [];
  if (x.marketing === undefined) x.marketing = null;
  if (x.stock.cups === undefined) x.stock.cups = CONFIG.startStock.cups;
  if (!Array.isArray((x as Partial<CafeState>).featured)) x.featured = x.menu.slice(0, CONFIG.menuSlots);
  x.players.forEach((p, i) => {
    if (!p.role) p.role = i === 0 ? 'barista' : 'manager';
    if (!p.lastActionAt) p.lastActionAt = p.lastSeenAt;
  });
  if (x.players.length === 2 && x.players[0].role === x.players[1].role) x.players[1].role = otherRole(x.players[0].role);
  return x;
}
