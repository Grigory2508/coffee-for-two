// Общие серверные операции с кофейней: чтение, применение команды с блокировкой по версии,
// банк самоцветов (самоцветы личные и не пропадают при уходе из кофейни).
import { apply, migrate } from './core/engine.ts';
import { GameError, type CafeState, type Command } from './core/types.ts';
import { insert, select, update } from './db.ts';

export interface CafeRow {
  code: string;
  state: CafeState;
  version: number;
}

export async function getCafe(code: string) {
  const row = (await select<CafeRow>('cafes', `code=eq.${encodeURIComponent(code)}&select=code,state,version`))[0] ?? null;
  if (row) row.state = migrate(row.state);
  return row;
}

export function cafeColumns(s: CafeState) {
  return { state: s, version: s.version, name: s.name, week_id: s.week.id, week_points: s.week.points, updated_at: new Date().toISOString() };
}

/** Применить команду с оптимистичной блокировкой по версии (до 3 попыток при гонке). */
export async function applyCommand(code: string, actor: string, cmd: Command) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const row = await getCafe(code);
    if (!row) throw new GameError('cafe_not_found');
    const r = apply(row.state, { actor, at: Date.now(), cmd });
    const updated = await update<CafeRow>('cafes', `code=eq.${code}&version=eq.${row.version}`, cafeColumns(r.state));
    if (updated.length) return r;
  }
  throw new GameError('conflict');
}

interface BankRow {
  charge_id: string;
  amount: number;
}

// Банк самоцветов живёт в таблице payments (новая таблица не нужна): строка с payload 'bank' —
// вклад в банк, refunded=true — уже выдан в кофейню.

/** Положить самоцветы игрока в банк (он ушёл из кофейни или оплатил, не состоя ни в одной). */
export async function bankGems(userId: number, gems: number) {
  if (gems <= 0) return;
  await insert('payments', { charge_id: `bank:${userId}:${crypto.randomUUID()}`, user_id: userId, payload: 'bank', amount: gems });
}

/** Выдать игроку его самоцветы из банка в текущей кофейне. */
export async function releaseBank(userId: number, code: string) {
  const rows = await select<BankRow>('payments', `user_id=eq.${userId}&payload=eq.bank&refunded=eq.false&select=charge_id,amount`);
  const total = rows.reduce((n, r) => n + r.amount, 0);
  if (total <= 0) return;
  // Сначала помечаем выданными (чтобы при гонке не выдать дважды), потом начисляем
  const ids = rows.map((r) => `"${r.charge_id}"`).join(',');
  const marked = await update<BankRow>('payments', `charge_id=in.(${encodeURIComponent(ids)})&refunded=eq.false`, { refunded: true });
  const sum = marked.reduce((n, r) => n + r.amount, 0);
  if (sum > 0) await applyCommand(code, 'system', { type: 'grantGems', player: `tg${userId}`, amount: sum, ref: 'bank' });
}
