import { useEffect, useState } from 'preact/hooks';
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
import { canMake, capacity, catInCafe, counterHolder, energyNow, freeRoles, getPlayer, guestsPerShift, humans, level, officeHolder, packPrice, rating, roleCount, roomGate, todayMenu, type ShiftSummary } from '../core/engine';
import { fillBasket, lowStock, shiftsLeft, stockByUrgency } from './stock';
import type { CafeState } from '../core/types';
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

/** Закреплённая шапка: название и рейтинг, деньги, свои силы, тревога по складу. */
export function Header({ onRating, onAlert, extra }: { onRating?: () => void; onAlert?: () => void; extra?: preact.ComponentChildren }) {
  const { state, me, now } = useGame();
  const p = getPlayer(state, me.id);
  const e = p ? energyNow(p, now) : null;
  const low = lowStock(state);
  return (
    <header class="hud">
      <button class="hud-name" onClick={onRating}>
        <b>{state.name}</b>
        <Stars value={rating(state)} />
      </button>
      <div class="hud-stats">
        {low.length > 0 && (
          <button class="hud-chip warn" onClick={onAlert} aria-label={t('stockAlert', { items: '' })}>
            ⚠ {low.map((k) => STOCK_PACKS[k].icon).join('')}
          </button>
        )}
        <span class="hud-chip">
          🪙 <b>{state.money}</b>
        </span>
        {e && (
          <span class="hud-chip energy-chip" title={t('energy')}>
            ⚡ <b>{e.energy}/{CONFIG.energyMax}</b>
            {e.nextAt ? <small>{fmtDuration(e.nextAt - now)}</small> : null}
          </span>
        )}
        {extra}
      </div>
    </header>
  );
}


export async function sharePartnerInvite(code: string, key: string, toast: (s: string) => void, source: string) {
  const url = inviteLink(code, key);
  const how = await tg.share(url, t('inviteShareText'));
  track('invite_sent', { source, how });
  if (how === 'clipboard') toast(t('inviteCopied'));
}

// ---------- команда ----------

function staffStatus(s: CafeState, id: string, now: number): string | null {
  const plan = s.activeShifts[id];
  if (plan && now - plan.startedAt < CONFIG.shiftDurationMs + 60_000) return t('staffOnCounter');
  if (s.office && s.office.by === id && s.office.until > now) return t('staffInOffice');
  return null;
}

async function inviteToTeam(state: CafeState, toast: (s: string) => void, source: string) {
  const url = inviteLink(state.code, state.inviteKey);
  const how = await tg.share(url, t('inviteStaffText', { cafe: state.name }));
  track('invite_sent', { source, how });
  if (how === 'clipboard') toast(t('inviteCopied'));
}

/** Состав команды: кто в какой роли и чем занят. */
function TeamCard({ manage }: { manage?: boolean }) {
  const { state, me, now, send, toast } = useGame();
  const people = state.players;
  const hs = humans(state);
  const isOwner = state.ownerId === me.id;
  const canInvite = freeRoles(state).length > 0;

  async function remove(id: string, name: string) {
    if (!(await tg.confirm(t('removeConfirm', { name })))) return;
    const r = await send({ type: 'removeStaff', id });
    if (r) track('staff_removed', {});
  }

  return (
    <div class="card team-card">
      <div class="card-title">
        👥 {t('teamTitle')} <span class="muted small">· {t('teamCount', { n: hs.length, max: CONFIG.maxStaff })}</span>
      </div>
      {people.map((p) => {
        const status = staffStatus(state, p.id, now);
        return (
          <div class="row staff-row">
            <span class="avatar small-avatar">{p.isNpc ? '🧓' : ROLES[p.role].icon}</span>
            <div class="grow">
              <b>{p.name}</b>
              {p.id === me.id && <span class="muted small"> · {t('you')}</span>}
              {p.id === state.ownerId && <span class="tag"> {t('ownerBadge')}</span>}
              <div class="muted small">
                {roleName(p.role)}
                {p.isNpc ? ` · ${t('npcHint')}` : status ? ` · ${status}` : p.id !== me.id ? ` · ${now - p.lastSeenAt < 60_000 ? t('justNow') : timeAgo(now, p.lastSeenAt)}` : ''}
              </div>
            </div>
            {manage && isOwner && !p.isNpc && p.id !== me.id && (
              <button class="btn small ghost danger-text" onClick={() => remove(p.id, p.name)}>
                {t('removeStaff')}
              </button>
            )}
          </div>
        );
      })}
      {canInvite && (
        <button class="btn wide" onClick={() => inviteToTeam(state, toast, manage ? "team_tab" : "cafe_card")}>
          💌 {t('inviteStaff')}
        </button>
      )}
    </div>
  );
}

