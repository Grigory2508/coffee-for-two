import type { DecorSlot, DrinkId, RegularId, StockId, UpgradeId } from './content';

export type PlayerId = string;

export interface Player {
  id: PlayerId;
  name: string;
  slot: 0 | 1;
  isNpc: boolean;
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
}

export interface ShiftPlan {
  seed: number;
  startedAt: number;
  guests: ShiftGuest[];
  catInCafe: boolean;
}

export type GuestOutcome = 'served' | 'wrong' | 'left';

export interface GuestResult {
  i: number;
  outcome: GuestOutcome;
  waitMs: number; // сколько гость ждал до подачи
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
  name: string;
  version: number;
  createdAt: number;
  updatedAt: number;
  players: Player[];
  money: number;
  stock: Record<StockId, number>;
  menu: DrinkId[];
  upgrades: Partial<Record<UpgradeId, true>>;
  ratingRecent: number[]; // удовлетворённость 0..1 последних гостей
  regulars: Partial<Record<RegularId, { visits: number; seenBy: PlayerId[] }>>;
  activeShifts: Record<PlayerId, ShiftPlan>;
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
  | { type: 'join'; player: { id: PlayerId; name: string } }
  | { type: 'rename'; name: string }
  | { type: 'startShift' }
  | { type: 'finishShift'; results: GuestResult[] }
  | { type: 'abandonShift' }
  | { type: 'buyStock'; item: StockId }
  | { type: 'buyUpgrade'; id: UpgradeId }
  | { type: 'unlockDrink'; id: DrinkId }
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
