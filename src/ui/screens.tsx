import { useState } from 'preact/hooks';
import {
  CONFIG,
  DECOR,
  DRINKS,
  DRINK_ORDER,
  COMPONENTS,
  REGULARS,
  REGULAR_ORDER,
  SLOT_LABEL,
  SLOT_ORDER,
  STICKERS,
  STOCK_ORDER,
  STOCK_PACKS,
  UPGRADES,
  UPGRADE_ORDER,
  type DecorSlot,
} from '../core/content';
import { capacity, digestFor, energyNow, getPlayer, level, packPrice, partnerOf, rating, roomGate, type ShiftSummary } from '../core/engine';
import { leaderboard } from '../core/leaderboard';
import { fmtDuration, L, t } from '../i18n';
import { inviteLink } from '../net/backend';
import { track } from '../platform/analytics';
import { tg } from '../platform/telegram';
import { CafeScene, CatPortrait, DecorIcon, RoomScene } from './art';
import { describeLog, playerName, timeAgo, useGame } from './game';

// ---------- общие куски ----------

export function Stars({ value }: { value: number | null }) {
  if (value === null) return <span class="stars muted">★ {t('ratingNew')}</span>;
  return (
    <span class="stars">
      ★ {value.toFixed(1)}
    </span>
  );
}

export function Header() {
  const { state } = useGame();
  return (
    <header class="header">
      <div class="header-name">{state.name}</div>
      <div class="header-stats">
        <span class="money">🪙 {state.money}</span>
        <Stars value={rating(state)} />
      </div>
    </header>
  );
}

function Energy() {
  const { state, me, now } = useGame();
  const p = getPlayer(state, me.id)!;
  const e = energyNow(p, now);
  return (
    <div class="energy">
      <span class="label">{t('energy')}</span>
      <span class="pips">
        {Array.from({ length: CONFIG.energyMax }, (_, i) => (
          <span class={`pip ${i < e.energy ? 'on' : ''}`} />
        ))}
      </span>
      <span class="muted small">{e.nextAt ? t('energyNext', { t: fmtDuration(e.nextAt - now) }) : t('energyFull')}</span>
    </div>
  );
}

export async function sharePartnerInvite(code: string, toast: (s: string) => void, source: string) {
  const url = inviteLink(code);
  const how = await tg.share(url, t('inviteShareText'));
  track('invite_sent', { source, how });
  if (how === 'clipboard') toast(t('inviteCopied'));
}

// ---------- кофейня ----------

