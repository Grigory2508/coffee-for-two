// API игры: все действия игроков проходят здесь. Клиент шлёт команды, сервер применяет
// ту же логику, что и клиент (src/core → _shared/core, копируется `npm run sync-server`).
import { createCafe, dayKey, weekId } from '../_shared/core/engine.ts';
import { applyCommand, bankGems, cafeColumns, getCafe, releaseBank } from '../_shared/cafe.ts';
import { GameError, type CafeState, type Command, type Player } from '../_shared/core/types.ts';
import { peekOf } from '../_shared/core/peek.ts';
import { GEM_PACKS, type Logo, type Role } from '../_shared/core/content.ts';
import { insert, remove, select, update } from '../_shared/db.ts';
import { botApi, verifyInitData } from '../_shared/telegram.ts';

const BOT_TOKEN = Deno.env.get('BOT_TOKEN')!;
const ALLOW_DEBUG = Deno.env.get('ALLOW_DEBUG') === '1';
const BOT = Deno.env.get('BOT_USERNAME') ?? '';
const APP = Deno.env.get('APP_SHORTNAME') ?? 'play';
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

interface MemberRow {
  user_id: number;
  code: string;
}

async function getMember(userId: number) {
  return (await select<MemberRow>('members', `user_id=eq.${userId}&select=user_id,code`))[0] ?? null;
}

const tgId = (playerId: string) => (/^tg\d+$/.test(playerId) ? Number(playerId.slice(2)) : null);

interface LangRow {
  user_id: number;
  lang: string;
}

const isRu = (lang: string) => /^(ru|uk|be|kk|hy|ka|uz|ky|az)/.test(lang);

/** Языки сотрудников кофейни (для сообщений бота). */
async function staffLangs(code: string) {
  const rows = await select<LangRow>('members', `code=eq.${encodeURIComponent(code)}&select=user_id,lang`);
  return new Map(rows.map((r) => [r.user_id, r.lang]));
}

/** Сообщение от бота с кнопкой «Открыть кофейню». Ошибки (нет разрешения писать и т.п.) не мешают игре. */
async function notify(userId: number, lang: string, ru: string, en: string, param = 'bot') {
  if (!BOT) return;
  const r = isRu(lang);
  await botApi(BOT_TOKEN, 'sendMessage', {
    chat_id: userId,
    text: r ? ru : en,
    reply_markup: { inline_keyboard: [[{ text: r ? '☕ Открыть кофейню' : '☕ Open the café', url: `https://t.me/${BOT}/${APP}?startapp=${param}` }]] },
  }).catch(() => undefined);
}

const roleRu = { barista: 'бариста', manager: 'менеджер' } as const;
const roleEn = { barista: 'barista', manager: 'manager' } as const;

/** Пост-обработка команды: членство и уведомления о составе команды. */
async function afterCommand(cmd: Command, before: CafeState, after: CafeState, actorName: string) {
  const humansOf = (s: CafeState) => s.players.filter((p) => !p.isNpc);
  const was = humansOf(before);
  const now = humansOf(after);
  const langs = await staffLangs(after.code);
  const fallback = langs.get(tgId(after.ownerId) ?? 0) ?? 'ru';
  // Новые сотрудники: членство + «тебя приняли»
  for (const p of now.filter((x) => !was.some((y) => y.id === x.id))) {
    const id = tgId(p.id);
    if (!id) continue;
    await insert('members', { user_id: id, code: after.code, first_name: p.name, lang: fallback }, true);
    await releaseBank(id, after.code).catch((e) => console.error('bank', e));
    await notify(
      id,
      fallback,
      `Тебя приняли в кофейню «${after.name}» ☕ Твоя роль — ${roleRu[p.role]}.`,
      `You're in! Welcome to “${after.name}” ☕ Your role: ${roleEn[p.role]}.`,
    );
  }
  // Ушедшие: снимаем членство
  for (const p of was.filter((x) => !now.some((y) => y.id === x.id))) {
    const id = tgId(p.id);
    if (!id) continue;
    await remove('members', `user_id=eq.${id}&code=eq.${after.code}`);
    await bankGems(id, p.gems ?? 0).catch((e) => console.error('bank', e));
    if (cmd.type === 'removeStaff') {
      await notify(id, langs.get(id) ?? fallback, `Тебя убрали из команды кофейни «${after.name}». Можно открыть свою.`, `You were removed from “${after.name}”. You can open your own café.`);
    }
  }
  // Отклонённая заявка
  if (cmd.type === 'rejectApplication') {
    const id = tgId(cmd.id);
    if (id) await notify(id, fallback, `Заявку в кофейню «${after.name}» отклонил(а) ${actorName}.`, `${actorName} declined your application to “${after.name}”.`);
  }
}

