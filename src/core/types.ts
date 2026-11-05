import type { CafeDecorSlot, CafeSlot, DecorSlot, DessertId, Logo, DrinkId, MarketingId, MilkKind, RegularId, Role, RoomKind, StockId } from './content.ts';
export type { Role };

export type PlayerId = string;

export interface Player {
  id: PlayerId;
  name: string;
  slot: number;
  isNpc: boolean;
  role: Role;
  lastActionAt: number; // последнее действие (не просто визит) — для подмены NPC
  /** Бодрость 0..100 и счастье 0..100 на момент vitalsAt; дальше восстанавливаются по минутам. */
  energy: number;
  happy: number;
  vitalsAt: number;
  /** Личные деньги (зарплата). Бюджет кофейни — CafeState.money. */
  wallet: number;
  /** Сколько радости от записок и подарков получено в этот день (лимит в сутки). */
  socialDay: string;
  socialJoy: number;
  /** Премиум-валюта: зарабатывается за дневную цель и покупается за Stars. Личная. */
  gems: number;
  /** Дневная цель: N действий по роли → самоцветы. */
  daily: { day: string; actions: number; done: boolean };
  /** Личные очки для рейтинга внутри команды. */
  points: { day: string; today: number; week: string; thisWeek: number; all: number };
  baristaXp: number;
  managerXp: number;
  joinedAt: number;
  lastSeenAt: number;
  days: string[]; // дни (YYYY-MM-DD), когда игрок что-то делал — для ворот и рейтинга
  lastPetAt: number;
}

export interface ShiftGuest {
  order: DrinkId;
  /** Молоко или сливки какого вида (если в напитке есть молочное). */
  milk: MilkKind;
  /** Гость хотел другое молоко, а его нет — взял на обычном (оценка ниже). */
  milkSwap?: MilkKind;
  /** Своего напитка в меню дня не было — взял другой (оценка и чаевые ниже). */
  substitute?: boolean;
  dessert?: DessertId;
  patienceMs: number;
  arriveMs: number; // смещение от начала смены
  regular?: RegularId;
  /** Берёт с собой: нужен бумажный стакан. */
  takeaway?: boolean;
}

/** Отрезок смены: доля длины и плотность гостей (пик > 1). */
export interface ShiftSegment {
  kind: 'morning' | 'day' | 'lunch' | 'evening';
  share: number;
  density: number;
}

export interface ShiftPlan {
  /** 2 — пошаговая сборка, волны, десерты. Старые планы без поля не продолжаются. */
  v?: 2;
  seed: number;
  startedAt: number;
  durationMs?: number;
  segments?: ShiftSegment[];
  guests: ShiftGuest[];
  /** Ушли, не встав в очередь: своего напитка нет / нужного молока нет. */
  walkouts?: { noDrink: number; noMilk: number };
  catInCafe: boolean;
  /** Устаревшее: столиков на смене больше нет. */
  tables?: number;
  tipBonus: number;
  /** Счастье баристы на начало смены — от него зависят оценки гостей. */
  happy?: number;
}

export type GuestOutcome = 'served' | 'wrong' | 'left';

export interface GuestResult {
  i: number;
  outcome: GuestOutcome;
  waitMs: number; // сколько гость ждал до подачи
}

export interface HomeRoom {
  kind: RoomKind;
  /** Хозяин личной комнаты; у общих — нет. */
  owner?: PlayerId;
  open: boolean;
  /** Сколько уже вложено в открытие. */
  fund: number;
  owned: string[];
  placed: Partial<Record<DecorSlot, string>>;
}

/** Предложение сменить название и/или логотип: черновик → менеджер выставляет (платит) → одобряют все. */
export interface BrandProposal {
  id: string;
  by: PlayerId;
  at: number;
  name: string;
  logo: Logo;
  status: 'draft' | 'voting';
  submittedBy?: PlayerId;
  paid?: number;
  approvals: PlayerId[];
}

export interface Application {
  id: PlayerId;
  name: string;
  role: Role;
  at: number;
  approvals: PlayerId[];
}

export interface Note {
  id: string;
  author: PlayerId;
  text: string;
  sticker?: string;
  at: number;
}

export type LogKind =
  | 'cafe_opened'
  | 'partner_joined'
  | 'shift_done'
  | 'npc_shift'
  | 'stock_bought'
  | 'supply_run'
  | 'marketing_launched'
  | 'npc_cover'
  | 'swap_proposed'
  | 'swap_accepted'
  | 'swap_declined'
  | 'partner_left'
  | 'partner_replaced'
  | 'application_new'
  | 'application_rejected'
  | 'staff_joined'
  | 'staff_removed'
  | 'role_switched'
  | 'upgrade_bought'
  | 'drink_unlocked'
  | 'decor_bought'
  | 'decor_placed'
  | 'room_unlocked'
  | 'room_opened'
  | 'room_funded'
  | 'budget_topup'
  | 'gift_sent'
  | 'cat_adopted'
  | 'cat_fed'
  | 'cat_petted'
  | 'note'
  | 'regular_story'
  | 'stock_low'
  | 'cat_hungry'
  | 'renamed'
  | 'brand_proposed'
  | 'brand_submitted'
  | 'brand_rejected'
  | 'brand_changed'
  | 'gems_daily'
  | 'gems_bought'
  | 'cafe_decor_bought'
  | 'desserts_expired';

