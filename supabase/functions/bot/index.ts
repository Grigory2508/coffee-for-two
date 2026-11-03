// Бот: вебхук (/start, /paysupport, /terms, инлайн-приглашения, платежи) и рассылка сводок по cron.
import { digestFor } from '../_shared/core/engine.ts';
import type { CafeState, LogEntry } from '../_shared/core/types.ts';
import { insert, select, update } from '../_shared/db.ts';
import { botApi } from '../_shared/telegram.ts';

const TOKEN = Deno.env.get('BOT_TOKEN')!;
const WEBHOOK_SECRET = Deno.env.get('WEBHOOK_SECRET') ?? '';
const CRON_SECRET = Deno.env.get('CRON_SECRET') ?? '';
const BOT = Deno.env.get('BOT_USERNAME')!; // без @
const APP = Deno.env.get('APP_SHORTNAME') ?? 'play';
const MIN_GAP_MS = 8 * 3600_000; // не чаще ~2 сообщений в день

const link = (param: string) => `https://t.me/${BOT}/${APP}?startapp=${param}`;

type Lang = 'ru' | 'en';
const L = (lang: string): Lang => (/^(ru|uk|be|kk|hy|ka|uz|ky|az)/.test(lang) ? 'ru' : 'en');

const TEXT = {
  start: {
    ru: 'Привет! Это кофейня на двоих ☕\nОткройте кафе вместе: по 5 минут в день, один за стойкой, другой за закупками. На выручку обустроите квартиру над кофейней и заведёте кота.',
    en: 'Hi! This is a café for two ☕\nRun it together: 5 minutes a day, one at the counter, the other on supplies. Spend the earnings on the flat upstairs and adopt a cat.',
  },
  open: { ru: 'Открыть кофейню', en: 'Open the café' },
  invite: { ru: 'Войти в кофейню', en: 'Join the café' },
  inviteTitle: { ru: 'Позвать в кофейню', en: 'Invite to the café' },
  inviteText: { ru: 'Давай откроем кофейню вдвоём ☕ По 5 минут в день, прямо в Telegram.', en: 'Let’s run a café together ☕ 5 minutes a day, right in Telegram.' },
  noCafe: { ru: 'Сначала откройте свою кофейню', en: 'Open your café first' },
  paysupport: {
    ru: 'Поддержка по покупкам: опишите проблему ответом на это сообщение — мы ответим в течение 48 часов. Возврат Stars возможен, если покупка не была получена.',
    en: 'Purchase support: reply to this message describing the problem — we answer within 48 hours. Stars are refunded if a purchase was not delivered.',
  },
  terms: {
    ru: 'Условия: игра бесплатна, покупки за Telegram Stars — цифровые предметы внутри игры. Мы храним только ваш Telegram ID, имя и игровой прогресс. Удалить данные: напишите /paysupport.',
    en: 'Terms: the game is free; Telegram Stars purchases are in-game digital items. We store only your Telegram ID, name and progress. To delete your data write /paysupport.',
  },
  digestHead: { ru: '☕ Новости кофейни «{name}»', en: '☕ News from “{name}”' },
};

function fmt(s: string, p: Record<string, string | number>) {
  return s.replace(/\{(\w+)\}/g, (_, k) => String(p[k] ?? ''));
}

