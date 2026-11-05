// Ядро игры: чистые функции без DOM и сети. Один и тот же код работает
// в браузере (локальный режим) и на сервере (Supabase Edge Function).
import {
  CONFIG,
  DECOR_BY_ID,
  WALLPAPER_BY_ID,
  defaultWallpaper,
  DRINKS,
  DRINK_LIST,
  DESSERTS,
  DESSERT_ORDER,
  DESSERT_SHELF_MS,
  FRIDGE_KINDS,
  VITRINE_KINDS,
  emptyStock,
  inSeason,
  recipeUsage,
  type Audience,
  type DessertId,
  type MilkKind,
  MARKETING,
  REGULARS,
  REGULAR_ORDER,
  START_MENU,
  STOCK_PACKS,
  CAFE_SLOTS,
  SLOT_MAX,
  CAFE_DECOR_BY_ID,
  CAFE_DECOR_TO_HALL,
  HALL_BY_ID,
  HALL_FLOORS,
  HALL_FLOOR_BY_ID,
  HALL_START,
  HALL_WALLS,
  HALL_WALL_BY_ID,
  DEFAULT_LOGO,
  GEM_PACKS,
  cleanCafeName,
  cleanLogo,
  ROOM_SLOTS,
  type CafeSlot,
  type Logo,
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
  type ShiftSegment,
  type BrandProposal,
  type HomeRoom,
  type HallState,
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
  return !!plan && at - plan.startedAt < (plan.durationMs ?? CONFIG.shiftMaxMs) + 60_000;
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

// ---------- бодрость и счастье ----------

/** Что даёт квартира игроку: общие комнаты (зал, кухня) — всем, личная — хозяину. */
export function homeEffects(s: CafeState, playerId: PlayerId) {
  let rest = 0;
  let joy = 0;
  let shiftCut = 0;
  for (const r of Object.values(s.home?.rooms ?? {})) {
    if (!r.open) continue;
    if (r.kind === 'bedroom' && r.owner !== playerId) continue;
    for (const id of Object.values(r.placed)) {
      const d = id ? DECOR_BY_ID[id] : undefined;
      if (!d) continue;
      rest += d.rest;
      joy += d.joy;
      shiftCut += d.shiftCut;
    }
    joy += WALLPAPER_BY_ID[r.wallpaper ?? '']?.joy ?? 0;
  }
  const catJoy = s.cat ? Math.round((s.cat.mood / 100) * 8) : 0;
  const totalJoy = joy + catJoy;
  return {
    rest,
    joy: totalJoy,
    restPerMin: CONFIG.energyRegenPerMin + rest,
    joyCap: Math.min(CONFIG.happyMax, CONFIG.happyBaseCap + totalJoy),
    joyRate: CONFIG.happyRegenPerMin + totalJoy * CONFIG.happyJoyRatePerPoint,
    shiftCut,
  };
}

/** Сколько бодрости стоит смена этому игроку (кухня может удешевить). */
export function shiftCost(s: CafeState, p: Player): number {
  return Math.max(CONFIG.shiftEnergyMin, CONFIG.shiftEnergy - homeEffects(s, p.id).shiftCut);
}

/** Бодрость и счастье на момент now (без записи). Счастье тянется к потолку уюта, выше потолка — медленно опускается. */
export function vitalsNow(s: CafeState, p: Player, now: number) {
  const e = homeEffects(s, p.id);
  const min = Math.max(0, now - (p.vitalsAt ?? now)) / 60_000;
  const energy = Math.min(CONFIG.energyMax, (p.energy ?? CONFIG.energyMax) + e.restPerMin * min);
  let happy = p.happy ?? CONFIG.happyStart;
  happy = happy < e.joyCap ? Math.min(e.joyCap, happy + e.joyRate * min) : Math.max(e.joyCap, happy - e.joyRate * min);
  const full = energy >= CONFIG.energyMax ? 0 : ((CONFIG.energyMax - energy) / e.restPerMin) * 60_000;
  return { ...e, energy, happy, shiftCost: shiftCost(s, p), fullInMs: full };
}

/** Совместимость с интерфейсом: бодрость и когда наберётся полная. */
export function energyNow(s: CafeState, p: Player, now: number): { energy: number; fullInMs: number } {
  const v = vitalsNow(s, p, now);
  return { energy: v.energy, fullInMs: v.fullInMs };
}

function syncVitals(s: CafeState, p: Player, now: number) {
  if (p.isNpc) return;
  const v = vitalsNow(s, p, now);
  p.energy = v.energy;
  p.happy = v.happy;
  p.vitalsAt = now;
}

function spendEnergy(s: CafeState, p: Player, now: number, amount: number) {
  syncVitals(s, p, now);
  if (p.energy < amount - 1e-9) throw new GameError('no_energy', { need: amount });
  p.energy = Math.max(0, p.energy - amount);
}

function changeHappy(s: CafeState, p: Player, now: number, delta: number) {
  syncVitals(s, p, now);
  p.happy = Math.max(0, Math.min(CONFIG.happyMax, p.happy + delta));
}

/** Радость от записок и подарков — не больше дневного лимита на получателя. */
function giveSocialJoy(s: CafeState, p: Player, now: number, amount: number): number {
  const day = dayKey(now);
  if (p.socialDay !== day) {
    p.socialDay = day;
    p.socialJoy = 0;
  }
  const got = Math.max(0, Math.min(amount, CONFIG.socialJoyDailyCap - p.socialJoy));
  if (got > 0) {
    p.socialJoy += got;
    changeHappy(s, p, now, got);
  }
  return got;
}

/** Множитель оценки гостя от счастья баристы: 50 → 1, 100 → +18%, 0 → −18%. */
export function happyRatingMult(happy: number): number {
  return 1 + CONFIG.happyRatingSpan * ((Math.max(0, Math.min(100, happy)) - 50) / 50);
}

/** Зарплата: половина выручки поровну всем сотрудникам, остальное — бюджет. Возвращает долю на человека. */
function payout(s: CafeState, earned: number): number {
  const hs = humans(s);
  if (!hs.length || earned <= 0) {
    s.money += earned;
    return 0;
  }
  const each = Math.floor((earned * CONFIG.salaryShare) / hs.length);
  for (const h of hs) h.wallet = (h.wallet ?? 0) + each;
  s.money += earned - each * hs.length;
  return each;
}

// ---------- квартира ----------

export const roomCost = (r: HomeRoom) => (r.kind === 'kitchen' ? CONFIG.kitchenCost : r.kind === 'bedroom' ? CONFIG.bedroomCost : 0);

/** Комнаты квартиры: зал (открыт), кухня и личная комната каждого сотрудника. */
export function ensureHome(s: CafeState) {
  if (!s.home) s.home = { rooms: {} };
  const rooms = s.home.rooms;
  if (!rooms.hall) {
    rooms.hall = { kind: 'hall', open: true, fund: 0, owned: s.room?.owned ?? [], placed: s.room?.placed ?? {} };
  }
  if (!rooms.kitchen) rooms.kitchen = { kind: 'kitchen', open: false, fund: 0, owned: [], placed: {} };
  for (const h of humans(s)) {
    const key = `bed:${h.id}`;
    if (!rooms[key]) rooms[key] = { kind: 'bedroom', owner: h.id, open: false, fund: 0, owned: [], placed: {} };
  }
  // Комнаты ушедших сотрудников убираем
  for (const key of Object.keys(rooms)) {
    const r = rooms[key];
    if (r.kind === 'bedroom' && !humans(s).some((h) => h.id === r.owner)) delete rooms[key];
  }
}

/** Порядок комнат для листания: общие, потом своя, потом остальных. */
export function roomOrder(s: CafeState, meId: PlayerId): string[] {
  const keys = Object.keys(s.home?.rooms ?? {});
  const beds = keys.filter((k) => k.startsWith('bed:'));
  const mine = beds.filter((k) => k === `bed:${meId}`);
  const others = beds.filter((k) => k !== `bed:${meId}`);
  return ['hall', 'kitchen', ...mine, ...others].filter((k) => keys.includes(k));
}

function getRoom(s: CafeState, key: string | undefined): HomeRoom {
  const r = s.home.rooms[key ?? 'hall'];
  if (!r) throw new GameError('bad_room');
  return r;
}

// ---------- рейтинг, ворота, склад ----------

export function rating(s: CafeState): number | null {
  if (s.ratingRecent.length < CONFIG.ratingMinGuests) return null;
  const avg = s.ratingRecent.reduce((a, b) => a + b, 0) / s.ratingRecent.length;
  return Math.round(avg * 50) / 10; // 0..5 с шагом 0.1
}


export function capacity(s: CafeState, item: StockId): number {
  if (item === 'catFood') return 999;
  return CONFIG.storageCapacity[slotLevel(s, 'storage') - 1];
}

export function packPrice(s: CafeState, actor: PlayerId, item: StockId): number {
  const p = getPlayer(s, actor);
  const lvl = p ? level(p.managerXp) : 0;
  const discount = Math.min(CONFIG.managerDiscountMax, lvl * CONFIG.managerDiscountPerLevel);
  return Math.round(STOCK_PACKS[item].cost * (1 - discount));
}

/** Уровень слота кофейни (1..3). */
export function slotLevel(s: CafeState, slot: CafeSlot): number {
  return Math.min(SLOT_MAX, Math.max(1, s.levels?.[slot] ?? 1));
}

/** Что дают уровни кофейни — одно место для баланса (клиент и сервер). */
export function slotEffects(s: CafeState) {
  const m = slotLevel(s, 'machine');
  let decorPatience = 0;
  let decorSat = 0;
  for (const id of Object.values(s.hall?.placed ?? {})) {
    const d = id ? HALL_BY_ID[id] : undefined;
    if (!d) continue;
    decorPatience += d.patienceMs;
    decorSat += d.sat;
  }
  decorSat += (HALL_WALL_BY_ID[s.hall?.wall ?? '']?.sat ?? 0) + (HALL_FLOOR_BY_ID[s.hall?.floor ?? '']?.sat ?? 0);
  return {
    /** Сколько эспрессо пролить сразу: на однорожковой двойной идёт в два пролива. */
    machineHeads: m >= 2 ? 2 : 1,
    shotMs: [2000, 1600, 1000][m - 1],
    steamMs: [1800, 1300, 800][m - 1],
    whipMs: 1200,
    waterMs: [1600, 1200, 500][m - 1],
    milks: FRIDGE_KINDS[slotLevel(s, 'fridge') - 1],
    dessertKinds: VITRINE_KINDS[slotLevel(s, 'vitrine') - 1],
    satBonus: decorSat,
    patienceMs: decorPatience,
  };
}

/** Виды молока и сливок в холодильнике. */
export function availableMilks(s: CafeState): MilkKind[] {
  return FRIDGE_KINDS[slotLevel(s, 'fridge') - 1];
}

/** Десерты, которые сейчас лежат на витрине. */
export function vitrineDesserts(s: CafeState): DessertId[] {
  return DESSERT_ORDER.filter((d) => (s.stock[`ds_${d}`] ?? 0) > 0);
}

/** Какие аудитории покрывает меню дня: от этого зависит, сколько гостей придёт. */
export function audiences(s: CafeState, now = s.updatedAt) {
  const menu = todayMenu(s, now);
  const has = (a: Audience) => menu.some((d) => DRINKS[d].audience === a);
  return {
    black: has('black'),
    milky: has('milky'),
    sweet: has('sweet'),
    plant: availableMilks(s).length > 1 && menu.some((d) => !!DRINKS[d].recipe.dairy),
    desserts: vitrineDesserts(s).length > 0,
    season: menu.some((d) => !!DRINKS[d].season),
  };
}

export const AUDIENCE_GUESTS = { black: 1, milky: 2, sweet: 2, plant: 1, desserts: 1, season: 1 };

export function guestsPerShift(s: CafeState, now = s.updatedAt): number {
  const a = audiences(s, now);
  let n = CONFIG.shiftBaseGuests;
  for (const k of Object.keys(AUDIENCE_GUESTS) as (keyof typeof AUDIENCE_GUESTS)[]) if (a[k]) n += AUDIENCE_GUESTS[k];
  n += s.marketing?.guests ?? 0;
  return Math.min(CONFIG.shiftGuestCap, n);
}

export function canMake(stock: Record<StockId, number>, drink: DrinkId, milk: MilkKind = 'regular'): boolean {
  const use = recipeUsage(drink, milk);
  return (Object.keys(use) as StockId[]).every((k) => (stock[k] ?? 0) >= (use[k] ?? 0));
}

function guestUsage(g: ShiftGuest): Partial<Record<StockId, number>> {
  const use = recipeUsage(g.order, g.milk ?? 'regular', g.takeaway);
  if (g.dessert) use[`ds_${g.dessert}`] = (use[`ds_${g.dessert}`] ?? 0) + 1;
  return use;
}

function consume(stock: Record<StockId, number>, g: ShiftGuest) {
  const use = guestUsage(g);
  for (const k of Object.keys(use) as StockId[]) stock[k] = (stock[k] ?? 0) - (use[k] ?? 0);
}

/** Хватит ли склада на заказ гостя (стакан с собой и десерт — тоже). */
export function canServe(stock: Record<StockId, number>, g: ShiftGuest): boolean {
  const use = guestUsage(g);
  return (Object.keys(use) as StockId[]).every((k) => (stock[k] ?? 0) >= (use[k] ?? 0));
}

/** Сколько платит гость: напиток + альтернативное молоко + десерт. */
export function guestPrice(g: ShiftGuest): number {
  const alt = DRINKS[g.order].recipe.dairy && g.milk && g.milk !== 'regular' ? CONFIG.altMilkPrice : 0;
  return DRINKS[g.order].price + alt + (g.dessert ? DESSERTS[g.dessert].price : 0);
}

/** Меню дня без несезонных напитков; если пусто — всё открытое меню в сезоне. */
export function todayMenu(s: CafeState, now = s.updatedAt): DrinkId[] {
  const ok = (d: DrinkId) => !!DRINKS[d] && s.menu.includes(d) && inSeason(d, now);
  const f = (s.featured ?? []).filter(ok);
  if (f.length) return f;
  const all = s.menu.filter(ok);
  return all.length ? all : s.menu.filter((d) => !!DRINKS[d]).slice(0, 1);
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
    happy: CONFIG.happyStart,
    vitalsAt: now,
    wallet: isNpc ? 0 : CONFIG.walletStart,
    socialDay: '',
    socialJoy: 0,
    gems: isNpc ? 0 : CONFIG.gemsStart,
    daily: { day: '', actions: 0, done: false },
    points: { day: '', today: 0, week: '', thisWeek: 0, all: 0 },
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
  logo?: Logo;
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
    name: cleanCafeName(opts.cafeName) ?? 'Наше место',
    logo: cleanLogo(opts.logo ?? DEFAULT_LOGO),
    brands: [],
    version: 1,
    createdAt: now,
    updatedAt: now,
    players: [newPlayer(opts.owner.id, opts.owner.name, 0, false, role, now), newPlayer(NPC_ID, opts.npcName, 1, true, otherRole(role), now)],
    money: CONFIG.startMoney,
    stock: { ...CONFIG.startStock },
    menu: [...START_MENU],
    featured: [...START_MENU],
    upgrades: {},
    levels: { machine: 1, fridge: 1, storage: 1, vitrine: 1 },
    dessertFresh: {},
    hall: newHall(),
    ratingRecent: [],
    regulars: {},
    activeShifts: {},
    swap: null,
    office: null,
    applications: [],
    marketing: null,
    home: { rooms: {} },
    cat: null,
    board: [],
    log: [],
    logSeq: 0,
    week: { id: weekId(now), points: 0 },
    today: { day: dayKey(now), points: 0 },
    stats: { shifts: 0, guestsServed: 0, guestsLost: 0, earned: 0, points: 0 },
    nextNpcAt: now + CONFIG.npcShiftEveryMs,
    alerts: { stockLowAt: 0, catHungryAt: 0 },
  };
  ensureHome(s);
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
    const order = pick(rnd, todayMenu(s, at));
    const g: ShiftGuest = { order, milk: 'regular', patienceMs: 0, arriveMs: 0 };
    if (!canServe(s.stock, g)) continue;
    consume(s.stock, g);
    earned += Math.round(DRINKS[order].price * CONFIG.npcEfficiency);
    served += 1;
    pushRating(s, 0.6);
  }
  payout(s, earned);
  s.stats.earned += earned;
  addPoints(s, null, served * 6, at);
  addLog(s, at, NPC_ID, covering ? 'npc_cover' : 'npc_shift', { role: 'barista', earned, served });
}

