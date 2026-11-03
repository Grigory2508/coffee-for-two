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
  MARKETING,
  MARKETING_ORDER,
  ROLES,
  otherRole,
  type DecorSlot,
  type StockId,
} from '../core/content';
import { capacity, digestFor, energyNow, getPlayer, level, packPrice, partnerOf, playerByRole, rating, roomGate, type ShiftSummary } from '../core/engine';
import { leaderboard } from '../core/leaderboard';
import { fmtDuration, L, t } from '../i18n';
import { inviteLink } from '../net/backend';
import { track } from '../platform/analytics';
import { tg } from '../platform/telegram';
import { CafeScene, CatPortrait, DecorIcon, RoomScene } from './art';
import { describeLog, playerName, roleName, timeAgo, useGame } from './game';

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

export async function sharePartnerInvite(code: string, key: string, toast: (s: string) => void, source: string) {
  const url = inviteLink(code, key);
  const how = await tg.share(url, t('inviteShareText'));
  track('invite_sent', { source, how });
  if (how === 'clipboard') toast(t('inviteCopied'));
}

// ---------- кофейня ----------

function RoleCard({ onOpenManage }: { onOpenManage: () => void }) {
  const { state, me, send, toast } = useGame();
  const p = getPlayer(state, me.id)!;
  const partner = partnerOf(state, me.id);
  const swap = state.swap;
  const myActive = !!state.activeShifts[me.id];

  async function askPartner() {
    const r = await send({ type: 'proposeSwap' });
    if (r && partner && !partner.isNpc) {
      const how = await tg.share(inviteLink(state.code, state.inviteKey), t('swapAsk'));
      track('partner_card_sent', { kind: 'swap', how });
    } else if (r) toast(t('log_swap_accepted', { who: '', role: roleName(getPlayer(r.state, me.id)!.role).toLowerCase() }).trim());
  }

  return (
    <div class="card">
      <div class="row">
        <span class="role-badge">
          {ROLES[p.role].icon} {roleName(p.role)}
        </span>
        <span class="muted small grow">{t('yourRole')}</span>
      </div>
      <div class="muted small">{p.role === 'barista' ? t('baristaHint') : t('managerHint')}</div>
      {swap && swap.by === me.id && (
        <div class="row swap-row">
          <span class="small grow">⏳ {t('swapWaiting', { name: partner?.name ?? '' })}</span>
          <button class="btn small ghost" onClick={() => send({ type: 'declineSwap' })}>
            {t('swapCancel')}
          </button>
        </div>
      )}
      {!swap && (
        <button class="btn ghost small" disabled={myActive} onClick={askPartner}>
          🔄 {partner?.isNpc ? t('swapNpc') : t('swapPropose')}
        </button>
      )}
      {p.role === 'manager' && (
        <button class="btn primary wide" onClick={onOpenManage}>
          📋 {t('openManage')}
        </button>
      )}
    </div>
  );
}

function SwapIncoming() {
  const { state, me, send } = useGame();
  const swap = state.swap;
  if (!swap || swap.by === me.id) return null;
  const by = getPlayer(state, swap.by);
  const mine = getPlayer(state, me.id)!;
  return (
    <div class="card swap-card">
      <div>🔄 {t('swapIncoming', { name: by?.name ?? '', role: roleName(otherRole(mine.role)).toLowerCase() })}</div>
      <div class="row gap">
        <button class="btn primary" onClick={() => send({ type: 'acceptSwap' })}>
          {t('swapAccept')}
        </button>
        <button class="btn ghost" onClick={() => send({ type: 'declineSwap' })}>
          {t('swapDecline')}
        </button>
      </div>
    </div>
  );
}