function describe(s: CafeState, e: LogEntry, lang: Lang): string | null {
  const who = s.players.find((p) => p.id === e.actor)?.name ?? '';
  const p = e.p ?? {};
  const ru = lang === 'ru';
  switch (e.kind) {
    case 'partner_joined':
      return ru ? `${who} теперь с вами в кофейне! 🎉` : `${who} joined your café! 🎉`;
    case 'shift_done':
      return ru ? `${who} отработал(а) смену: +${p.earned} 🪙` : `${who} worked a shift: +${p.earned} 🪙`;
    case 'npc_shift':
      return ru ? `${who} подменил(а) на смене: +${p.earned} 🪙` : `${who} covered a shift: +${p.earned} 🪙`;
    case 'stock_bought':
    case 'supply_run':
      return ru ? `${who} пополнил(а) склад` : `${who} restocked`;
    case 'marketing_launched':
      return ru ? `${who} запустил(а) рекламу — гостей станет больше 📣` : `${who} launched a campaign — more guests coming 📣`;
    case 'npc_cover':
      return ru ? 'Сосед подменил напарника, пока его не было' : 'The neighbour covered for your partner';
    case 'swap_proposed':
      return ru ? `${who} предлагает поменяться ролями — зайди и ответь 🔄` : `${who} suggests swapping roles — open the café to answer 🔄`;
    case 'swap_accepted':
      return ru ? 'Вы поменялись ролями 🔄' : 'You swapped roles 🔄';
    case 'partner_left':
      return ru ? `${p.name} вышел(ла) из кофейни, его место занял сосед` : `${p.name} left the café; the neighbour took the spot`;
    case 'partner_replaced':
      return ru ? 'Тебя убрали из кофейни' : 'You were removed from the café';
    case 'note':
      return `${who}: ${p.sticker ?? ''} ${p.text ?? ''}`.trim();
    case 'room_unlocked':
      return ru ? 'Вам сдали квартиру над кофейней! 🏠' : 'You got the flat above the café! 🏠';
    case 'cat_hungry':
      return ru ? `${p.name} проголодался и сидит у миски 🐈` : `${p.name} is hungry and sitting by the bowl 🐈`;
    case 'stock_low':
      return ru ? 'Продукты на исходе 📦' : 'Supplies are running low 📦';
    case 'cat_adopted':
      return ru ? `У вас котёнок: ${p.name} 🐈` : `You adopted a kitten: ${p.name} 🐈`;
    default:
      return null;
  }
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

// ---------- сводки ----------

interface MemberRow {
  user_id: number;
  code: string;
  lang: string;
}
interface NotifyRow {
  user_id: number;
  can_write: boolean;
  blocked: boolean;
  last_notified_at: string | null;
  last_log_id: number;
}

async function runDigest() {
  const members = await select<MemberRow>('members', 'select=user_id,code,lang');
  const states = await select<NotifyRow>('notify_state', 'select=*');
  const byUser = new Map(states.map((n) => [n.user_id, n]));
  const cafes = new Map<string, CafeState>();
  let sent = 0;
  for (const m of members) {
    const n = byUser.get(m.user_id);
    if (!n?.can_write || n.blocked) continue;
    if (n.last_notified_at && Date.now() - Date.parse(n.last_notified_at) < MIN_GAP_MS) continue;
    let s = cafes.get(m.code);
    if (!s) {
      const row = (await select<{ state: CafeState }>('cafes', `code=eq.${m.code}&select=state`))[0];
      if (!row) continue;
      s = row.state;
      cafes.set(m.code, s);
    }
    const lang = L(m.lang);
    const entries = digestFor(s, `tg${m.user_id}`).filter((e) => e.id > n.last_log_id);
    const lines = entries.map((e) => describe(s!, e, lang)).filter((x): x is string => !!x);
    if (!lines.length) continue;
    const text = [fmt(TEXT.digestHead[lang], { name: s.name }), ...lines.slice(-5).map((l) => `• ${l}`)].join('\n');
    const r = await botApi(TOKEN, 'sendMessage', {
      chat_id: m.user_id,
      text,
      reply_markup: { inline_keyboard: [[{ text: TEXT.open[lang], url: link('bot') }]] },
    });
    const maxId = Math.max(n.last_log_id, ...entries.map((e) => e.id));
    if (r.ok) {
      sent++;
      await update('notify_state', `user_id=eq.${m.user_id}`, { last_notified_at: new Date().toISOString(), last_log_id: maxId });
    } else if (r.error_code === 403) {
      await update('notify_state', `user_id=eq.${m.user_id}`, { blocked: true });
    }
  }
  return sent;
}

// ---------- вебхук ----------

// deno-lint-ignore no-explicit-any
type Update = any;

async function onUpdate(u: Update) {
  if (u.message?.text) {
    const msg = u.message;
    const lang = L(msg.from?.language_code ?? 'ru');
    const [cmd, param] = String(msg.text).split(/\s+/);
    if (cmd === '/start') {
      await insert('notify_state', { user_id: msg.from.id, can_write: true, blocked: false }, true).catch(() => {});
      const startParam = param && /^cafe_[A-Z0-9]{4,16}(_[A-Z0-9]{3,10})?$/.test(param) ? param : 'bot';
      await botApi(TOKEN, 'sendMessage', {
        chat_id: msg.chat.id,
        text: TEXT.start[lang],
        reply_markup: { inline_keyboard: [[{ text: startParam === 'bot' ? TEXT.open[lang] : TEXT.invite[lang], url: link(startParam) }]] },
      });
    } else if (cmd === '/paysupport') {
      await botApi(TOKEN, 'sendMessage', { chat_id: msg.chat.id, text: TEXT.paysupport[lang] });
    } else if (cmd === '/terms') {
      await botApi(TOKEN, 'sendMessage', { chat_id: msg.chat.id, text: TEXT.terms[lang] });
    }
  }

  if (u.message?.successful_payment) {
    const p = u.message.successful_payment;
    await insert('payments', {
      charge_id: p.telegram_payment_charge_id,
      user_id: u.message.from.id,
      payload: p.invoice_payload,
      amount: p.total_amount,
    }, true);
    // TODO: выдать покупку (идемпотентно по charge_id) — тестовый пак появится в MVP-тесте
  }

  if (u.pre_checkout_query) {
    await botApi(TOKEN, 'answerPreCheckoutQuery', { pre_checkout_query_id: u.pre_checkout_query.id, ok: true });
  }

  if (u.my_chat_member && u.my_chat_member.chat.type === 'private') {
    const st = u.my_chat_member.new_chat_member.status;
    const id = u.my_chat_member.from.id;
    await insert('notify_state', { user_id: id, blocked: st === 'kicked', can_write: st !== 'kicked' }, true).catch(() => {});
  }

  // Инлайн-режим: @бот в любом чате → карточка-приглашение в свою кофейню.
  // Кнопка — url на Direct Link (web_app-кнопки в чужих чатах не работают).
  if (u.inline_query) {
    const q = u.inline_query;
    const lang = L(q.from?.language_code ?? 'ru');
    const member = (await select<MemberRow>('members', `user_id=eq.${q.from.id}&select=user_id,code,lang`))[0];
    const cafe = member ? (await select<{ state: CafeState }>('cafes', `code=eq.${member.code}&select=state`))[0] : undefined;
    const key = cafe?.state.inviteKey ?? '';
    const results = member
      ? [
          {
            type: 'article',
            id: `invite-${member.code}`,
            title: TEXT.inviteTitle[lang],
            description: TEXT.inviteText[lang],
            input_message_content: { message_text: TEXT.inviteText[lang] },
            reply_markup: { inline_keyboard: [[{ text: TEXT.invite[lang], url: link(`cafe_${member.code}${key ? `_${key}` : ''}`) }]] },
          },
        ]
      : [];
    await botApi(TOKEN, 'answerInlineQuery', {
      inline_query_id: q.id,
      results,
      cache_time: 30,
      is_personal: true,
      ...(member ? {} : { button: { text: TEXT.noCafe[lang], start_parameter: 'inline' } }),
    });
  }
}

Deno.serve(async (req) => {
  const url = new URL(req.url);
  if (url.searchParams.get('cron') === 'digest') {
    if (!CRON_SECRET || req.headers.get('x-cron-secret') !== CRON_SECRET) return json({ error: 'forbidden' }, 403);
    const sent = await runDigest();
    return json({ ok: true, sent });
  }
  if (req.method !== 'POST') return json({ ok: true });
  if (WEBHOOK_SECRET && req.headers.get('x-telegram-bot-api-secret-token') !== WEBHOOK_SECRET) return json({ error: 'forbidden' }, 403);
  try {
    await onUpdate(await req.json());
  } catch (e) {
    console.error(e);
  }
  // Telegram ждёт 200, иначе будет повторять доставку
  return json({ ok: true });
});