function npcRestock(s: CafeState, at: number, covering: boolean) {
  let spent = 0;
  const bought: string[] = [];
  for (const item of ['beans', 'milk_regular'] as StockId[]) {
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
  ensureHome(s);
  for (const p of s.players) syncVitals(s, p, now);

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

  if ((s.stock.beans < 5 || s.stock.milk_regular < 5) && now - s.alerts.stockLowAt > 6 * HOUR) {
    s.alerts.stockLowAt = now;
    addLog(s, now, 'system', 'stock_low', { beans: s.stock.beans, milk: s.stock.milk_regular });
  }

  // Десерты лежат сутки: что не продали — списываем
  const gone: string[] = [];
  for (const d of DESSERT_ORDER) {
    const until = s.dessertFresh?.[d];
    if (until && until <= now) {
      if ((s.stock[`ds_${d}`] ?? 0) > 0) gone.push(`${d}:${s.stock[`ds_${d}`]}`);
      s.stock[`ds_${d}`] = 0;
      delete s.dessertFresh[d];
    }
  }
  if (gone.length) addLog(s, now, 'system', 'desserts_expired', { items: gone.join(',') });

  if (s.swap && now - s.swap.at > CONFIG.swapExpiresMs) s.swap = null;
  if (s.office && s.office.until <= now) s.office = null;
  if (s.applications.some((a) => now - a.at > CONFIG.applicationExpiresMs)) {
    s.applications = s.applications.filter((a) => now - a.at <= CONFIG.applicationExpiresMs);
  }

  const wk = weekId(now);
  if (wk !== s.week.id) s.week = { id: wk, points: 0 };

  s.updatedAt = now;
}

export function advance(s: CafeState, now: number): CafeState {
  const n = migrate(clone(s));
  advanceMut(n, now);
  return n;
}

// ---------- смена ----------

/** Отрезки смены: пики и затишья. Иногда вечерний пик вместо утреннего. */
export function shiftSegments(rnd: () => number): ShiftSegment[] {
  if (rnd() < 0.25) {
    return [
      { kind: 'morning', share: 0.2, density: 0.7 },
      { kind: 'day', share: 0.25, density: 0.5 },
      { kind: 'lunch', share: 0.25, density: 2 },
      { kind: 'evening', share: 0.3, density: 2 },
    ];
  }
  return [
    { kind: 'morning', share: 0.2, density: 2 },
    { kind: 'day', share: 0.25, density: 0.5 },
    { kind: 'lunch', share: 0.25, density: 2 },
    { kind: 'evening', share: 0.3, density: 0.7 },
  ];
}

export function shiftDuration(n: number): number {
  return Math.max(CONFIG.shiftMinMs, Math.min(CONFIG.shiftMaxMs, n * CONFIG.shiftMsPerGuest));
}

/** Время прихода n гостей по волнам: в пиках плотнее, в затишьях реже. */
export function waveArrivals(n: number, durationMs: number, segs: ShiftSegment[], rnd: () => number): number[] {
  const window = durationMs * CONFIG.shiftLastArrival;
  const w = segs.map((g) => g.share * g.density);
  const sum = w.reduce((a, b) => a + b, 0);
  const exact = w.map((x) => (x / sum) * n);
  const counts = exact.map(Math.floor);
  let left = n - counts.reduce((a, b) => a + b, 0);
  const order = exact.map((x, i) => [x - Math.floor(x), i]).sort((a, b) => b[0] - a[0]);
  for (let k = 0; left > 0; k++, left--) counts[order[k % order.length][1]] += 1;
  const out: number[] = [];
  let start = 0;
  segs.forEach((g, i) => {
    const len = g.share * window;
    for (let j = 0; j < counts[i]; j++) out.push(Math.round(start + ((j + 0.15 + rnd() * 0.7) / counts[i]) * len));
    start += len;
  });
  out.sort((a, b) => a - b);
  if (out.length) out[0] = 0; // первый гость — сразу
  return out;
}

const ALT_MILKS: [MilkKind, number][] = [
  ['oat', 0.5],
  ['lactoFree', 0.3],
  ['coconut', 0.2],
];

function weighted<T>(rnd: () => number, items: [T, number][]): T {
  const total = items.reduce((a, [, w]) => a + w, 0);
  let r = rnd() * total;
  for (const [x, w] of items) {
    r -= w;
    if (r <= 0) return x;
  }
  return items[items.length - 1][0];
}

export function makeShiftPlan(s: CafeState, actor: PlayerId, now: number): ShiftPlan {
  const seed = hashString(`${s.code}:${actor}:${s.version}:${now}`);
  const rnd = mulberry32(seed);
  const menu = todayMenu(s, now);
  const nominal = guestsPerShift(s, now);
  const aud = audiences(s, now);
  const milks = availableMilks(s);
  const patience = CONFIG.basePatienceMs + slotEffects(s).patienceMs;
  const segs = shiftSegments(rnd);
  const walkouts = { noDrink: 0, noMilk: 0 };
  // Сколько десертов каждого вида ещё есть (чтобы гости не заказали больше, чем лежит)
  const vit: Record<string, number> = {};
  for (const d of DESSERT_ORDER) vit[d] = s.stock[`ds_${d}`] ?? 0;
  const vitList = () => DESSERT_ORDER.filter((d) => vit[d] > 0);

  // Кто пришёл: базовые гости — из покрытых аудиторий; «растительные» и «десертные» — сверху
  const audW: [Audience, number][] = (['black', 'milky', 'sweet'] as Audience[]).filter((a) => aud[a]).map((a) => [a, AUDIENCE_GUESTS[a]]);
  if (!audW.length) audW.push([DRINKS[menu[0]].audience, 1]);
  const extraPlant = aud.plant ? AUDIENCE_GUESTS.plant : 0;
  const extraDessert = aud.desserts ? AUDIENCE_GUESTS.desserts : 0;
  const guests: ShiftGuest[] = [];
  for (let i = 0; i < nominal; i++) {
    const forcedPlant = i >= nominal - extraPlant - extraDessert && i < nominal - extraDessert;
    const forcedDessert = i >= nominal - extraDessert;
    let audience = weighted(rnd, audW);
    if (forcedPlant && audience === 'black') audience = aud.milky ? 'milky' : 'sweet';
    // Желаемый напиток — из всего каталога этой аудитории (в сезоне), по популярности
    const pool = DRINK_LIST.filter((d) => d.audience === audience && inSeason(d.id, now) && (!forcedPlant || d.recipe.dairy));
    const want = weighted(rnd, pool.map((d) => [d.id, d.pop] as [DrinkId, number]));
    let order = want;
    let substitute = false;
    if (!menu.includes(want)) {
      if (rnd() >= CONFIG.substituteShare) {
        walkouts.noDrink += 1;
        continue;
      }
      const same = menu.filter((d) => DRINKS[d].audience === audience);
      const from = (same.length ? same : menu).filter((d) => !forcedPlant || DRINKS[d].recipe.dairy);
      const list = from.length ? from : menu;
      order = weighted(rnd, list.map((d) => [d, DRINKS[d].pop] as [DrinkId, number]));
      substitute = true;
    }
    const g: ShiftGuest = { order, milk: 'regular', patienceMs: patience + Math.round(rnd() * 4000), arriveMs: 0 };
    if (substitute) g.substitute = true;
    if (DRINKS[order].recipe.dairy) {
      let wantMilk: MilkKind = 'regular';
      if (forcedPlant) wantMilk = weighted(rnd, ALT_MILKS.filter(([k]) => milks.includes(k)));
      else if (rnd() < CONFIG.altMilkShare) wantMilk = weighted(rnd, ALT_MILKS);
      if (milks.includes(wantMilk)) g.milk = wantMilk;
      else {
        if (rnd() < CONFIG.noMilkLeave) {
          walkouts.noMilk += 1;
          continue;
        }
        g.milkSwap = wantMilk;
      }
    }
    // Десерт: любимый из 16; нет на витрине — часть берёт другой
    const wantsDessert = forcedDessert || rnd() < CONFIG.dessertWant;
    if (wantsDessert && vitList().length) {
      const fav = weighted(rnd, DESSERT_ORDER.map((d) => [d, DESSERTS[d].pop] as [DessertId, number]));
      let pickD: DessertId | undefined = vit[fav] > 0 ? fav : undefined;
      if (!pickD && (forcedDessert || rnd() < CONFIG.dessertSubstitute)) pickD = weighted(rnd, vitList().map((d) => [d, DESSERTS[d].pop] as [DessertId, number]));
      if (pickD) {
        g.dessert = pickD;
        vit[pickD] -= 1;
      }
    }
    guests.push(g);
  }
  // Порядок прихода перемешиваем, чтобы «растительные» и «десертные» не шли в конце
  for (let i = guests.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [guests[i], guests[j]] = [guests[j], guests[i]];
  }
  const durationMs = shiftDuration(Math.max(1, guests.length));
  const times = waveArrivals(guests.length, durationMs, segs, rnd);
  guests.forEach((g, i) => (g.arriveMs = times[i]));

  // Постоянный гость: следующий по очереди незаконченной истории
  const pending = REGULAR_ORDER.filter((r) => (s.regulars[r]?.visits ?? 0) < REGULARS[r].beats.length);
  if (guests.length > 1 && pending.length && rnd() < 0.7) {
    const reg: RegularId = pending[Math.floor(rnd() * pending.length) % pending.length];
    const k = 1 + Math.floor(rnd() * (guests.length - 1));
    const fav = REGULARS[reg].favorite;
    guests[k].regular = reg;
    if (menu.includes(fav)) {
      guests[k].order = fav;
      delete guests[k].substitute;
      if (!DRINKS[fav].recipe.dairy) {
        guests[k].milk = 'regular';
        delete guests[k].milkSwap;
      }
    }
    guests[k].patienceMs += 4000; // постоянные гости терпеливее
  }
  // С собой или здесь: постоянные гости всегда остаются (их истории — за столиком)
  for (const g of guests) g.takeaway = !g.regular && rnd() < CONFIG.takeawayShare;
  return { v: 2, seed, startedAt: now, durationMs, segments: segs, guests, walkouts, catInCafe: catInCafe(s), tipBonus: s.marketing?.tipBonus ?? 0 };
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
  /** Выручка с десертов. */
  pastry: number;
  desserts: number;
  /** Ушли, не встав в очередь: своего напитка нет в меню / нужного молока нет. */
  walkNoDrink: number;
  walkNoMilk: number;
  /** Зарплата каждого сотрудника с этой смены. */
  salary: number;
  /** Как счастье баристы сдвинуло оценки гостей (множитель). */
  happyMult: number;
}

export function tipFor(p: Player, g: ShiftGuest, waitMs: number, cat: boolean, tipBonus = 0): number {
  const speed = Math.max(0, 1 - waitMs / g.patienceMs);
  const pair = g.dessert && DESSERTS[g.dessert].pair === g.order ? 1 + CONFIG.pairTipBonus : 1;
  const mult = (1 + 0.05 * level(p.baristaXp)) * (cat ? 1.1 : 1) * (1 + tipBonus) * (g.substitute ? 0.7 : 1) * pair;
  return Math.round(DRINKS[g.order].price * 0.25 * speed * mult);
}

function resolveShift(s: CafeState, actor: PlayerId, plan: ShiftPlan, results: GuestResult[], cleanlinessIn: number | undefined, at: number): ShiftSummary {
  const p = getPlayer(s, actor)!;
  // Столиков и уборки на смене больше нет — чистота всегда полная (параметр оставлен для старых клиентов)
  void cleanlinessIn;
  const cleanliness = 1;
  const byIdx = new Map<number, GuestResult>();
  for (const r of results) {
    if (Number.isInteger(r.i) && r.i >= 0 && r.i < plan.guests.length && !byIdx.has(r.i)) byIdx.set(r.i, r);
  }
  const today = dayKey(at);
  // Командный бонус: в этот день работали хотя бы двое
  const activeToday = humans(s).filter((h) => h.id === actor || h.days.includes(today)).length;
  const coop = activeToday >= 2 ? 1.2 : 1;
  const sum: ShiftSummary = {
    earned: 0, tips: 0, served: 0, wrong: 0, left: 0, points: 0, beats: [], noStock: 0, cleanliness, pastry: 0, desserts: 0,
    walkNoDrink: plan.walkouts?.noDrink ?? 0, walkNoMilk: plan.walkouts?.noMilk ?? 0, salary: 0, happyMult: 1,
  };
  const fx = slotEffects(s);
  s.stats.guestsLost += sum.walkNoDrink + sum.walkNoMilk;

  plan.guests.forEach((g0, i) => {
    const g: ShiftGuest = { ...g0, milk: g0.milk ?? 'regular' };
    if (!DRINKS[g.order]) return;
    const r = byIdx.get(i);
    let outcome = r?.outcome ?? 'left';
    const wait = Math.max(0, Math.min(r?.waitMs ?? g.patienceMs, g.patienceMs));
    if (outcome !== 'left' && !canServe(s.stock, g)) {
      outcome = 'left';
      sum.noStock += 1;
    }
    let sat = 0;
    if (outcome === 'served') {
      consume(s.stock, g);
      const tip = tipFor(p, g, wait, plan.catInCafe, plan.tipBonus ?? 0);
      sum.earned += guestPrice(g) + tip;
      sum.tips += tip;
      sum.served += 1;
      if (g.dessert) {
        sum.desserts += 1;
        sum.pastry += DESSERTS[g.dessert].price;
      }
      p.baristaXp += 10;
      sat = 1 - 0.5 * (wait / g.patienceMs) + fx.satBonus - (g.substitute ? 0.15 : 0) - (g.milkSwap ? 0.15 : 0);
      if (g.dessert && DESSERTS[g.dessert].pair === g.order) sat += 0.05;
      sat = Math.min(1, sat);
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
      consume(s.stock, g);
      sum.earned += Math.round(guestPrice(g) * 0.5);
      sum.wrong += 1;
      p.baristaXp += 3;
      sat = 0.3;
    } else {
      sum.left += 1;
      s.stats.guestsLost += 1;
    }
    // Счастливый бариста обслуживает лучше (±18%)
    if (outcome !== 'left') sat *= happyRatingMult(plan.happy ?? 50);
    pushRating(s, sat);
    sum.points += Math.round(sat * 10 * coop);
  });

  sum.salary = payout(s, sum.earned);
  sum.happyMult = happyRatingMult(plan.happy ?? 50);
  changeHappy(s, p, at, -CONFIG.shiftHappyCost);
  s.stats.earned += sum.earned;
  s.stats.guestsServed += sum.served;
  s.stats.shifts += 1;
  addPoints(s, p, sum.points, at);
  dailyProgress(s, p, at);
  addLog(s, at, actor, 'shift_done', { earned: sum.earned, served: sum.served, total: plan.guests.length });
  return sum;
}

// ---------- команды ----------

export interface ApplyResult {
  state: CafeState;
  shiftPlan?: ShiftPlan;
  summary?: ShiftSummary;
}

/** Очки кофейни (день, неделя, всё время) и личные очки игрока для рейтинга внутри команды. */
function addPoints(s: CafeState, p: Player | null, pts: number, at: number) {
  const day = dayKey(at);
  const wk = weekId(at);
  if (s.today?.day !== day) s.today = { day, points: 0 };
  if (s.week.id !== wk) s.week = { id: wk, points: 0 };
  s.today.points += pts;
  s.week.points += pts;
  s.stats.points = (s.stats.points ?? 0) + pts;
  if (!p) return;
  const pp = p.points;
  if (pp.day !== day) {
    pp.day = day;
    pp.today = 0;
  }
  if (pp.week !== wk) {
    pp.week = wk;
    pp.thisWeek = 0;
  }
  pp.today += pts;
  pp.thisWeek += pts;
  pp.all += pts;
}

/** Дневная цель: N дел по роли (смены, поездки, улучшения, реклама) → самоцветы. */
function dailyProgress(s: CafeState, p: Player, at: number) {
  const day = dayKey(at);
  if (p.daily.day !== day) p.daily = { day, actions: 0, done: false };
  p.daily.actions += 1;
  if (!p.daily.done && p.daily.actions >= CONFIG.dailyGoalActions) {
    p.daily.done = true;
    p.gems += CONFIG.dailyGoalGems;
    addLog(s, at, p.id, 'gems_daily', { gems: CONFIG.dailyGoalGems });
  }
}

/** Личные очки за задачи управляющего: 4 очка за дело. */
function managerTaskDone(s: CafeState, p: Player, at: number) {
  addPoints(s, p, 4, at);
  dailyProgress(s, p, at);
}

function requireGems(p: Player, cost: number) {
  if ((p.gems ?? 0) < cost) throw new GameError('no_gems', { need: cost - (p.gems ?? 0) });
}

/** Сменить вывеску, если предложение одобрили все текущие сотрудники. */
function tryBrand(s: CafeState, b: BrandProposal, at: number) {
  if (b.status !== 'voting') return;
  if (!humans(s).every((h) => b.approvals.includes(h.id))) return;
  s.name = b.name;
  s.logo = b.logo;
  s.brands = s.brands.filter((x) => x.id !== b.id);
  addLog(s, at, 'system', 'brand_changed', { name: b.name });
}

function markDay(p: Player, at: number) {
  const d = dayKey(at);
  if (!p.days.includes(d)) {
    p.days.push(d);
    if (p.days.length > 60) p.days.shift();
  }
}

function requireWallet(p: Player, cost: number) {
  if ((p.wallet ?? 0) < cost) throw new GameError('no_wallet', { need: cost - (p.wallet ?? 0) });
}

/** Перед изменением квартиры: досчитать шкалы всем по старым эффектам. */
function syncAll(s: CafeState, at: number) {
  for (const h of s.players) syncVitals(s, h, at);
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
  for (const b of [...s.brands]) {
    if (b.submittedBy === playerId && b.status === 'voting') {
      // Выставивший ушёл: голосование снимается, самоцветы возвращать некому
      b.status = 'draft';
      b.approvals = [];
      delete b.submittedBy;
      delete b.paid;
    }
    b.approvals = b.approvals.filter((x) => x !== playerId);
    tryBrand(s, b, at);
  }
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
  ensureHome(s);
  addLog(s, at, app.id, 'staff_joined', { name: app.name, role: app.role });
  return true;
}

function holdOffice(s: CafeState, actor: PlayerId, at: number) {
  const holder = officeHolder(s, actor, at);
  if (holder) throw new GameError('office_busy', { name: holder.name });
  s.office = { by: actor, until: at + CONFIG.officeHoldMs };
}

const MANAGER_COMMANDS = new Set(['supplyRun', 'unlockDrink', 'toggleFeatured', 'buyUpgrade', 'upgradeSlot', 'launchMarketing']);
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

  if (cmd.type === 'grantGems') {
    // Только сервер (после успешной оплаты Stars) — клиент эту команду отправить не может
    if (actor !== 'system') throw new GameError('forbidden');
    const target = getPlayer(s, cmd.player);
    if (!target || target.isNpc) throw new GameError('not_member');
    const amount = Math.floor(Number(cmd.amount) || 0);
    if (amount <= 0) throw new GameError('bad_amount');
    target.gems = (target.gems ?? 0) + amount;
    addLog(s, at, target.id, 'gems_bought', { gems: amount });
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
    case 'proposeBrand': {
      const name = cleanCafeName(cmd.name);
      if (!name) throw new GameError('bad_name');
      const logo = cleanLogo(cmd.logo);
      if (name === s.name && JSON.stringify(logo) === JSON.stringify(s.logo)) throw new GameError('brand_same');
      if (s.brands.length >= CONFIG.brandMaxProposals) throw new GameError('brand_too_many', { max: CONFIG.brandMaxProposals });
      s.brands.push({ id: `${at}-${s.logSeq}`, by: actor, at, name, logo, status: 'draft', approvals: [] });
      addLog(s, at, actor, 'brand_proposed', { name });
      break;
    }
    case 'submitBrand': {
      // Выставляет на голосование управляющий (если людей-управляющих нет — любой сотрудник) и платит самоцветами
      const hasManager = humans(s).some((h) => h.role === 'manager');
      if (hasManager) requireRole(p, 'manager');
      const b = s.brands.find((x) => x.id === cmd.id);
      if (!b || b.status !== 'draft') throw new GameError('no_brand');
      if (s.brands.some((x) => x.status === 'voting')) throw new GameError('brand_voting');
      requireGems(p, CONFIG.brandCost);
      p.gems -= CONFIG.brandCost;
      b.status = 'voting';
      b.submittedBy = actor;
      b.paid = CONFIG.brandCost;
      b.approvals = [actor];
      addLog(s, at, actor, 'brand_submitted', { name: b.name });
      tryBrand(s, b, at);
      break;
    }
    case 'voteBrand': {
      const b = s.brands.find((x) => x.id === cmd.id);
      if (!b || b.status !== 'voting') throw new GameError('no_brand');
      if (cmd.yes) {
        if (!b.approvals.includes(actor)) b.approvals.push(actor);
        tryBrand(s, b, at);
      } else {
        // Против хотя бы один — вывеска не меняется, самоцветы возвращаются выставившему
        const payer = b.submittedBy ? getPlayer(s, b.submittedBy) : undefined;
        if (payer) payer.gems += b.paid ?? 0;
        s.brands = s.brands.filter((x) => x.id !== b.id);
        addLog(s, at, actor, 'brand_rejected', { name: b.name });
      }
      break;
    }
    case 'dropBrand': {
      const b = s.brands.find((x) => x.id === cmd.id);
      if (!b) throw new GameError('no_brand');
      if (b.status !== 'draft') throw new GameError('brand_voting');
      if (b.by !== actor && p.role !== 'manager') throw new GameError('forbidden');
      s.brands = s.brands.filter((x) => x.id !== b.id);
      break;
    }
    case 'buyHall': {
      // Зал — развитие кофейни: обставляет управляющий из бюджета
      requireRole(p, 'manager');
      const item = HALL_BY_ID[cmd.id];
      if (!item) throw new GameError('bad_item');
      if (s.hall.owned.includes(item.id)) throw new GameError('owned');
      requireMoney(s, item.cost);
      s.money -= item.cost;
      s.hall.owned.push(item.id);
      s.hall.placed[item.slot] = item.id;
      markDay(p, at);
      addLog(s, at, actor, 'cafe_decor_bought', { id: item.id });
      break;
    }
    case 'placeHall': {
      requireRole(p, 'manager');
      if (cmd.id === null) {
        if (cmd.slot === 'window1' || cmd.slot === 'window2') throw new GameError('bad_item'); // без окна нельзя
        delete s.hall.placed[cmd.slot];
      } else {
        const item = HALL_BY_ID[cmd.id];
        if (!item || item.slot !== cmd.slot || !s.hall.owned.includes(item.id)) throw new GameError('bad_item');
        s.hall.placed[cmd.slot] = item.id;
      }
      break;
    }
    case 'setHallWall':
    case 'setHallFloor': {
      requireRole(p, 'manager');
      const wall = cmd.type === 'setHallWall';
      const item = wall ? HALL_WALL_BY_ID[cmd.id] : HALL_FLOOR_BY_ID[cmd.id];
      if (!item) throw new GameError('bad_item');
      const have = wall ? s.hall.walls : s.hall.floors;
      if (!have.includes(item.id)) {
        requireMoney(s, item.cost);
        s.money -= item.cost;
        have.push(item.id);
        markDay(p, at);
        addLog(s, at, actor, 'cafe_decor_bought', { id: item.id });
      }
      if (wall) s.hall.wall = item.id;
      else s.hall.floor = item.id;
      break;
    }
    case 'startShift': {
      const prev = s.activeShifts[actor];
      if (prev && prev.v === 2 && at - prev.startedAt < (prev.durationMs ?? CONFIG.shiftMaxMs) + 60_000) {
        out.shiftPlan = prev; // возобновляем незавершённую смену без повторной траты сил
        return out;
      }
      const busy = counterHolder(s, actor, at);
      if (busy) throw new GameError('counter_busy', { name: busy.name });
      spendEnergy(s, p, at, shiftCost(s, p));
      const plan = makeShiftPlan(s, actor, at);
      plan.happy = Math.round(p.happy);
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
      // Одна поездка к поставщику = 20 бодрости (корм кота — только из личных денег), сколько угодно упаковок в пределах склада и денег
      const entries = (Object.entries(cmd.items ?? {}) as [StockId, number][]).filter(([k, n]) => k !== 'catFood' && STOCK_PACKS[k] && Number.isInteger(n) && n > 0);
      if (!entries.length) throw new GameError('empty_order');
      let cost = 0;
      const milks = availableMilks(s);
      for (const [k, n] of entries) {
        // молоко и сливки — только тех видов, что держит холодильник (иначе куплено и не видно)
        if ((k.startsWith('milk_') || k.startsWith('cream_')) && !milks.includes(k.split('_')[1] as MilkKind)) throw new GameError('no_fridge');
        const cap = capacity(s, k);
        if ((s.stock[k] ?? 0) + STOCK_PACKS[k].amount * n > cap) throw new GameError('capacity', { cap });
        cost += packPrice(s, actor, k) * n;
      }
      // Витрина держит ограниченное число видов десертов
      const kinds = new Set(vitrineDesserts(s));
      for (const [k] of entries) if (k.startsWith('ds_')) kinds.add(k.slice(3) as DessertId);
      if (kinds.size > slotEffects(s).dessertKinds) throw new GameError('vitrine_full', { n: slotEffects(s).dessertKinds });
      requireMoney(s, cost);
      spendEnergy(s, p, at, CONFIG.managerTaskEnergy);
      changeHappy(s, p, at, -CONFIG.managerHappyCost);
      managerTaskDone(s, p, at);
      s.money -= cost;
      for (const [k, n] of entries) {
        s.stock[k] = (s.stock[k] ?? 0) + STOCK_PACKS[k].amount * n;
        // свежая партия десерта: лежит сутки с момента закупки
        if (k.startsWith('ds_')) s.dessertFresh[k.slice(3) as DessertId] = at + DESSERT_SHELF_MS;
      }
      p.managerXp += 10 * entries.length;
      markDay(p, at);
      addLog(s, at, actor, 'supply_run', { cost, items: entries.map(([k, n]) => `${k}:${n}`).join(',') });
      break;
    }
    case 'upgradeSlot': {
      const slot = CAFE_SLOTS[cmd.slot];
      if (!slot) throw new GameError('bad_item');
      const cur = slotLevel(s, cmd.slot);
      if (cur >= SLOT_MAX) throw new GameError('owned');
      const cost = slot.levels[cur].cost;
      requireMoney(s, cost);
      spendEnergy(s, p, at, CONFIG.managerTaskEnergy);
      changeHappy(s, p, at, -CONFIG.managerHappyCost);
      managerTaskDone(s, p, at);
      s.money -= cost;
      s.levels[cmd.slot] = cur + 1;
      p.managerXp += 25;
      markDay(p, at);
      addLog(s, at, actor, 'upgrade_bought', { slot: cmd.slot, level: cur + 1 });
      break;
    }
    case 'launchMarketing': {
      const m = MARKETING[cmd.id];
      if (!m) throw new GameError('bad_item');
      if (s.marketing) throw new GameError('marketing_active');
      requireMoney(s, m.cost);
      spendEnergy(s, p, at, CONFIG.managerTaskEnergy);
      changeHappy(s, p, at, -CONFIG.managerHappyCost);
      managerTaskDone(s, p, at);
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
      if (!s.featured.includes(cmd.id) && !inSeason(cmd.id, at)) throw new GameError('out_of_season');
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
      const room = getRoom(s, cmd.room);
      if (!room.open) throw new GameError('room_locked');
      if (room.kind === 'bedroom' && room.owner !== actor) throw new GameError('not_your_room');
      const item = DECOR_BY_ID[cmd.id];
      if (!item || !ROOM_SLOTS[room.kind].includes(item.slot)) throw new GameError('bad_item');
      if (room.owned.includes(item.id)) throw new GameError('owned');
      requireWallet(p, item.cost);
      syncAll(s, at); // эффекты квартиры меняются — сначала досчитываем шкалы всем
      p.wallet -= item.cost;
      room.owned.push(item.id);
      room.placed[item.slot] = item.id; // сразу ставим купленное
      markDay(p, at);
      addLog(s, at, actor, 'decor_bought', { id: item.id });
      break;
    }
    case 'placeDecor': {
      const room = getRoom(s, cmd.room);
      if (!room.open) throw new GameError('room_locked');
      if (room.kind === 'bedroom' && room.owner !== actor) throw new GameError('not_your_room');
      syncAll(s, at);
      if (cmd.id === null) {
        delete room.placed[cmd.slot];
      } else {
        const item = DECOR_BY_ID[cmd.id];
        if (!item || item.slot !== cmd.slot || !room.owned.includes(item.id)) throw new GameError('bad_item');
        room.placed[cmd.slot] = item.id;
        addLog(s, at, actor, 'decor_placed', { id: item.id });
      }
      break;
    }
    case 'setWallpaper': {
      // Обои: первая поклейка каждого рисунка в комнате платная, потом можно менять бесплатно
      const room = getRoom(s, cmd.room);
      if (!room.open) throw new GameError('room_locked');
      if (room.kind === 'bedroom' && room.owner !== actor) throw new GameError('not_your_room');
      const wp = WALLPAPER_BY_ID[cmd.id];
      if (!wp || !wp.rooms.includes(room.kind)) throw new GameError('bad_item');
      room.wallpapers ??= [defaultWallpaper(room.kind)];
      syncAll(s, at);
      if (!room.wallpapers.includes(wp.id)) {
        requireWallet(p, wp.cost);
        p.wallet -= wp.cost;
        room.wallpapers.push(wp.id);
        markDay(p, at);
        addLog(s, at, actor, 'decor_bought', { id: wp.id });
      }
      room.wallpaper = wp.id;
      break;
    }
    case 'contributeRoom': {
      const room = getRoom(s, cmd.room);
      if (room.open) throw new GameError('owned');
      const need = roomCost(room) - room.fund;
      const amount = Math.min(Math.floor(Number(cmd.amount) || 0), need);
      if (amount <= 0) throw new GameError('bad_amount');
      requireWallet(p, amount);
      p.wallet -= amount;
      room.fund += amount;
      markDay(p, at);
      addLog(s, at, actor, 'room_funded', { room: cmd.room, amount, owner: room.owner ?? '' });
      if (room.fund >= roomCost(room)) {
        syncAll(s, at);
        room.open = true;
        addLog(s, at, 'system', 'room_opened', { room: cmd.room, owner: room.owner ?? '' });
      }
      break;
    }
    case 'transferToBudget': {
      const amount = Math.floor(Number(cmd.amount) || 0);
      if (amount <= 0) throw new GameError('bad_amount');
      requireWallet(p, amount);
      p.wallet -= amount;
      s.money += amount;
      addLog(s, at, actor, 'budget_topup', { amount });
      break;
    }
    case 'buyCatFood': {
      requireWallet(p, CONFIG.catFoodPackCost);
      p.wallet -= CONFIG.catFoodPackCost;
      s.stock.catFood += CONFIG.catFoodPackAmount;
      markDay(p, at);
      addLog(s, at, actor, 'stock_bought', { item: 'catFood', cost: CONFIG.catFoodPackCost });
      break;
    }
    case 'sendGift': {
      const to = getPlayer(s, cmd.to);
      if (!to || to.isNpc || to.id === actor) throw new GameError('bad_target');
      const gift = cmd.kind === 'gift';
      const cost = gift ? CONFIG.giftCost : CONFIG.postcardCost;
      requireWallet(p, cost);
      spendEnergy(s, p, at, gift ? CONFIG.giftEnergy : CONFIG.postcardEnergy);
      p.wallet -= cost;
      const joy = giveSocialJoy(s, to, at, gift ? CONFIG.joyFromGift : CONFIG.joyFromPostcard);
      markDay(p, at);
      addLog(s, at, actor, 'gift_sent', { to: to.id, toName: to.name, kind: cmd.kind, joy, text: (cmd.text ?? '').trim().slice(0, 60) });
      break;
    }
    case 'adoptCat': {
      if (s.cat) throw new GameError('owned');
      const name = cmd.name.trim().slice(0, 20);
      if (!name) throw new GameError('bad_name');
      syncAll(s, at);
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
      changeHappy(s, p, at, CONFIG.petJoy);
      markDay(p, at);
      addLog(s, at, actor, 'cat_petted', { name: s.cat.name });
      break;
    }
    case 'postNote': {
      const text = cmd.text.trim().slice(0, CONFIG.noteMaxLen);
      if (!text && !cmd.sticker) throw new GameError('empty_note');
      spendEnergy(s, p, at, text ? CONFIG.noteEnergy : CONFIG.stickerEnergy);
      s.board.push({ id: `${at}-${s.logSeq}`, author: actor, text, sticker: cmd.sticker, at });
      if (s.board.length > CONFIG.boardMax) s.board.splice(0, s.board.length - CONFIG.boardMax);
      // записка радует всю остальную команду
      for (const h of humans(s)) if (h.id !== actor) giveSocialJoy(s, h, at, text ? CONFIG.joyFromNote : CONFIG.joyFromSticker);
      addLog(s, at, actor, 'note', { text: text.slice(0, 60), sticker: cmd.sticker ?? '' });
      break;
    }
    case 'seen': {
      p.lastSeenAt = at;
      break;
    }
    case 'debugRefill': {
      p.energy = CONFIG.energyMax;
      p.happy = CONFIG.happyMax;
      p.vitalsAt = at;
      s.money += 1000;
      p.wallet += 500;
      break;
    }
    case 'debugGems': {
      // Отладка: имитация покупки пачки за Stars (в локальном режиме и на сервере с ALLOW_DEBUG)
      const pack = GEM_PACKS.find((x) => x.id === cmd.pack);
      if (!pack) throw new GameError('bad_item');
      p.gems += pack.gems + Math.round((pack.gems * (pack.bonus ?? 0)) / 100);
      addLog(s, at, actor, 'gems_bought', { gems: pack.gems });
      break;
    }
    case 'debugUnlockRoom': {
      // Отладка: открыть кухню и все личные комнаты без взносов
      syncAll(s, at);
      for (const r of Object.values(s.home.rooms)) r.open = true;
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
  // Старые улучшения → уровни кофейни
  if (!x.levels) {
    const old = x.upgrades as Record<string, boolean | undefined>;
    x.levels = { machine: old.machinePro ? 2 : 1, vitrine: 1, tables: old.terrace ? 3 : 1, decor: old.cozyHall ? 2 : 1 } as unknown as CafeState['levels'];
    delete old.machinePro;
    delete old.terrace;
    delete old.cozyHall;
  }
  if (!Array.isArray((x as Partial<CafeState>).featured)) x.featured = x.menu.slice(0, CONFIG.menuSlots);
  x.players.forEach((p, i) => {
    if (!p.role) p.role = i === 0 ? 'barista' : 'manager';
    if (!p.lastActionAt) p.lastActionAt = p.lastSeenAt;
    // Бодрость была 0..3 «силы» — переводим в шкалу 0..100; добавляем счастье и кошелёк
    const old = p as Player & { energyAt?: number };
    if (p.vitalsAt === undefined) {
      p.energy = p.energy <= 3 ? Math.round((p.energy / 3) * 100) : p.energy;
      p.vitalsAt = old.energyAt ?? Date.now();
      delete old.energyAt;
    }
    if (p.happy === undefined) p.happy = CONFIG.happyStart;
    if (p.wallet === undefined) p.wallet = p.isNpc ? 0 : CONFIG.walletStart;
    if (p.gems === undefined) p.gems = p.isNpc ? 0 : CONFIG.gemsStart;
    if (!p.daily) p.daily = { day: '', actions: 0, done: false };
    if (!p.points) p.points = { day: '', today: 0, week: '', thisWeek: 0, all: 0 };
    if (p.socialDay === undefined) {
      p.socialDay = '';
      p.socialJoy = 0;
    }
  });
  if (!x.logo) x.logo = { ...DEFAULT_LOGO };
  if (!x.brands) x.brands = [];
  if (!x.today) x.today = { day: '', points: 0 };
  if (x.stats.points === undefined) x.stats.points = x.week.points;
  if (!x.cafeDecor && !x.hall) {
    // Уровни «столики» и «декор» заменены декором зала: декор переводим в предметы, столики — в деньги
    const lv = x.levels as Record<string, number>;
    const d = lv.decor ?? 1;
    const ids = d >= 2 ? ['c-lamps', 'c-sillplant', 'c-hanging', 'c-floorplant'] : [];
    if (d >= 3) ids.push('c-garland', 'c-pic-cup', 'c-shelf', 'c-succulent');
    x.cafeDecor = { owned: [], placed: {} };
    for (const id of ids) {
      const it = CAFE_DECOR_BY_ID[id];
      if (!it) continue;
      x.cafeDecor.owned.push(id);
      x.cafeDecor.placed[it.slot] = id;
    }
    const tb = lv.tables ?? 1;
    x.money += (tb >= 2 ? 700 : 0) + (tb >= 3 ? 1500 : 0);
    delete lv.tables;
    delete lv.decor;
  }
  if (!x.home) {
    ensureHome(x);
    delete x.room;
  }
  migrateHall(x);
  migrateMenu(x);
  if (x.players.length === 2 && x.players[0].role === x.players[1].role) x.players[1].role = otherRole(x.players[0].role);
  return x;
}

/** Меню первой очереди (классика + рафы, склад по видам): переносим старые сохранения. */
/** Старый декор зала (7 слотов у стойки) → гостевой зал со слотами как у комнат. */
function migrateHall(x: CafeState) {
  if (x.hall) return;
  x.hall = newHall();
  const old = x.cafeDecor;
  if (old) {
    for (const id of old.owned) {
      const to = CAFE_DECOR_TO_HALL[id];
      const it = to ? HALL_BY_ID[to] : undefined;
      if (it && !x.hall.owned.includes(it.id)) x.hall.owned.push(it.id);
      else x.money += CAFE_DECOR_BY_ID[id]?.cost ?? 0; // подвесное растение и суккулент — без пары, деньги назад
    }
    for (const id of Object.values(old.placed)) {
      const it = id ? HALL_BY_ID[CAFE_DECOR_TO_HALL[id] ?? ''] : undefined;
      if (it) x.hall.placed[it.slot] = it.id;
    }
  }
  delete x.cafeDecor;
}

export function newHall(): HallState {
  return {
    owned: Object.values(HALL_START) as string[],
    placed: { ...HALL_START },
    walls: [HALL_WALLS.find((w) => w.def)!.id],
    wall: HALL_WALLS.find((w) => w.def)!.id,
    floors: [HALL_FLOORS.find((w) => w.def)!.id],
    floor: HALL_FLOORS.find((w) => w.def)!.id,
  };
}

function migrateMenu(x: CafeState) {
  const st = x.stock as Record<string, number>;
  if (st.milk !== undefined || st.syrup !== undefined || st.cocoa !== undefined || st.milk_regular === undefined) {
    const fresh = emptyStock();
    fresh.beans = st.beans ?? 0;
    fresh.cups = st.cups ?? 0;
    fresh.catFood = st.catFood ?? 0;
    fresh.milk_regular = st.milk ?? 0;
    fresh.syr_vanilla = st.syrup ?? 0;
    fresh.syr_caramel = 0;
    fresh.syr_chocolate = st.cocoa ?? 0;
    for (const k of Object.keys(fresh) as StockId[]) if (st[k] !== undefined && fresh[k] === 0) fresh[k] = st[k];
    x.stock = fresh;
  }
  for (const k of Object.keys(emptyStock()) as StockId[]) if (x.stock[k] === undefined) x.stock[k] = 0;
  // Напитки: раф → классический раф; айс-латте и какао убраны — их цена открытия возвращается в бюджет
  const refund: Record<string, number> = { icedLatte: 450, cocoa: 400 };
  const mapId = (d: string): DrinkId | null => (d === 'raf' ? 'rafClassic' : DRINKS[d as DrinkId] ? (d as DrinkId) : null);
  const menu: DrinkId[] = [];
  for (const d of x.menu as string[]) {
    const m = mapId(d);
    if (m && !menu.includes(m)) menu.push(m);
    else if (!m) x.money += refund[d] ?? 0;
  }
  x.menu = menu.length ? menu : ['espresso', 'americano', 'cappuccino'];
  x.featured = (x.featured as string[]).map(mapId).filter((d): d is DrinkId => !!d && x.menu.includes(d));
  // Уровни: холодильник и склад; «Второй холодильник» → склад 2
  const lv = x.levels as Partial<Record<CafeSlot, number>>;
  if (!lv.fridge) lv.fridge = 1;
  if (!lv.storage) lv.storage = x.upgrades?.fridge ? 2 : 1;
  if (x.upgrades?.fridge) delete x.upgrades.fridge;
  if (!x.dessertFresh) x.dessertFresh = {};
  // Старые незавершённые смены (до пошаговой сборки) не продолжаются
  for (const [id, plan] of Object.entries(x.activeShifts ?? {})) if (plan.v !== 2) delete x.activeShifts[id];
}
