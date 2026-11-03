import { createContext } from 'preact';
import { useContext } from 'preact/hooks';
import { DECOR_BY_ID, DRINKS, MARKETING, REGULARS, ROLES, STOCK_PACKS, UPGRADES, type DrinkId, type MarketingId, type RegularId, type Role, type StockId, type UpgradeId } from '../core/content';
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
  send(cmd: Command): Promise<ApplyResult | null>;
  toast(text: string): void;
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
  if (kind === 'upgrade_bought') return L(UPGRADES[id as UpgradeId]?.name ?? { ru: id, en: id });
  if (kind === 'drink_unlocked') return L(DRINKS[id as DrinkId]?.name ?? { ru: id, en: id });
  if (kind === 'decor_bought' || kind === 'decor_placed') return L(DECOR_BY_ID[id]?.name ?? { ru: id, en: id });
  if (kind === 'marketing_launched') return L(MARKETING[id as MarketingId]?.name ?? { ru: id, en: id });
  if (kind === 'regular_story') return L(REGULARS[id as RegularId]?.name ?? { ru: id, en: id });
  return id;
}

export function describeLog(s: CafeState, e: LogEntry): string {
  const p = e.p ?? {};
  const id = String(p.item ?? p.id ?? p.regular ?? '');
  return t(`log_${e.kind}`, {
    ...p,
    who: playerName(s, String(e.actor)),
    item: itemName(e.kind, id),
    sticker: String(p.sticker ?? ''),
    text: String(p.text ?? ''),
    role: p.role ? roleName(String(p.role) as Role).toLowerCase() : '',
  }).replace(/\s+/g, ' ').trim();
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