/** Заявки в команду: каждый сотрудник одобряет или отклоняет. */
function Applications() {
  const { state, me, send } = useGame();
  const hs = humans(state);
  if (!state.applications.length) return null;
  return (
    <div class="card swap-card">
      <div class="card-title">📝 {t('applicationsTitle')}</div>
      {state.applications.map((a) => {
        const approved = a.approvals.includes(me.id);
        const n = a.approvals.filter((x) => hs.some((h) => h.id === x)).length;
        return (
          <div class="app-row">
            <div>
              {ROLES[a.role].icon} {t('applicationLine', { name: a.name, role: roleName(a.role).toLowerCase() })}
            </div>
            <div class="muted small">{t('approvals', { n, m: hs.length })}</div>
            <div class="row gap">
              {approved ? (
                <span class="tag">✓ {t('youApproved')}</span>
              ) : (
                <button class="btn small primary" onClick={() => send({ type: 'approveApplication', id: a.id }).then((r) => r && track('application_approved', {}))}>
                  {t('approve')}
                </button>
              )}
              <button class="btn small ghost" onClick={() => send({ type: 'rejectApplication', id: a.id })}>
                {t('reject')}
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ---------- кофейня ----------

function RoleCard() {
  const { state, me, now, send } = useGame();
  const p = getPlayer(state, me.id)!;
  const swap = state.swap;
  const busy = !!staffStatus(state, me.id, now);
  const hs = humans(state);
  const other = otherRole(p.role);
  const canSwitch = freeRoles(state).includes(other) && !(roleCount(state, p.role) === 1 && hs.length > 1);
  const swapTargets = state.players.filter((x) => x.id !== me.id && x.role === other);

  async function propose(withId: string) {
    const target = getPlayer(state, withId);
    const r = await send({ type: 'proposeSwap', with: withId });
    if (r && target && !target.isNpc) {
      const how = await tg.share(inviteLink(state.code, state.inviteKey), t('swapAsk'));
      track('partner_card_sent', { kind: 'swap', how });
    }
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
          <span class="small grow">⏳ {t('swapWaiting', { name: getPlayer(state, swap.with)?.name ?? '' })}</span>
          <button class="btn small ghost" onClick={() => send({ type: 'declineSwap' })}>
            {t('swapCancel')}
          </button>
        </div>
      )}
      {!swap && (canSwitch || swapTargets.length > 0) && (
        <div class="chips">
          {canSwitch && (
            <button class="chip" disabled={busy} onClick={() => send({ type: 'switchRole', role: other })}>
              ➡️ {t('switchRoleTitle')}: {roleName(other).toLowerCase()}
            </button>
          )}
          {swapTargets.map((x) => (
            <button class="chip" disabled={busy} onClick={() => propose(x.id)}>
              🔄 {x.isNpc ? t('swapNpc') : `${t('swapWith')}: ${x.name}`}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function SwapIncoming() {
  const { state, me, send } = useGame();
  const swap = state.swap;
  if (!swap || swap.with !== me.id) return null;
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

/** Меню дня с рецептами — шпаргалка баристы и витрина для всех. */
function MenuToday({ compact }: { compact?: boolean }) {
  const { state } = useGame();
  const menu = todayMenu(state);
  return (
    <div class="card">
      <div class="card-title">{t('menuTodayTitle')}</div>
      {!compact && <div class="muted small">{t('menuTodayHint')}</div>}
      <div class="menu-grid">
        {menu.map((id) => {
          const d = DRINKS[id];
          const ok = canMake(state.stock, id);
          return (
            <div class={`menu-cell ${ok ? '' : 'short'}`}>
              <div class="menu-name">{L(d.name)}</div>
              <div class="menu-recipe">{d.recipe.map((c) => COMPONENTS[c].icon).join('')}</div>
              <div class="menu-price">{ok ? `${d.price} 🪙` : t('cantMake')}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** Стойка — главная вкладка баристы. */
export function CounterTab({ onStartShift }: { onStartShift: () => void }) {
  const { state, me, now } = useGame();
  const p = getPlayer(state, me.id)!;
  const counter = counterHolder(state, me.id, now);
  const e = energyNow(p, now);
  const active = !!state.activeShifts[me.id];
  const catHere = catInCafe(state);
  return (
    <div class="tab">
      <div class="card hero">
        <CafeScene cat={catHere} busy={!!counter || active} />
        <div class="hero-body">
          <div class="hero-title">{t('shiftTitle')}</div>
          <div class="muted small">{t('shiftLength', { n: guestsPerShift(state) })}</div>
          <button class="btn primary big wide" disabled={!active && (e.energy < 1 || !!counter)} onClick={onStartShift}>
            {active ? t('continueShift') : t('startShiftCost')}
          </button>
          {!active && counter && <div class="locked-note center">⏳ {t('counterBusy', { name: counter.name })}</div>}
          {!active && !counter && e.energy < 1 && e.nextAt && <div class="muted small center">{t('noEnergy', { t: fmtDuration(e.nextAt - now) })}</div>}
          {state.marketing && <div class="small center">📣 {t('marketingActive', { name: L(MARKETING[state.marketing.id].name), n: state.marketing.shiftsLeft })}</div>}
          {catHere && <div class="small center">🐈 {t('catInCafe', { name: state.cat!.name })}</div>}
        </div>
      </div>
      <MenuToday />
    </div>
  );
}

/** Кофейня — общая информация: цель, лига, цифры, склад, истории, журнал. */
export function CafeInfoTab() {
  const { state, me, now } = useGame();
  const gate = roomGate(state);
  const rows = leaderboard(state, now);
  const youAt = rows.findIndex((r) => r.you);
  const shown = rows.filter((_, i) => i < 3 || Math.abs(i - youAt) <= 1);
  return (
    <div class="tab">
      <CafeScene cat={catInCafe(state)} busy={Object.keys(state.activeShifts).length > 0} />

      {!state.room.unlocked && (
        <div class="card">
          <div class="card-title">🏠 {t('goalsTitle')}</div>
          <Progress label={t('goalStars', { v: gate.stars.toFixed(1), need: gate.needStars })} value={gate.stars / gate.needStars} />
          <Progress label={t('goalShifts', { v: gate.shifts, need: gate.needShifts })} value={gate.shifts / gate.needShifts} />
        </div>
      )}

      <div class="card">
        <div class="card-title">🏆 {t('topTitle')}</div>
        <div class="muted small">{t('topText')}</div>
        <ol class="top">
          {shown.map((r) => {
            const i = rows.indexOf(r);
            const gap = i > 2 && !shown.includes(rows[i - 1]);
            return (
              <>
                {gap && <li class="top-gap">⋯</li>}
                <li class={r.you ? 'you' : ''}>
                  <span class="place">{i + 1}</span>
                  <span class="grow">
                    {r.name} {r.you && <span class="tag">{t('you')}</span>}
                  </span>
                  <b>{r.points}</b>
                </li>
              </>
            );
          })}
        </ol>
      </div>

      <div class="card">
        <div class="card-title">{t('statsTitle')}</div>
        <div class="result-grid">
          <div>
            <b>{state.stats.shifts}</b>
            <span class="muted small">{t('statShifts')}</span>
          </div>
          <div>
            <b>{state.stats.guestsServed}</b>
            <span class="muted small">{t('statServed')}</span>
          </div>
          <div>
            <b>{state.stats.earned}</b>
            <span class="muted small">{t('statEarned')}</span>
          </div>
        </div>
        <div class="stock-mini">
          {STOCK_ORDER.map((k) => (
            <span class={lowStock(state).includes(k) ? 'warn' : ''}>
              {STOCK_PACKS[k].icon} {state.stock[k]}
            </span>
          ))}
        </div>
      </div>

      <MenuToday compact />

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

      <details class="card log-card">
        <summary class="card-title">📜 {t('logTitle')}</summary>
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
      </details>
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

export function ShiftResult({ summary, total, onClose, onAgain, canAgain }: { summary: ShiftSummary; total: number; onClose: () => void; onAgain?: () => void; canAgain?: boolean }) {
  const { state, me } = useGame();
  const team = humans(state).filter((h) => h.id !== me.id);
  async function tell() {
    const text = t('tellPartnerText', { earned: summary.earned, served: summary.served, total });
    const how = await tg.share(inviteLink(state.code, state.inviteKey), text);
    track('partner_card_sent', { kind: 'shift_done', how });
  }
  return (
    <div class="tab result">
      <h2>{t('shiftDone')}</h2>
      <div class="result-stars" aria-label={`${shiftStars(summary, total)}/3`}>
        {[0, 1, 2].map((i) => (
          <span class={i < shiftStars(summary, total) ? 'on' : ''} style={{ animationDelay: `${i * 0.15}s` }}>
            ★
          </span>
        ))}
      </div>
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
          {team.length > 0 && <div class="muted small">{t('storyPartnerHint')}</div>}
        </div>
      )}
      {team.length > 0 && (
        <button class="btn wide" onClick={tell}>
          💌 {t('tellTeam')}
        </button>
      )}
      {onAgain && canAgain && (
        <button class="btn primary wide" onClick={onAgain}>
          {t('shiftAgain')}
        </button>
      )}
      <button class="btn ghost wide" onClick={onClose}>
        {t('back')}
      </button>
    </div>
  );
}

/** Оценка смены: три звезды — все обслужены без ошибок. */
function shiftStars(s: ShiftSummary, total: number): number {
  const share = total ? s.served / total : 0;
  if (share >= 1 && s.wrong === 0) return 3;
  if (share >= 0.7) return 2;
  if (share >= 0.4) return 1;
  return 0;
}

// ---------- дела (только управляющий) ----------

type Seg = 'stock' | 'menu' | 'growth';

/** Дела — главная вкладка управляющего: склад, меню, развитие. */
export function OfficeTab() {
  const { state, me, send, now } = useGame();
  const p = getPlayer(state, me.id)!;
  const isManager = p.role === 'manager';
  const busyBy = isManager ? officeHolder(state, me.id, now) : undefined;
  const mine = !!state.office && state.office.by === me.id && state.office.until > now;
  const [seg, setSeg] = useState<Seg>('stock');

  // Кабинет занят, пока менеджер держит «Дела» открытыми (снимается через 3 мин без действий)
  useEffect(() => {
    if (!isManager || busyBy || mine) return;
    void send({ type: 'enterOffice' }, { quiet: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isManager, busyBy?.id]);
  useEffect(
    () => () => {
      if (isManager) void send({ type: 'leaveOffice' }, { quiet: true });
    },
    [isManager],
  );

  const segs: [Seg, string][] = [
    ['stock', t('segStock')],
    ['menu', t('segMenu')],
    ['growth', t('segGrowth')],
  ];
  const lowN = lowStock(state).length;

  return (
    <div class="tab office">
      <div class="segmented">
        {segs.map(([id, label]) => (
          <button class={`seg ${seg === id ? 'on' : ''}`} onClick={() => setSeg(id)}>
            {label}
            {id === 'stock' && lowN > 0 && <span class="badge">{lowN}</span>}
          </button>
        ))}
      </div>
      {busyBy && <div class="locked-note">⏳ {t('officeBusy', { name: busyBy.name })}</div>}
      {!isManager && <div class="locked-note">🔒 {t('officeOnlyManager')}</div>}
      <div class="muted small">{t('managerHint')}</div>
      <fieldset class="plain" disabled={!isManager || !!busyBy}>
        {seg === 'stock' && <StockSeg />}
        {seg === 'menu' && <MenuSeg />}
        {seg === 'growth' && <GrowthSeg />}
      </fieldset>
    </div>
  );
}

function StockSeg() {
  const { state, me, send } = useGame();
  const [basket, setBasket] = useState<Partial<Record<StockId, number>>>({});
  const p = getPlayer(state, me.id)!;
  const disc = Math.round(Math.min(CONFIG.managerDiscountMax, level(p.managerXp) * CONFIG.managerDiscountPerLevel) * 100);
  const cost = STOCK_ORDER.reduce((sum, k) => sum + (basket[k] ?? 0) * packPrice(state, me.id, k), 0);
  const packs = STOCK_ORDER.reduce((sum, k) => sum + (basket[k] ?? 0), 0);
  const change = (k: StockId, d: number) => setBasket((b) => ({ ...b, [k]: Math.max(0, (b[k] ?? 0) + d) }));

  async function go() {
    const r = await send({ type: 'supplyRun', items: basket });
    if (r) setBasket({});
  }

  return (
    <>
      <div class="card">
        <div class="row">
          <div class="card-title grow">🚚 {t('supplyTitle')}</div>
          {disc > 0 && <span class="tag">−{disc}%</span>}
        </div>
        <button class="btn wide" onClick={() => setBasket(fillBasket(state, me.id))}>
          ✨ {t('fillToNorm')}
        </button>
        {stockByUrgency(state).map((k) => {
          const pack = STOCK_PACKS[k];
          const cap = capacity(state, k);
          const n = basket[k] ?? 0;
          const have = state.stock[k];
          const after = have + pack.amount * n;
          const left = shiftsLeft(state, k);
          const canMore = have + pack.amount * (n + 1) <= cap;
          const note =
            k === 'catFood' ? t('forHome') : left === Infinity ? t('notUsedToday') : left < 1 ? t('enoughForNone') : t('enoughFor', { n: Math.floor(left) });
          return (
            <div class="stock-row">
              <span class="icon">{pack.icon}</span>
              <div class="grow">
                <div class="row">
                  <b class="grow">{L(pack.name)}</b>
                  <span class={`small ${left < 1 ? 'danger-text' : 'muted'}`}>{note}</span>
                </div>
                <div class="stock-bar">
                  <div class="stock-have" style={{ width: `${(have / cap) * 100}%` }} />
                  <div class="stock-add" style={{ width: `${((after - have) / cap) * 100}%` }} />
                </div>
                <div class="muted small num">
                  {t('packLine', { have: n > 0 ? `${have}→${after}` : have, cap, amount: pack.amount, price: packPrice(state, me.id, k) })}
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
      </div>
      {packs > 0 && (
        <div class="basket-bar">
          <div class="grow">
            <b>{t('basketSummary', { n: packs, cost })}</b>
            {state.money < cost && <div class="small danger-text">{t('lacking', { n: cost - state.money })}</div>}
          </div>
          <button class="btn ghost small" onClick={() => setBasket({})}>
            {t('basketClear')}
          </button>
          <button class="btn primary" disabled={state.money < cost} onClick={go}>
            {t('basketGo')}
          </button>
        </div>
      )}
    </>
  );
}

function MenuSeg() {
  const { state, send } = useGame();
  const featured = todayMenu(state);
  const order = [...DRINK_ORDER].sort((a, b) => Number(state.menu.includes(b)) - Number(state.menu.includes(a)));
  return (
    <>
      <div class="card">
        <div class="card-title">{t('menuTodayCount', { n: state.featured.length, max: CONFIG.menuSlots })}</div>
        <div class="muted small">{t('menuTodayHint')}</div>
        <div class="chips">
          {featured.map((id) => (
            <span class="chip on">{L(DRINKS[id].name)}</span>
          ))}
        </div>
      </div>
      <div class="card">
        <div class="card-title">☕ {t('catalogTitle')}</div>
        {order.map((id) => {
          const d = DRINKS[id];
          const has = state.menu.includes(id);
          const today = state.featured.includes(id);
          return (
            <div class={`row item drink-row ${has ? '' : 'locked-row'}`}>
              <div class="grow">
                <b>{L(d.name)}</b> <span class="muted small num">· {d.price} 🪙</span>
                <div class="recipe">{d.recipe.map((c) => COMPONENTS[c].icon).join(' ')}</div>
              </div>
              {has ? (
                <button class={`chip ${today ? 'on' : ''}`} onClick={() => send({ type: 'toggleFeatured', id })}>
                  {today ? t('inToday') : t('addToday')}
                </button>
              ) : (
                <div class="buy">
                  <button class="btn small" disabled={state.money < d.unlockCost} onClick={() => send({ type: 'unlockDrink', id })}>
                    {t('unlock')} · {d.unlockCost} 🪙
                  </button>
                  {state.money < d.unlockCost && <div class="small muted">{t('lacking', { n: d.unlockCost - state.money })}</div>}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </>
  );
}

function GrowthSeg() {
  const { state, send } = useGame();
  return (
    <>
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
              <div class="buy">
                <button class="btn small" disabled={!!state.marketing || state.money < m.cost} onClick={() => send({ type: 'launchMarketing', id })}>
                  1⚡ · {m.cost} 🪙
                </button>
                {!state.marketing && state.money < m.cost && <div class="small muted">{t('lacking', { n: m.cost - state.money })}</div>}
              </div>
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
                <div class="buy">
                  <button class="btn small" disabled={state.money < u.cost} onClick={() => send({ type: 'buyUpgrade', id })}>
                    1⚡ · {u.cost} 🪙
                  </button>
                  {state.money < u.cost && <div class="small muted">{t('lacking', { n: u.cost - state.money })}</div>}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </>
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

/** Команда и общение: заявки, состав, роли, просьбы, доска записок. */
export function TeamTab() {
  const { state, me, now, send, backend, onLeft } = useGame();
  const [text, setText] = useState('');
  const [sticker, setSticker] = useState<string | undefined>();
  const isOwner = state.ownerId === me.id;

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

  async function leave() {
    if (!(await tg.confirm(t('leaveConfirm', { cafe: state.name })))) return;
    const r = await send({ type: 'leaveCafe' });
    if (!r) return;
    track('partner_left', {});
    await backend.leave().catch(() => {});
    onLeft();
  }

  return (
    <div class="tab">
      <SwapIncoming />
      <Applications />
      <TeamCard manage />
      <RoleCard />

      <div class="section-title">{t('teamTalk')}</div>
      {humans(state).length > 1 && (
        <div class="card">
          <div class="card-title">💌 {t('askTeam')}</div>
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
        <div class="row">
          <input class="input grow" value={text} maxLength={CONFIG.noteMaxLen} placeholder={t('notePlaceholder')} onInput={(e) => setText((e.target as HTMLInputElement).value)} />
          <button class="btn primary" disabled={!text.trim() && !sticker} onClick={post}>
            {t('send')}
          </button>
        </div>
        <div class="chips stickers">
          {STICKERS.map((s) => (
            <button class={`chip sticker-chip ${sticker === s ? 'on' : ''}`} onClick={() => setSticker(sticker === s ? undefined : s)}>
              {s}
            </button>
          ))}
        </div>
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
      </div>

      {!isOwner && (
        <button class="link danger-text center leave-link" onClick={leave}>
          {t('leaveCafe')}
        </button>
      )}
    </div>
  );
}

/** Сколько всего ждёт игрока во вкладке «Команда». */
export function teamBadge(s: CafeState, meId: string): number {
  const apps = s.applications.filter((a) => !a.approvals.includes(meId)).length;
  return apps + (s.swap && s.swap.with === meId ? 1 : 0);
}

