import { createContext } from 'preact';
import { useContext } from 'preact/hooks';
import { HALL_BY_ID, HALL_FLOOR_BY_ID, HALL_WALL_BY_ID, CAFE_DECOR_BY_ID, CAFE_SLOTS, DECOR_BY_ID, DRINKS, MARKETING, REGULARS, ROLES, ROOMS, STOCK_PACKS, type DrinkId, type MarketingId, type RegularId, type Role, type StockId, type CafeSlot } from '../core/content';
import type { ApplyResult } from '../core/engine';
import type { CafeState, Command, LogEntry } from '../core/types';
import { L, t } from '../i18n';
import type { Backend } from '../net/backend';
import type { Identity } from '../platform/identity';

export interface Game {
  state: CafeState;
  me: Identity;
  now: number;
  backend: Backend;
  /** Отправить команду. Ошибки показываются тостом; возвращает null при ошибке. */
  send(cmd: Command, opts?: { quiet?: boolean }): Promise<ApplyResult | null>;
  toast(text: string): void;
  /** Перечитать состояние с сервера (например, после оплаты). */
  refresh(): Promise<void>;
  /** Игрок вышел из кофейни — вернуться на стартовый экран. */
  onLeft(): void;
}

export const GameCtx = createContext<Game | null>(null);

export function useGame(): Game {
  const g = useContext(GameCtx);
  if (!g) throw new Error('GameCtx missing');
  return g;
}

export function playerName(s: CafeState, id: string): string {
  if (id === 'system') return '';
  return s.players.find((p) => p.id === id)?.name ?? t('someone');
}

function itemName(kind: string, id: string): string {
  if (kind === 'stock_bought') return L(STOCK_PACKS[id as StockId]?.name ?? { ru: id, en: id });
  if (kind === 'slot_upgraded') {
    const [slot, lvl] = id.split(':');
    const sl = CAFE_SLOTS[slot as CafeSlot];
    return sl ? `${L(sl.name)}: ${L(sl.levels[Number(lvl) - 1]?.name ?? sl.name)}` : id;
  }
  if (kind === 'drink_unlocked') return L(DRINKS[id as DrinkId]?.name ?? { ru: id, en: id });
  if (kind === 'decor_bought' || kind === 'decor_placed') return L(DECOR_BY_ID[id]?.name ?? { ru: id, en: id });
  if (kind === 'cafe_decor_bought') return L((HALL_BY_ID[id] ?? HALL_WALL_BY_ID[id] ?? HALL_FLOOR_BY_ID[id] ?? CAFE_DECOR_BY_ID[id])?.name ?? { ru: id, en: id });
  if (kind === 'marketing_launched') return L(MARKETING[id as MarketingId]?.name ?? { ru: id, en: id });
  if (kind === 'regular_story') return L(REGULARS[id as RegularId]?.name ?? { ru: id, en: id });
  return id;
}

export function describeLog(s: CafeState, e: LogEntry): string {
  const p = e.p ?? {};
  const id = p.slot ? `${p.slot}:${p.level}` : String(p.item ?? p.id ?? p.regular ?? '');
  const kind = p.slot ? 'slot_upgraded' : e.kind;
  return t(`log_${e.kind}`, {
    ...p,
    who: playerName(s, String(e.actor)),
    item: itemName(kind, id),
    sticker: String(p.sticker ?? ''),
    text: String(p.text ?? ''),
    role: p.role ? roleName(String(p.role) as Role).toLowerCase() : '',
    room: p.room ? roomTitle(s, String(p.room), '') : '',
    gift: p.kind === 'gift' ? t('giftWordGift') : p.kind === 'postcard' ? t('giftWordPostcard') : '',
  }).replace(/\s+/g, ' ').trim();
}

/** Название комнаты: «Зал», «Кухня» или «Комната · Имя». */
export function roomTitle(s: CafeState, key: string, meId: string): string {
  const r = s.home?.rooms[key];
  if (!r) return key;
  if (r.kind !== 'bedroom') return L(ROOMS[r.kind].name);
  return r.owner === meId ? t('roomMine') : t('roomOf', { name: playerName(s, String(r.owner)) });
}

export function timeAgo(now: number, at: number): string {
  const m = Math.floor((now - at) / 60_000);
  if (m < 1) return '•';
  if (m < 60) return `${m}′`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

export function roleName(r: Role): string {
  return L(ROLES[r].name);
}