export function CafeTab({ onStartShift, onOpenManage }: { onStartShift: () => void; onOpenManage: () => void }) {
  const { state, me, now, send, toast } = useGame();
  const p = getPlayer(state, me.id)!;
  const partner = partnerOf(state, me.id);
  const e = energyNow(p, now);
  const digest = digestFor(state, me.id);
  const gate = roomGate(state);
  const active = !!state.activeShifts[me.id];
  const catHere = !!state.cat && state.cat.hunger > 40 && state.cat.mood > 50;
  const busy = Object.keys(state.activeShifts).length > 0;

  return (
    <div class="tab">
      <CafeScene cat={catHere} busy={busy} />

      <SwapIncoming />

      <div class="card partner-card">
        {partner?.isNpc ? (
          <>
            <div class="row">
              <span class="avatar">🧓</span>
              <div class="grow">
                <b>{t('npcPartner', { name: partner.name })}</b>
                <div class="muted small">
                  {ROLES[partner.role].icon} {roleName(partner.role)} · {t('npcHint')}
                </div>
              </div>
            </div>
            <button class="btn primary wide" onClick={() => sharePartnerInvite(state.code, state.inviteKey, toast, 'cafe_card')}>
              💌 {t('invitePartner')}
            </button>
          </>
        ) : partner ? (
          <div class="row">
            <span class="avatar">{partner.role === 'barista' ? '🧑‍🍳' : '🧑‍💼'}</span>
            <div class="grow">
              <div class="muted small">{t('partner')}</div>
              <b>{t('partnerRole', { name: partner.name, role: roleName(partner.role).toLowerCase() })}</b>
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

      <RoleCard onOpenManage={onOpenManage} />

      <div class="card">
        <Energy />
        {p.role === 'barista' ? (
          <>
            <button class="btn primary big wide" disabled={!active && e.energy < 1} onClick={onStartShift}>
              {active ? t('continueShift') : t('startShift')}
            </button>
            {!active && e.energy < 1 && e.nextAt && <div class="muted small center">{t('noEnergy', { t: fmtDuration(e.nextAt - now) })}</div>}
            {state.marketing && (
              <div class="small center">📣 {t('marketingActive', { name: L(MARKETING[state.marketing.id].name), n: state.marketing.shiftsLeft })}</div>
            )}
            {catHere && <div class="small center">🐈 {t('catInCafe', { name: state.cat!.name })}</div>}
          </>
        ) : null}
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
            <span class={state.stock[k] < 5 && (k === 'beans' || k === 'milk') ? 'warn' : ''}>
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
    const how = await tg.share(inviteLink(state.code, state.inviteKey), text);
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

// ---------- управление (только управляющий) ----------

export function ManageTab() {
  const { state, me, send } = useGame();
  const p = getPlayer(state, me.id)!;
  const isManager = p.role === 'manager';
  const manager = playerByRole(state, 'manager');
  const [basket, setBasket] = useState<Partial<Record<StockId, number>>>({});
  const disc = Math.round(Math.min(CONFIG.managerDiscountMax, level(p.managerXp) * CONFIG.managerDiscountPerLevel) * 100);

  const basketCost = STOCK_ORDER.reduce((sum, k) => sum + (basket[k] ?? 0) * packPrice(state, me.id, k), 0);
  const basketCount = STOCK_ORDER.reduce((sum, k) => sum + (basket[k] ?? 0), 0);

  function change(k: StockId, d: number) {
    setBasket((b) => ({ ...b, [k]: Math.max(0, (b[k] ?? 0) + d) }));
  }

  async function go() {
    const r = await send({ type: 'supplyRun', items: basket });
    if (r) setBasket({});
  }

  return (
    <div class="tab">
      {!isManager && manager && (
        <div class="locked-note">🔒 {manager.isNpc ? t('notYourRoleNpc', { name: manager.name }) : t('notYourRole', { name: manager.name })}</div>
      )}
      {isManager && (
        <div class="card">
          <Energy />
          <div class="muted small">{t('managerHint')}</div>
        </div>
      )}

      <fieldset class="plain" disabled={!isManager}>
        <div class="card">
          <div class="card-title">
            🚚 {t('supplyTitle')} {disc > 0 && <span class="muted small">· {t('discount', { p: disc })}</span>}
          </div>
          {STOCK_ORDER.map((k) => {
            const pack = STOCK_PACKS[k];
            const cap = capacity(state, k);
            const n = basket[k] ?? 0;
            const canMore = state.stock[k] + pack.amount * (n + 1) <= cap;
            return (
              <div class="row item">
                <span class="icon">{pack.icon}</span>
                <div class="grow">
                  <b>{L(pack.name)}</b>
                  <div class="muted small">
                    {state.stock[k]} · {t('capacity', { cap })} · +{pack.amount} / {packPrice(state, me.id, k)} 🪙
                  </div>
                </div>
                <div class="stepper">
                  <button disabled={n <= 0} onClick={() => change(k, -1)}>
                    −
                  </button>
                  <b>{n}</b>
                  <button disabled={!canMore} onClick={() => change(k, 1)}>
                    +
                  </button>
                </div>
              </div>
            );
          })}
          <button class="btn primary wide" disabled={!basketCount || state.money < basketCost} onClick={go}>
            {basketCount ? t('supplyGo', { cost: basketCost }) : t('supplyEmpty')}
          </button>
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
          <div class="card-title">📣 {t('marketingTitle')}</div>
          {state.marketing && <div class="small">{t('marketingActive', { name: L(MARKETING[state.marketing.id].name), n: state.marketing.shiftsLeft })}</div>}
          {MARKETING_ORDER.map((id) => {
            const m = MARKETING[id];
            return (
              <div class="row item">
                <span class="icon">{m.icon}</span>
                <div class="grow">
                  <b>{L(m.name)}</b>
                  <div class="muted small">{L(m.desc)}</div>
                </div>
                <button class="btn small" disabled={!!state.marketing || state.money < m.cost} onClick={() => send({ type: 'launchMarketing', id })}>
                  {t('energyCost')} · {m.cost} 🪙
                </button>
              </div>
            );
          })}
        </div>

        <div class="card">
          <div class="card-title">🔧 {t('expansionTitle')}</div>
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
                    {t('energyCost')} · {u.cost} 🪙
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </fieldset>
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

function PartnerSection() {
  const { state, me, send, backend, toast, onLeft } = useGame();
  const partner = partnerOf(state, me.id);
  const isOwner = state.ownerId === me.id;
  if (!partner) return null;

  async function replace() {
    if (!(await tg.confirm(t('replaceConfirm', { name: partner!.name })))) return;
    const r = await send({ type: 'replacePartner' });
    if (r) {
      track('partner_replaced', {});
      await sharePartnerInvite(r.state.code, r.state.inviteKey, toast, 'replace');
    }
  }

  async function leave() {
    if (!(await tg.confirm(t('leaveConfirm', { cafe: state.name })))) return;
    const r = await send({ type: 'leaveCafe' });
    if (!r) return;
    track('partner_left', {});
    await backend.leave().catch(() => {});
    onLeft();
  }

  return (
    <div class="card">
      <div class="card-title">🤝 {t('partnerTitle')}</div>
      <div class="row">
        <span class="grow">
          {partner.isNpc ? '🧓' : '🧑'} <b>{partner.name}</b> · {roleName(partner.role).toLowerCase()}
          {partner.id === state.ownerId && <span class="tag"> {t('ownerBadge')}</span>}
        </span>
      </div>
      {partner.isNpc ? (
        <button class="btn primary wide" onClick={() => sharePartnerInvite(state.code, state.inviteKey, toast, 'board')}>
          💌 {t('invitePartner')}
        </button>
      ) : isOwner ? (
        <button class="btn ghost wide" onClick={replace}>
          🔁 {t('replacePartner')}
        </button>
      ) : null}
      {!isOwner && (
        <button class="btn ghost wide danger-text" onClick={leave}>
          🚪 {t('leaveCafe')}
        </button>
      )}
    </div>
  );
}

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
    const how = await tg.share(inviteLink(state.code, state.inviteKey), msg);
    track('partner_card_sent', { kind, how });
  }

  return (
    <div class="tab">
      <PartnerSection />
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