interface RatingDbRow {
  code: string;
  name: string;
  week_id: string;
  week_points: number;
  today: { day: string; points: number } | null;
  points: number | null;
  logo: Logo | null;
}

/** Рейтинги считаем по таблице кофеен (пока кофеен немного — берём до 1000 недавних и сортируем здесь). */
async function ratings(myCode: string | null) {
  const rows = await select<RatingDbRow>(
    'cafes',
    'select=code,name,week_id,week_points,today:state->today,points:state->stats->points,logo:state->logo&order=updated_at.desc&limit=1000',
  );
  const now = Date.now();
  const day = dayKey(now);
  const wk = weekId(now);
  const board = (pts: (r: RatingDbRow) => number) =>
    rows
      .map((r) => ({ code: r.code, name: r.name, logo: r.logo, points: pts(r), you: r.code === myCode }))
      .filter((r) => r.points > 0 || r.you)
      .sort((a, b) => b.points - a.points)
      .slice(0, 100)
      .concat([]);
  const withMe = (list: ReturnType<typeof board>, pts: (r: RatingDbRow) => number) => {
    if (!myCode || list.some((r) => r.you)) return list;
    const mine = rows.find((r) => r.code === myCode);
    return mine ? [...list, { code: mine.code, name: mine.name, logo: mine.logo, points: pts(mine), you: true }] : list;
  };
  const today = (r: RatingDbRow) => (r.today?.day === day ? r.today.points : 0);
  const week = (r: RatingDbRow) => (r.week_id === wk ? r.week_points : 0);
  const all = (r: RatingDbRow) => r.points ?? r.week_points ?? 0;
  return { today: withMe(board(today), today), week: withMe(board(week), week), all: withMe(board(all), all) };
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
        // Игрока могли убрать из кофейни (смена напарника) — тогда членство больше не действует
        if (!row || !row.state.players.some((p) => p.id === actor)) {
          await remove('members', `user_id=eq.${user.id}`);
          return json({ state: null });
        }
        return json({ state: row.state });
      }
      case 'create': {
        const existing = await getMember(user.id);
        if (existing) {
          const row = await getCafe(existing.code);
          if (row && row.state.players.some((p) => p.id === actor)) return json({ state: row.state });
          await remove('members', `user_id=eq.${user.id}`);
        }
        const role: Role = body.role === 'manager' ? 'manager' : 'barista';
        const s = createCafe({
          code: newCode(),
          owner: { id: actor, name: user.first_name || 'Игрок' },
          role,
          npcName: String(body.npcName ?? 'Сосед Артур').slice(0, 30),
          cafeName: String(body.cafeName ?? 'Наше место').slice(0, 24),
          logo: (body.logo ?? undefined) as Logo | undefined,
          now: Date.now(),
        });
        await insert('cafes', { code: s.code, ...cafeColumns(s) });
        await insert('members', { user_id: user.id, code: s.code, first_name: user.first_name, lang: user.language_code ?? 'ru' }, true);
        await releaseBank(user.id, s.code).catch((e) => console.error('bank', e));
        const fresh = await getCafe(s.code);
        return json({ state: fresh?.state ?? s });
      }
      case 'peek': {
        const row = await getCafe(String(body.code ?? ''));
        if (!row) return json({ peek: null });
        const peek = peekOf(row.state, actor, String(body.key ?? ''));
        // Принятому сотруднику сразу оформляем членство (на случай, если пост-обработка не успела)
        if (peek.isMember && !(await getMember(user.id))) {
          await insert('members', { user_id: user.id, code: row.code, first_name: user.first_name, lang: user.language_code ?? 'ru' }, true);
        }
        return json({ peek });
      }
      case 'apply': {
        const code = String(body.code ?? '');
        const m = await getMember(user.id);
        if (m && m.code !== code) {
          // Членство в кофейне, из которой игрока уже убрали, не мешает подать заявку в новую
          const old = await getCafe(m.code);
          if (old && old.state.players.some((p) => p.id === actor)) return fail('already_member');
          await remove('members', `user_id=eq.${user.id}`);
        }
        const role: Role = body.role === 'manager' ? 'manager' : 'barista';
        const name = user.first_name || 'Игрок';
        const r = await applyCommand(code, actor, { type: 'apply', player: { id: actor, name }, key: String(body.key ?? ''), role });
        // Сразу пишем всем сотрудникам — заявка ждёт их одобрения
        const langs = await staffLangs(code);
        for (const p of r.state.players.filter((x: Player) => !x.isNpc)) {
          const id = tgId(p.id);
          if (!id) continue;
          await notify(
            id,
            langs.get(id) ?? 'ru',
            `📝 ${name} хочет работать в «${r.state.name}» (${roleRu[role]}). Зайди и одобри или отклони заявку.`,
            `📝 ${name} wants to join “${r.state.name}” as ${roleEn[role]}. Open the café to approve or decline.`,
          );
        }
        return json({ ok: true });
      }
      case 'cancel': {
        const code = String(body.code ?? '');
        await applyCommand(code, actor, { type: 'cancelApplication' }).catch((e) => {
          if (!(e instanceof GameError)) throw e;
        });
        return json({ ok: true });
      }
      case 'cmd': {
        const cmd = body.cmd as Command;
        if (!cmd || typeof cmd !== 'object' || typeof cmd.type !== 'string') return fail('bad_command');
        if (cmd.type === 'join' || cmd.type === 'grantGems') return fail('bad_command');
        if (cmd.type.startsWith('debug') && !ALLOW_DEBUG) return fail('forbidden', {}, 403);
        const m = await getMember(user.id);
        if (!m) return fail('no_cafe');
        const before = await getCafe(m.code);
        const r = await applyCommand(m.code, actor, cmd);
        if (before && ['approveApplication', 'rejectApplication', 'removeStaff', 'leaveCafe'].includes(cmd.type)) {
          await afterCommand(cmd, before.state, r.state, user.first_name || '');
        }
        return json(r);
      }
      case 'ratings': {
        const m = await getMember(user.id);
        return json(await ratings(m?.code ?? null));
      }
      case 'invoice': {
        // Пачка самоцветов за Telegram Stars: счёт создаёт бот, начисление — в вебхуке после successful_payment
        const pack = GEM_PACKS.find((x) => x.id === body.pack);
        if (!pack) return fail('bad_item');
        const ru = /^(ru|uk|be|kk|hy|ka|uz|ky|az)/.test(user.language_code ?? 'ru');
        const gems = pack.gems + Math.round((pack.gems * (pack.bonus ?? 0)) / 100);
        const r = await botApi<string>(BOT_TOKEN, 'createInvoiceLink', {
          title: ru ? `${gems} самоцветов` : `${gems} gems`,
          description: ru ? 'Самоцветы для кофейни: смена вывески и другие улучшения.' : 'Gems for your café: change the sign and more.',
          payload: `gems:${pack.id}:${user.id}`,
          currency: 'XTR',
          prices: [{ label: ru ? 'Самоцветы' : 'Gems', amount: pack.stars }],
        });
        if (!r.ok || !r.result) {
          console.error('invoice', r.description);
          return fail('server', {}, 500);
        }
        return json({ url: r.result });
      }
      case 'leave': {
        // Самоцветы ушедшего уже лежат в банке (afterCommand для leaveCafe/removeStaff)
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
