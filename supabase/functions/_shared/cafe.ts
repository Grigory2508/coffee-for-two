// Общие серверные операции с кофейней: чтение, применение команды с блокировкой по версии,
// банк самоцветов (самоцветы личные и не пропадают при уходе из кофейни).
import { apply, migrate } from './core/engine.ts';
import { GameError, type CafeState, type Command } from './core/types.ts';
import { insert, remove, select, update } from './db.ts';

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
  user_id: number;
  gems: number;
}

/** Положить самоцветы игрока в банк (он ушёл из кофейни или оплатил, не состоя ни в одной). */
export async function bankGems(userId: number, gems: number) {
  if (gems <= 0) return;
  const cur = (await select<BankRow>('gem_bank', `user_id=eq.${userId}&select=user_id,gems`))[0];
  await insert('gem_bank', { user_id: userId, gems: (cur?.gems ?? 0) + gems, updated_at: new Date().toISOString() }, true);
}

/** Выдать игроку его самоцветы из банка в текущей кофейне. */
export async function releaseBank(userId: number, code: string) {
  const cur = (await select<BankRow>('gem_bank', `user_id=eq.${userId}&select=user_id,gems`))[0];
  if (!cur || cur.gems <= 0) return;
  await applyCommand(code, 'system', { type: 'grantGems', player: `tg${userId}`, amount: cur.gems, ref: 'bank' });
  await remove('gem_bank', `user_id=eq.${userId}`);
}