export interface LogEntry {
  id: number;
  at: number;
  actor: PlayerId | 'system';
  kind: LogKind;
  p?: Record<string, string | number>;
}

export interface CafeState {
  schema: 1;
  code: string;
  ownerId: PlayerId;
  inviteKey: string; // меняется при смене напарника — старые приглашения перестают работать
  npcName: string;
  name: string;
  logo: Logo;
  brands: BrandProposal[];
  version: number;
  createdAt: number;
  updatedAt: number;
  players: Player[];
  money: number;
  stock: Record<StockId, number>;
  menu: DrinkId[];
  /** Меню дня: что заказывают гости (подмножество menu, до CONFIG.menuSlots). */
  featured: DrinkId[];
  /** Устаревшее: «Второй холодильник» заменён уровнями склада. */
  upgrades: Record<string, true>;
  /** Уровни кофейни 1..3: машина, холодильник, склад, витрина. */
  levels: Record<CafeSlot, number>;
  /** Декор зала кофейни (покупается из бюджета, обставляется как комнаты). */
  cafeDecor: { owned: string[]; placed: Partial<Record<CafeDecorSlot, string>> };
  /** Когда списываются десерты на витрине (мс). */
  dessertFresh: Partial<Record<DessertId, number>>;
  ratingRecent: number[]; // удовлетворённость 0..1 последних гостей
  regulars: Partial<Record<RegularId, { visits: number; seenBy: PlayerId[] }>>;
  activeShifts: Record<PlayerId, ShiftPlan>;
  swap: null | { by: PlayerId; with: PlayerId; at: number };
  office: null | { by: PlayerId; until: number };
  applications: Application[];
  marketing: null | { id: MarketingId; guests: number; tipBonus: number; shiftsLeft: number };
  /** Старое поле одной комнаты — переезжает в home.rooms.hall при миграции. */
  room?: {
    unlocked: boolean;
    owned: string[];
    placed: Partial<Record<DecorSlot, string>>;
  };
  /** Квартира: hall, kitchen и bed:<playerId>. */
  home: { rooms: Record<string, HomeRoom> };
  cat: null | {
    name: string;
    hunger: number; // 100 — сыт
    mood: number; // 100 — счастлив
    updatedAt: number;
  };
  board: Note[];
  log: LogEntry[];
  logSeq: number;
  week: { id: string; points: number };
  /** Очки за сегодняшний день (UTC) — для дневного рейтинга. */
  today: { day: string; points: number };
  stats: { shifts: number; guestsServed: number; guestsLost: number; earned: number; points: number };
  nextNpcAt: number;
  alerts: { stockLowAt: number; catHungryAt: number };
}

export type Command =
  | { type: 'join'; player: { id: PlayerId; name: string }; key?: string }
  | { type: 'apply'; player: { id: PlayerId; name: string }; key: string; role: Role }
  | { type: 'cancelApplication' }
  | { type: 'approveApplication'; id: PlayerId }
  | { type: 'rejectApplication'; id: PlayerId }
  | { type: 'switchRole'; role: Role }
  | { type: 'removeStaff'; id: PlayerId }
  | { type: 'enterOffice' }
  | { type: 'leaveOffice' }
  | { type: 'proposeBrand'; name: string; logo: Logo }
  | { type: 'submitBrand'; id: string }
  | { type: 'voteBrand'; id: string; yes: boolean }
  | { type: 'dropBrand'; id: string }
  | { type: 'buyCafeDecor'; id: string }
  | { type: 'placeCafeDecor'; slot: CafeDecorSlot; id: string | null }
  | { type: 'grantGems'; player: PlayerId; amount: number; ref: string }
  | { type: 'startShift' }
  | { type: 'finishShift'; results: GuestResult[]; cleanliness?: number }
  | { type: 'abandonShift' }
  | { type: 'supplyRun'; items: Partial<Record<StockId, number>> }
  | { type: 'launchMarketing'; id: MarketingId }
  | { type: 'proposeSwap'; with?: PlayerId }
  | { type: 'acceptSwap' }
  | { type: 'declineSwap' }
  | { type: 'leaveCafe' }
  | { type: 'upgradeSlot'; slot: CafeSlot }
  | { type: 'unlockDrink'; id: DrinkId }
  | { type: 'toggleFeatured'; id: DrinkId }
  | { type: 'buyDecor'; id: string; room?: string }
  | { type: 'placeDecor'; slot: DecorSlot; id: string | null; room?: string }
  | { type: 'contributeRoom'; room: string; amount: number }
  | { type: 'transferToBudget'; amount: number }
  | { type: 'buyCatFood' }
  | { type: 'sendGift'; to: PlayerId; kind: 'postcard' | 'gift'; text?: string }
  | { type: 'adoptCat'; name: string }
  | { type: 'feedCat' }
  | { type: 'petCat' }
  | { type: 'postNote'; text: string; sticker?: string }
  | { type: 'seen' }
  | { type: 'debugRefill' }
  | { type: 'debugUnlockRoom' }
  | { type: 'debugGems'; pack: string };

export interface CommandEnvelope {
  actor: PlayerId;
  at: number;
  cmd: Command;
}

export class GameError extends Error {
  constructor(public code: string, public params: Record<string, string | number> = {}) {
    super(code);
  }
}
