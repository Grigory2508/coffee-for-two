import { FAKE_CAFES } from './content';
import { hashString, mulberry32 } from './rng';
import type { CafeState } from './types';

export interface LeaderRow {
  name: string;
  points: number;
  you: boolean;
}

/**
 * Недельный рейтинг кофеен. В прототипе соседи — сгенерированные кофейни,
 * чьи очки растут по ходу недели; на сервере здесь будет запрос к таблице кофеен.
 */
export function leaderboard(s: CafeState, now: number): LeaderRow[] {
  const rnd = mulberry32(hashString(s.week.id));
  const weekStart = startOfIsoWeek(now);
  const progress = Math.min(1, Math.max(0.05, (now - weekStart) / (7 * 86400_000)));
  const rows: LeaderRow[] = FAKE_CAFES.slice(0, 11).map((name) => ({
    name,
    points: Math.round((80 + rnd() * 900) * progress),
    you: false,
  }));
  rows.push({ name: s.name, points: s.week.points, you: true });
  rows.sort((a, b) => b.points - a.points);
  return rows;
}

function startOfIsoWeek(ms: number): number {
  const d = new Date(ms);
  const day = (d.getUTCDay() + 6) % 7;
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - day);
}