export function CafeTab({ onStartShift }: { onStartShift: () => void }) {
  const { state, me, now, send, toast } = useGame();
  const p = getPlayer(state, me.id)!;
  const partner = partnerOf(state, me.id);
  const e = energyNow(p, now);
  const digest = digestFor(state, me.id);
  const gate = roomGate(state);
  const active = !!state.activeShifts[me.id];
  const catHere = !!state.cat && state.cat.hunger > 40 && state.cat.mood > 50;

  return (
    <div class="tab">
      <CafeScene cat={catHere} busy={active} />

      <div class="card partner-card">
        {partner?.isNpc ? (
          <>
            <div class="row">
              <span class="avatar">🧓</span>
              <div class="grow">
                <b>{t('npcPartner', { name: partner.name })}</b>
                <div class="muted small">{t('npcHint')}</div>
              </div>
            </div>
            <button class="btn primary wide" onClick={() => sharePartnerInvite(state.code, toast, 'cafe_card')}>
              💌 {t('invitePartner')}
            </button>
          </>
        ) : partner ? (
          <div class="row">
            <span class="avatar">🧑‍🍳</span>
            <div class="grow">
              <div class="muted small">{t('partner')}</div>
              <b>{partner.name}</b>
            </div>
            <span class="muted small">{timeAgo(now, partner.lastSeenAt)}</span>
          </div>
        ) : null}
      </div>

      {digest.length > 0 && (
        <div class="card digest">
          <div class="card-title">📬 {t('whileAway')}</div>
          <ul class="log">
            {digest.slice(-6).map((d) => (
              <li>
                <span class="muted small">{timeAgo(now, d.at)}</span> {describeLog(state, d)}
              </li>
            ))}
          </ul>
          <button class="btn ghost small" onClick={() => send({ type: 'seen' })}>
            {t('gotIt')}
          </button>
        </div>
      )}

      <div class="card">
        <Energy />
        <button class="btn primary big wide" disabled={!active && e.energy < 1} onClick={onStartShift}>
          {active ? t('continueShift') : t('startShift')}
        </button>
        {!active && e.energy < 1 && e.nextAt && <div class="muted small center">{t('noEnergy', { t: fmtDuration(e.nextAt - now) })}</div>}
        {catHere && <div class="small center">🐈 {t('catInCafe', { name: state.cat!.name })}</div>}
      </div>

      {!state.room.unlocked ? (
        <div class="card">
          <div class="card-title">🏠 {t('goalsTitle')}</div>
          <Progress label={t('goalStars', { v: gate.stars.toFixed(1), need: gate.needStars })} value={gate.stars / gate.needStars} />
          <Progress label={t('goalShifts', { v: gate.shifts, need: gate.needShifts })} value={gate.shifts / gate.needShifts} />
        </div>
      ) : null}

      <div class="card">
        <div class="card-title">📦 {t('stockShort')}</div>
        <div class="stock-mini">
          {STOCK_ORDER.map((k) => (
            <span class={state.stock[k] < 5 && k !== 'catFood' && (k === 'beans' || k === 'milk') ? 'warn' : ''}>
              {STOCK_PACKS[k].icon} {state.stock[k]}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

function Progress({ label, value }: { label: string; value: number }) {
  return (
    <div class="progress">
      <div class="progress-label small">{label}</div>
      <div class="bar">
        <div class="bar-fill" style={{ width: `${Math.min(1, Math.max(0, value)) * 100}%` }} />
      </div>
    </div>
  );
}

// ---------- итог смены ----------

export function ShiftResult({ summary, total, onClose }: { summary: ShiftSummary; total: number; onClose: () => void }) {
  const { state, me } = useGame();
  const partner = partnerOf(state, me.id);
  async function tell() {
    const text = t('tellPartnerText', { earned: summary.earned, served: summary.served, total });
    const how = await tg.share(inviteLink(state.code), text);
    track('partner_card_sent', { kind: 'shift_done', how });
  }
  return (
    <div class="tab result">
      <h2>{t('shiftDone')}</h2>
      <div class="big-number">+{summary.earned} 🪙</div>
      <div class="muted center">
        {t('tips')}: {summary.tips} 🪙
      </div>
      <div class="result-grid">
        <div>
          <b>{summary.served}</b>
          <span class="muted small">{t('served')}</span>
        </div>
        <div>
          <b>{summary.wrong}</b>
          <span class="muted small">{t('wrong')}</span>
        </div>
        <div>
          <b>{summary.left}</b>
          <span class="muted small">{t('left')}</span>
        </div>
      </div>
      {summary.noStock > 0 && <div class="card warn-card">{t('noStockWarn', { n: summary.noStock })}</div>}
      {summary.beats.length > 0 && (
        <div class="card">
          <div class="card-title">💬 {t('storiesTitle')}</div>
          {summary.beats.map((b) => (
            <div class="story">
              <span class="avatar">{REGULARS[b.regular].avatar}</span>
              <div>
                <b>{L(REGULARS[b.regular].name)}</b>
                <p>{L(REGULARS[b.regular].beats[b.beat])}</p>
              </div>
            </div>
          ))}
          {partner && !partner.isNpc && <div class="muted small">{t('storyPartnerHint')}</div>}
        </div>
      )}
      {partner && !partner.isNpc && (
        <button class="btn primary wide" onClick={tell}>
          💌 {t('tellPartner')}
        </button>
      )}
      <button class="btn ghost wide" onClick={onClose}>
        {t('back')}
      </button>
    </div>
  );
}

// ---------- склад и управление ----------

export function ManageTab() {
  const { state, me, send } = useGame();
  const p = getPlayer(state, me.id)!;
  const disc = Math.round(Math.min(CONFIG.managerDiscountMax, level(p.managerXp) * CONFIG.managerDiscountPerLevel) * 100);
  return (
    <div class="tab">
      <div class="card">
        <div class="card-title">
          📦 {t('stockTitle')} {disc > 0 && <span class="muted small">· {t('discount', { p: disc })}</span>}
        </div>
        {STOCK_ORDER.map((k) => {
          const pack = STOCK_PACKS[k];
          const cap = capacity(state, k);
          const price = packPrice(state, me.id, k);
          const full = state.stock[k] + pack.amount > cap;
          return (
            <div class="row item">
              <span class="icon">{pack.icon}</span>
              <div class="grow">
                <b>{L(pack.name)}</b>
                <div class="muted small">
                  {state.stock[k]} · {t('capacity', { cap })}
                </div>
              </div>
              <button class="btn small" disabled={full || state.money < price} onClick={() => send({ type: 'buyStock', item: k })}>
                +{pack.amount} · {price} 🪙
              </button>
            </div>
          );
        })}
      </div>

      <div class="card">
        <div class="card-title">☕ {t('menuTitle')}</div>
        {DRINK_ORDER.map((id) => {
          const d = DRINKS[id];
          const has = state.menu.includes(id);
          return (
            <div class="row item">
              <div class="grow">
                <b>{L(d.name)}</b> <span class="muted small">· {d.price} 🪙</span>
                <div class="small recipe">{d.recipe.map((c) => COMPONENTS[c].icon).join(' ')}</div>
              </div>
              {has ? (
                <span class="tag">{t('inMenu')}</span>
              ) : (
                <button class="btn small" disabled={state.money < d.unlockCost} onClick={() => send({ type: 'unlockDrink', id })}>
                  {t('unlock')} · {d.unlockCost} 🪙
                </button>
              )}
            </div>
          );
        })}
      </div>

      <div class="card">
        <div class="card-title">🔧 {t('upgradesTitle')}</div>
        {UPGRADE_ORDER.map((id) => {
          const u = UPGRADES[id];
          const has = !!state.upgrades[id];
          return (
            <div class="row item">
              <span class="icon">{u.icon}</span>
              <div class="grow">
                <b>{L(u.name)}</b>
                <div class="muted small">{L(u.desc)}</div>
              </div>
              {has ? (
                <span class="tag">{t('owned')}</span>
              ) : (
                <button class="btn small" disabled={state.money < u.cost} onClick={() => send({ type: 'buyUpgrade', id })}>
                  {u.cost} 🪙
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ---------- квартира ----------

export function RoomTab() {
  const { state, me, now, send } = useGame();
  const [slot, setSlot] = useState<DecorSlot>('sofa');
  const [catName, setCatName] = useState('');
  const gate = roomGate(state);
  if (!state.room.unlocked) {
    return (
      <div class="tab">
        <div class="card center locked">
          <div class="lock">🔒</div>
          <h3>{t('roomLocked')}</h3>
          <p class="muted">{t('roomLockedText', { stars: gate.needStars, shifts: gate.needShifts })}</p>
          <Progress label={t('goalStars', { v: gate.stars.toFixed(1), need: gate.needStars })} value={gate.stars / gate.needStars} />
          <Progress label={t('goalShifts', { v: gate.shifts, need: gate.needShifts })} value={gate.shifts / gate.needShifts} />
        </div>
      </div>
    );
  }
  const p = getPlayer(state, me.id)!;
  const petReadyIn = p.lastPetAt + CONFIG.catPetCooldownMs - now;
  return (
    <div class="tab">
      <RoomScene placed={state.room.placed} catMood={state.cat ? state.cat.mood : null} onSlot={setSlot} />

      <div class="card">
        <div class="card-title">🛋️ {t('decorTitle')}</div>
        <div class="chips">
          {SLOT_ORDER.map((s) => (
            <button class={`chip ${slot === s ? 'on' : ''}`} onClick={() => setSlot(s)}>
              {L(SLOT_LABEL[s])}
            </button>
          ))}
        </div>
        <div class="decor-grid">
          {DECOR.filter((d) => d.slot === slot).map((d) => {
            const owned = state.room.owned.includes(d.id);
            const placed = state.room.placed[d.slot] === d.id;
            return (
              <div class={`decor ${placed ? 'placed' : ''}`}>
                <DecorIcon slot={d.slot} v={d.variant} />
                <div class="small">{L(d.name)}</div>
                {placed ? (
                  <button class="btn small ghost" onClick={() => send({ type: 'placeDecor', slot: d.slot, id: null })}>
                    {t('remove')}
                  </button>
                ) : owned ? (
                  <button class="btn small" onClick={() => send({ type: 'placeDecor', slot: d.slot, id: d.id })}>
                    {t('place')}
                  </button>
                ) : (
                  <button class="btn small" disabled={state.money < d.cost} onClick={() => send({ type: 'buyDecor', id: d.id })}>
                    {d.cost} 🪙
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div class="card">
        <div class="card-title">🐈 {t('catTitle')}</div>
        {!state.cat ? (
          <div>
            <p>{t('catFound')}</p>
            <div class="row">
              <input class="input grow" value={catName} maxLength={20} placeholder={t('catNamePlaceholder')} onInput={(e) => setCatName((e.target as HTMLInputElement).value)} />
              <button class="btn primary" disabled={!catName.trim()} onClick={() => send({ type: 'adoptCat', name: catName })}>
                {t('catAdopt')}
              </button>
            </div>
          </div>
        ) : (
          <div class="cat-card">
            <CatPortrait mood={state.cat.mood} />
            <div class="grow">
              <b>{state.cat.name}</b>
              <Progress label={t('hunger')} value={state.cat.hunger / 100} />
              <Progress label={t('mood')} value={state.cat.mood / 100} />
              <div class="row gap">
                <button class="btn small" disabled={state.stock.catFood < 1} onClick={() => send({ type: 'feedCat' })}>
                  🐟 {t('feed')}
                </button>
                <button class="btn small" disabled={petReadyIn > 0} onClick={() => send({ type: 'petCat' })}>
                  ✋ {t('pet')}
                </button>
              </div>
              <div class="muted small">
                {t('catFood', { n: state.stock.catFood })}
                {petReadyIn > 0 && ` · ${t('petCooldown', { t: fmtDuration(petReadyIn) })}`}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ---------- доска, истории, журнал ----------

export function BoardTab() {
  const { state, me, now, send } = useGame();
  const [text, setText] = useState('');
  const [sticker, setSticker] = useState<string | undefined>();
  const partner = partnerOf(state, me.id);

  async function post() {
    const r = await send({ type: 'postNote', text, sticker });
    if (r) {
      setText('');
      setSticker(undefined);
    }
  }

  async function ask(msg: string, kind: string) {
    const how = await tg.share(inviteLink(state.code), msg);
    track('partner_card_sent', { kind, how });
  }

  return (
    <div class="tab">
      {partner && !partner.isNpc && (
        <div class="card">
          <div class="card-title">💌 {t('askPartner')}</div>
          <div class="chips">
            <button class="chip" onClick={() => ask(t('askShift'), 'shift')}>
              {t('askShift')}
            </button>
            <button class="chip" onClick={() => ask(t('askStock'), 'stock')}>
              {t('askStock')}
            </button>
            {state.cat && (
              <button class="chip" onClick={() => ask(t('askCat'), 'cat')}>
                {t('askCat')}
              </button>
            )}
          </div>
        </div>
      )}

      <div class="card">
        <div class="card-title">📌 {t('boardTitle')}</div>
        <div class="notes">
          {state.board.length === 0 && <div class="muted small">{t('boardEmpty')}</div>}
          {[...state.board].reverse().map((n) => (
            <div class={`note ${n.author === me.id ? 'mine' : ''}`}>
              <div class="note-text">
                {n.sticker && <span class="sticker">{n.sticker}</span>} {n.text}
              </div>
              <div class="muted small">
                {playerName(state, n.author)} · {timeAgo(now, n.at)}
              </div>
            </div>
          ))}
        </div>
        <div class="chips">
          {STICKERS.map((s) => (
            <button class={`chip sticker-chip ${sticker === s ? 'on' : ''}`} onClick={() => setSticker(sticker === s ? undefined : s)}>
              {s}
            </button>
          ))}
        </div>
        <div class="row">
          <input class="input grow" value={text} maxLength={CONFIG.noteMaxLen} placeholder={t('notePlaceholder')} onInput={(e) => setText((e.target as HTMLInputElement).value)} />
          <button class="btn primary" disabled={!text.trim() && !sticker} onClick={post}>
            {t('send')}
          </button>
        </div>
      </div>

      <div class="card">
        <div class="card-title">⭐ {t('storiesAll')}</div>
        {REGULAR_ORDER.map((id) => {
          const r = REGULARS[id];
          const prog = state.regulars[id];
          return (
            <details class="regular">
              <summary>
                {r.avatar} <b>{L(r.name)}</b> <span class="muted small">{prog?.visits ?? 0}/{r.beats.length}</span>
              </summary>
              {r.beats.map((b, i) => {
                const seenBy = prog?.seenBy[i];
                if (!prog || i >= prog.visits) return <p class="muted small">… {t('storyLocked')}</p>;
                if (seenBy !== me.id) return <p class="muted small">🔒 {t('storySeenByPartner', { name: playerName(state, seenBy ?? '') })}</p>;
                return <p class="small">{L(b)}</p>;
              })}
            </details>
          );
        })}
      </div>

      <div class="card">
        <div class="card-title">📜 {t('logTitle')}</div>
        <ul class="log">
          {[...state.log]
            .reverse()
            .slice(0, 30)
            .map((e) => (
              <li>
                <span class="muted small">{timeAgo(now, e.at)}</span> {describeLog(state, e)}
              </li>
            ))}
        </ul>
      </div>
    </div>
  );
}

// ---------- рейтинг ----------

export function TopTab() {
  const { state, now } = useGame();
  const rows = leaderboard(state, now);
  return (
    <div class="tab">
      <div class="card">
        <div class="card-title">🏆 {t('topTitle')}</div>
        <p class="muted small">{t('topText')}</p>
        <ol class="top">
          {rows.map((r, i) => (
            <li class={r.you ? 'you' : ''}>
              <span class="place">{i + 1}</span>
              <span class="grow">
                {r.name} {r.you && <span class="tag">{t('you')}</span>}
              </span>
              <b>{r.points}</b> <span class="muted small">{t('points')}</span>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}
