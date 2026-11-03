import type { DecorSlot, DrinkId, MarketingId, RegularId, Role, StockId, UpgradeId } from './content.ts';
export type { Role };

export type PlayerId = string;

export interface Player {
  id: PlayerId;
  name: string;
  slot: number;
  isNpc: boolean;
  role: Role;
  lastActionAt: number; // последнее действие (не просто визит) — для подмены NPC
  energy: number;
  energyAt: number; // момент, от которого считается восстановление
  baristaXp: number;
  managerXp: number;
  joinedAt: number;
  lastSeenAt: number;
  days: string[]; // дни (YYYY-MM-DD), когда игрок что-то делал — для ворот и рейтинга
  lastPetAt: number;
}

export interface ShiftGuest {
  order: DrinkId;
  patienceMs: number;
  arriveMs: number; // смещение от начала смены
  regular?: RegularId;
  /** Берёт с собой: нужен бумажный стакан, за столик не садится. */
  takeaway?: boolean;
}

export interface ShiftPlan {
  seed: number;
  startedAt: number;
  guests: ShiftGuest[];
  catInCafe: boolean;
  tables: number;
  tipBonus: number;
}

export type GuestOutcome = 'served' | 'wrong' | 'left';

export interface GuestResult {
  i: number;
  outcome: GuestOutcome;
  waitMs: number; // сколько гость ждал до подачи
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
  | 'cat_adopted'
  | 'cat_fed'
  | 'cat_petted'
  | 'note'
  | 'regular_story'
  | 'stock_low'
  | 'cat_hungry'
  | 'renamed';

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
  version: number;
  createdAt: number;
  updatedAt: number;
  players: Player[];
  money: number;
  stock: Record<StockId, number>;
  menu: DrinkId[];
  /** Меню дня: что заказывают гости (подмножество menu, до CONFIG.menuSlots). */
  featured: DrinkId[];
  upgrades: Partial<Record<UpgradeId, true>>;
  ratingRecent: number[]; // удовлетворённость 0..1 последних гостей
  regulars: Partial<Record<RegularId, { visits: number; seenBy: PlayerId[] }>>;
  activeShifts: Record<PlayerId, ShiftPlan>;
  swap: null | { by: PlayerId; with: PlayerId; at: number };
  office: null | { by: PlayerId; until: number };
  applications: Application[];
  marketing: null | { id: MarketingId; guests: number; tipBonus: number; shiftsLeft: number };
  room: {
    unlocked: boolean;
    owned: string[];
    placed: Partial<Record<DecorSlot, string>>;
  };
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
  stats: { shifts: number; guestsServed: number; guestsLost: number; earned: number };
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
  | { type: 'rename'; name: string }
  | { type: 'startShift' }
  | { type: 'finishShift'; results: GuestResult[]; cleanliness?: number }
  | { type: 'abandonShift' }
  | { type: 'supplyRun'; items: Partial<Record<StockId, number>> }
  | { type: 'launchMarketing'; id: MarketingId }
  | { type: 'proposeSwap'; with?: PlayerId }
  | { type: 'acceptSwap' }
  | { type: 'declineSwap' }
  | { type: 'leaveCafe' }
  | { type: 'buyUpgrade'; id: UpgradeId }
  | { type: 'unlockDrink'; id: DrinkId }
  | { type: 'toggleFeatured'; id: DrinkId }
  | { type: 'buyDecor'; id: string }
  | { type: 'placeDecor'; slot: DecorSlot; id: string | null }
  | { type: 'adoptCat'; name: string }
  | { type: 'feedCat' }
  | { type: 'petCat' }
  | { type: 'postNote'; text: string; sticker?: string }
  | { type: 'seen' }
  | { type: 'debugRefill' };

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
