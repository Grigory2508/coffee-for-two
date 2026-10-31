// API игры: все действия игроков проходят здесь. Клиент шлёт команды, сервер применяет
// ту же логику, что и клиент (src/core → _shared/core, копируется `npm run sync-server`).
import { apply, createCafe } from '../_shared/core/engine.ts';
import { GameError, type CafeState, type Command } from '../_shared/core/types.ts';
import { insert, remove, select, update } from '../_shared/db.ts';
import { verifyInitData } from '../_shared/telegram.ts';

const BOT_TOKEN = Deno.env.get('BOT_TOKEN')!;
const ALLOW_DEBUG = Deno.env.get('ALLOW_DEBUG') === '1';
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'content-type, x-telegram-init-data',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
}

function fail(code: string, params: Record<string, unknown> = {}, status = 400) {
  return json({ error: { code, params } }, status);
}

function newCode() {
  const b = new Uint8Array(8);
  crypto.getRandomValues(b);
  return Array.from(b, (x) => ALPHABET[x % ALPHABET.length]).join('');
}

interface CafeRow {
  code: string;
  state: CafeState;
  version: number;
}

interface MemberRow {
  user_id: number;
  code: string;
}

async function getMember(userId: number) {
  return (await select<MemberRow>('members', `user_id=eq.${userId}&select=user_id,code`))[0] ?? null;
}

async function getCafe(code: string) {
  return (await select<CafeRow>('cafes', `code=eq.${encodeURIComponent(code)}&select=code,state,version`))[0] ?? null;
}

function cafeColumns(s: CafeState) {
  return { state: s, version: s.version, name: s.name, week_id: s.week.id, week_points: s.week.points, updated_at: new Date().toISOString() };
}

/** Применить команду с оптимистичной блокировкой по версии (до 3 попыток при гонке двух партнёров). */
async function applyCommand(code: string, actor: string, cmd: Command) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const row = await getCafe(code);
    if (!row) throw new GameError('cafe_not_found');
    const r = apply(row.state, { actor, at: Date.now(), cmd });
    const updated = await update<CafeRow>('cafes', `code=eq.${code}&version=eq.${row.version}`, cafeColumns(r.state));
    if (updated.length) return r;
  }
  throw new GameError('conflict');
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors });
  if (req.method !== 'POST') return fail('method', {}, 405);

  const auth = await verifyInitData(req.headers.get('x-telegram-init-data') ?? '', BOT_TOKEN);
  if (!auth) return fail('unauthorized', {}, 401);
  const { user } = auth;
  const actor = `tg${user.id}`;

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return fail('bad_json');
  }

  try {
    // Запоминаем, можно ли писать игроку в личку (для сводок)
    await insert('notify_state', { user_id: user.id, can_write: !!user.allows_write_to_pm }, true).catch(() => {});

    switch (body.op) {
      case 'load': {
        const m = await getMember(user.id);
        if (!m) return json({ state: null });
        const row = await getCafe(m.code);
        return json({ state: row?.state ?? null });
      }
      case 'create': {
        const existing = await getMember(user.id);
        if (existing) {
          const row = await getCafe(existing.code);
          if (row) return json({ state: row.state });
        }
        const s = createCafe({
          code: newCode(),
          owner: { id: actor, name: user.first_name || 'Игрок' },
          npcName: String(body.npcName ?? 'Сосед Артур').slice(0, 30),
          cafeName: String(body.cafeName ?? 'Наше место').slice(0, 24),
          now: Date.now(),
        });
        await insert('cafes', { code: s.code, ...cafeColumns(s) });
        await insert('members', { user_id: user.id, code: s.code, first_name: user.first_name, lang: user.language_code ?? 'ru' }, true);
        return json({ state: s });
      }
      case 'peek': {
        const row = await getCafe(String(body.code ?? ''));
        if (!row) return json({ peek: null });
        const humans = row.state.players.filter((p) => !p.isNpc);
        return json({
          peek: { name: row.state.name, owner: humans[0]?.name ?? '', full: humans.length >= 2, isMember: row.state.players.some((p) => p.id === actor) },
        });
      }
      case 'join': {
        const code = String(body.code ?? '');
        const m = await getMember(user.id);
        if (m && m.code !== code) return fail('already_member');
        const r = await applyCommand(code, actor, { type: 'join', player: { id: actor, name: user.first_name || 'Игрок' } });
        await insert('members', { user_id: user.id, code, first_name: user.first_name, lang: user.language_code ?? 'ru' }, true);
        return json({ state: r.state });
      }
      case 'cmd': {
        const cmd = body.cmd as Command;
        if (!cmd || typeof cmd !== 'object' || typeof cmd.type !== 'string') return fail('bad_command');
        if (cmd.type === 'join') return fail('bad_command');
        if (cmd.type === 'debugRefill' && !ALLOW_DEBUG) return fail('forbidden', {}, 403);
        const m = await getMember(user.id);
        if (!m) return fail('no_cafe');
        const r = await applyCommand(m.code, actor, cmd);
        return json(r);
      }
      case 'leave': {
        await remove('members', `user_id=eq.${user.id}`);
        return json({ ok: true });
      }
      default:
        return fail('bad_op');
    }
  } catch (e) {
    if (e instanceof GameError) return fail(e.code, e.params);
    console.error(e);
    return fail('server', {}, 500);
  }
});
