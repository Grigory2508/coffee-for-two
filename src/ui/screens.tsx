import { useEffect, useRef, useState } from 'preact/hooks';
import {
  CONFIG,
  DECOR,
  DRINKS,
  DRINK_ORDER,
  REGULARS,
  REGULAR_ORDER,
  SLOT_LABEL,
  STICKERS,
  STOCK_ORDER,
  STOCK_PACKS,
  STOCK_GROUPS,
  DESSERTS,
  WALLPAPERS,
  defaultWallpaper,
  inSeason,
  CAFE_SLOTS,
  CAFE_SLOT_ORDER,
  MARKETING,
  MARKETING_ORDER,
  ROLES,
  ROOMS,
  ROOM_SLOTS,
  otherRole,
  type CafeSlot,
  type DecorSlot,
  type DessertId,
  type StockId,
} from '../core/content';
import { slotLevel, slotEffects, audiences, shiftDuration, vitrineDesserts, canMake, capacity, catInCafe, counterHolder, freeRoles, getPlayer, guestsPerShift, humans, level, officeHolder, packPrice, rating, roleCount, todayMenu, vitalsNow, roomOrder, roomCost, type ShiftSummary } from '../core/engine';
import { fillBasket, lowStock, shiftsLeft, stockByUrgency } from './stock';
import type { CafeState, HomeRoom, Player } from '../core/types';
import { fmtDuration, L, t } from '../i18n';
import { inviteLink } from '../net/backend';
import { track } from '../platform/analytics';
import { tg } from '../platform/telegram';
import { CatPortrait, DecorIcon, RoomScene } from './art';
import { WallSwatch } from './wall';
import { CupView } from './cup';
import { RecipeIcons } from './recipe';
import { expectedCup } from '../core/assembly';
import { LogoView } from './logo';
import { BrandCard, ShopSheet } from './social';
import { HallTab } from './hall';
import { CafeArt, Coin, Img, StockIcon } from './icons';
import { describeLog, playerName, roleName, roomTitle, timeAgo, useGame } from './game';

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
  const v = p ? vitalsNow(state, p, now) : null;
  const [open, setOpen] = useState(false);
  const low = lowStock(state);
  return (
    <header class="hud">
      <button class="hud-name" onClick={onRating}>
        <LogoView logo={state.logo} size={34} />
        <span class="hud-title">
          <b>{state.name}</b>
          <Stars value={rating(state)} />
        </span>
      </button>
      <div class="hud-stats">
        {low.length > 0 && (
          <button class="hud-chip warn" onClick={onAlert} aria-label={t('stockAlert', { items: '' })}>
            ⚠ {low.map((k) => <StockIcon k={k} size={18} />)}
          </button>
        )}
        <button class="hud-chip" title={t('budget')} onClick={() => setOpen(!open)}>
          <Coin /> <b>{state.money}</b>
        </button>
        {p && v && (
          <button class="hud-chip vitals-chip" onClick={() => setOpen(!open)} aria-label={t('vitalsTitle')}>
            <span title={t('wallet')}>👛<b>{p.wallet}</b></span>
            <span class="meters" aria-hidden="true">
              <i title={t('energy')}><u class="m-energy" style={{ width: `${v.energy}%` }} /></i>
              <i title={t('happy')}><u class="m-happy" style={{ width: `${v.happy}%` }} /></i>
            </span>
          </button>
        )}
        {extra}
      </div>
      {open && p && v && <VitalsSheet p={p} v={v} onClose={() => setOpen(false)} />}
    </header>
  );
}


type Vitals = ReturnType<typeof vitalsNow>;

/** Раскрывашка из шапки: бодрость, счастье, кошелёк и перевод в бюджет. */
function VitalsSheet({ p, v, onClose }: { p: Player; v: Vitals; onClose: () => void }) {
  const { state, send, toast } = useGame();
  const [amount, setAmount] = useState(Math.min(100, p.wallet));
  const mult = Math.round((1 + CONFIG.happyRatingSpan * ((v.happy - 50) / 50) - 1) * 100);
  const [shop, setShop] = useState(false);
  const today = new Date(Date.now()).toISOString().slice(0, 10);
  const acts = p.daily?.day === today ? p.daily.actions : 0;
  const dailyText = p.daily?.day === today && p.daily.done ? t('dailyDone') : t('dailyGoal', { n: Math.min(acts, CONFIG.dailyGoalActions), max: CONFIG.dailyGoalActions, g: CONFIG.dailyGoalGems });
  if (shop) return <ShopSheet onClose={() => setShop(false)} />;
  return (
    <div class="vitals-sheet card" onClick={(e) => e.stopPropagation()}>
      <div class="row">
        <b class="grow">{p.name}</b>
        <button class="btn ghost small" onClick={onClose}>✕</button>
      </div>
      <Progress label={`⚡ ${t('energyLine', { e: Math.floor(v.energy), r: v.restPerMin.toFixed(2) })}`} value={v.energy / 100} />
      {v.fullInMs > 0 && <div class="muted small">{t('energyFullIn', { t: fmtDuration(v.fullInMs) })}</div>}
      <Progress label={`😊 ${t('happyLine', { h: Math.floor(v.happy), cap: v.joyCap })}`} value={v.happy / 100} />
      <div class="muted small">{t('happyRating', { sign: mult >= 0 ? '+' : '−', pct: Math.abs(mult) })}</div>
      <div class="row gap">
        <span class="small grow">
          💎 {t('gemsLine', { n: p.gems ?? 0 })}
        </span>
        <button class="btn small primary" onClick={() => setShop(true)}>
          {t('shopOpen')}
        </button>
      </div>
      <div class="muted tiny">{dailyText}</div>
      <div class="small">👛 {t('walletLine', { n: p.wallet })}</div>
      <div class="small">🪙 {t('budgetLine', { n: state.money })}</div>
      {p.wallet > 0 && (
        <div class="row gap">
          <input class="input grow" type="number" min={1} max={p.wallet} value={amount} onInput={(e) => setAmount(Math.floor(Number((e.target as HTMLInputElement).value) || 0))} />
          <button
            class="btn small"
            disabled={amount < 1 || amount > p.wallet}
            onClick={async () => {
              const r = await send({ type: 'transferToBudget', amount });
              if (r) toast(t('toBudgetDone', { n: amount }));
            }}
          >
            {t('toBudget')}
          </button>
        </div>
      )}
    </div>
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
  if (plan && now - plan.startedAt < (plan.durationMs ?? CONFIG.shiftMaxMs) + 60_000) return t('staffOnCounter');
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
      <div class="muted small">{p.role === 'barista' ? t('baristaHint') : t('managerHint', { e: CONFIG.managerTaskEnergy })}</div>
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
              <CupView cup={expectedCup({ order: id, milk: 'regular' })} size={compact ? 40 : 52} />
              <div class="menu-recipe">
                <RecipeIcons drink={id} size={16} />
              </div>
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
  const v = vitalsNow(state, p, now);
  const cost = v.shiftCost;
  const lack = v.energy < cost;
  const waitMs = lack ? ((cost - v.energy) / v.restPerMin) * 60_000 : 0;
  const active = !!state.activeShifts[me.id];
  const catHere = catInCafe(state);
  return (
    <div class="tab">
      <div class="card hero">
        <CafeArt levels={state.levels} />
        <div class="hero-body">
          <div class="hero-title">{t('shiftTitle')}</div>
          <div class="muted small">{t('shiftGuestsToday', { n: guestsPerShift(state, now), s: Math.round(shiftDuration(guestsPerShift(state, now)) / 1000) })}</div>
          <AudienceChips />
          <button class="btn primary big wide" disabled={!active && (lack || !!counter)} onClick={onStartShift}>
            {active ? t('continueShift') : t('startShiftCost', { e: cost })}
          </button>
          {!active && counter && <div class="locked-note center">⏳ {t('counterBusy', { name: counter.name })}</div>}
          {!active && !counter && lack && <div class="muted small center">{t('noEnergy', { need: cost, t: fmtDuration(waitMs) })}</div>}
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
  const [shop, setShop] = useState(false);
  const [view, setView] = useState<'hall' | 'info'>('hall');
  const seg = (
    <div class="segmented">
      {(['hall', 'info'] as const).map((v) => (
        <button type="button" class={`seg ${view === v ? 'on' : ''}`} onClick={() => setView(v)}>
          {t(v === 'hall' ? 'cafeViewHall' : 'cafeViewInfo')}
        </button>
      ))}
    </div>
  );
  if (view === 'hall')
    return (
      <div class="tab">
        {seg}
        <HallTab />
      </div>
    );
  return (
    <div class="tab">
      {seg}
      <BrandCard onShop={() => setShop(true)} />
      {shop && <ShopSheet onClose={() => setShop(false)} />}

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
          {STOCK_ORDER.filter((k) => (state.stock[k] ?? 0) > 0 || shiftsLeft(state, k) !== Infinity).map((k) => (
            <span class={lowStock(state).includes(k) ? 'warn' : ''}>
              <StockIcon k={k} size={20} /> {state.stock[k]}
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
      {summary.desserts > 0 && <div class="muted center">{t('dessertsLine', { n: summary.desserts, c: summary.pastry })}</div>}
      {(summary.walkNoDrink ?? 0) + (summary.walkNoMilk ?? 0) > 0 && <div class="muted small center">🚶 {t('walkoutsLine', { d: summary.walkNoDrink ?? 0, m: summary.walkNoMilk ?? 0 })}</div>}
      {summary.salary > 0 && <div class="center">👛 {t('salaryLine', { n: summary.salary })}</div>}
      {summary.happyMult && Math.abs(summary.happyMult - 1) > 0.005 && (
        <div class="muted small center">
          😊 {t('happyMultLine', { sign: summary.happyMult >= 1 ? '+' : '−', pct: Math.round(Math.abs(summary.happyMult - 1) * 100) })}
        </div>
      )}
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
          {t('shiftAgain', { e: getPlayer(state, me.id) ? vitalsNow(state, getPlayer(state, me.id)!, Date.now()).shiftCost : CONFIG.shiftEnergy })}
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
      <div class="muted small">{t('managerHint', { e: CONFIG.managerTaskEnergy })}</div>
      <fieldset class="plain" disabled={!isManager || !!busyBy}>
        {seg === 'stock' && <StockSeg />}
        {seg === 'menu' && <MenuSeg />}
        {seg === 'growth' && <GrowthSeg />}
      </fieldset>
    </div>
  );
}

function StockSeg() {
  const { state, me, send, now } = useGame();
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
      </div>
      {STOCK_GROUPS.map((grp) => {
        const items = stockByUrgency(state).filter((k) => STOCK_PACKS[k].group === grp.id && (grp.id !== 'dairy' || slotEffects(state).milks.includes(k.split('_')[1] as never)));
        const desserts = grp.id === 'desserts';
        const kinds = vitrineDesserts(state).length;
        const maxKinds = slotEffects(state).dessertKinds;
        const basketKinds = new Set([...vitrineDesserts(state), ...items.filter((k) => (basket[k] ?? 0) > 0).map((k) => k.slice(3))]).size;
        return (
          <details class="card stock-group" open={grp.id !== 'flavors' && grp.id !== 'desserts'}>
            <summary class="card-title">
              {L(grp.name)}
              {desserts && <span class="muted small"> · {t('vitrineKinds', { n: kinds, max: maxKinds })}</span>}
            </summary>
            {items.map((k) => {
              const pack = STOCK_PACKS[k];
              const cap = capacity(state, k);
              const n = basket[k] ?? 0;
              const have = state.stock[k] ?? 0;
              const after = have + pack.amount * n;
              const left = shiftsLeft(state, k);
              const newKind = desserts && have === 0 && n === 0 && basketKinds >= maxKinds;
              const canMore = have + pack.amount * (n + 1) <= cap && !newKind;
              const fresh = desserts ? state.dessertFresh?.[k.slice(3) as DessertId] : undefined;
              const note = desserts
                ? fresh && have > 0
                  ? t('freshFor', { t: fmtDuration(fresh - now) })
                  : `${DESSERTS[k.slice(3) as DessertId].price} 🪙`
                : left === Infinity
                  ? t('notUsedToday')
                  : left < 1
                    ? t('enoughForNone')
                    : t('enoughFor', { n: Math.floor(left) });
              return (
                <div class="stock-row">
                  <span class="icon">
                    <StockIcon k={k} size={36} />
                  </span>
                  <div class="grow">
                    <div class="row">
                      <b class="grow">{L(pack.name)}</b>
                      <span class={`small ${!desserts && left < 1 ? 'danger-text' : 'muted'}`}>{note}</span>
                    </div>
                    <div class="stock-bar">
                      <div class="stock-have" style={{ width: `${(have / cap) * 100}%` }} />
                      <div class="stock-add" style={{ width: `${((after - have) / cap) * 100}%` }} />
                    </div>
                    <div class="muted small num">{t('packLine', { have: n > 0 ? `${have}→${after}` : have, cap, amount: pack.amount, price: packPrice(state, me.id, k) })}</div>
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
          </details>
        );
      })}
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
            {t('basketGo', { e: CONFIG.managerTaskEnergy })}
          </button>
        </div>
      )}
    </>
  );
}

function monthsLabel(m: number[]): string {
  return m.map((x) => new Date(Date.UTC(2026, x - 1, 1)).toLocaleString(document.documentElement.lang === 'en' ? 'en' : 'ru', { month: 'short', timeZone: 'UTC' })).join(', ');
}

function MenuSeg() {
  const { state, send, now } = useGame();
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
          const season = inSeason(id, now);
          return (
            <div class={`row item drink-row ${has ? '' : 'locked-row'}`}>
              <div class="grow">
                <b>{L(d.name)}</b> <span class="muted small num">· {d.price} 🪙</span>
                {d.season && <span class={`tag ${season ? '' : 'off'}`}>{season ? t('seasonTag', { m: monthsLabel(d.season) }) : t('outOfSeason')}</span>}
                <div class="recipe">
                  <RecipeIcons drink={id} size={20} />
                </div>
              </div>
              {has ? (
                <button class={`chip ${today ? 'on' : ''}`} disabled={!today && !season} onClick={() => send({ type: 'toggleFeatured', id })}>
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
        <div class="card-title">🏪 {t('cafeLevelsTitle')}</div>
        <div class="muted small">{t('cafeLevelsHint')}</div>
        {CAFE_SLOT_ORDER.map((slot) => {
          const def = CAFE_SLOTS[slot];
          const lvl = slotLevel(state, slot);
          const cur = def.levels[lvl - 1];
          const next = def.levels[lvl];
          return (
            <div class="slot-row">
              <div class="row">
                <span class="icon"><Img name={slotArt(slot, lvl)} size={40} /></span>
                <div class="grow">
                  <b>{L(def.name)}</b>
                  <span class="level-dots">
                    {def.levels.map((_, i) => (
                      <span class={i < lvl ? 'on' : ''} />
                    ))}
                  </span>
                  <div class="small">
                    {L(cur.name)} · <span class="muted">{L(cur.desc)}</span>
                  </div>
                </div>
              </div>
              {next ? (
                <div class="slot-next">
                  <div class="small grow">
                    → <b>{L(next.name)}</b>: {L(next.desc)}
                  </div>
                  <div class="buy">
                    <button class="btn small" disabled={state.money < next.cost} onClick={() => send({ type: 'upgradeSlot', slot })}>
                      {CONFIG.managerTaskEnergy}⚡ · {next.cost} 🪙
                    </button>
                    {state.money < next.cost && <div class="small muted">{t('lacking', { n: next.cost - state.money })}</div>}
                  </div>
                </div>
              ) : (
                <span class="tag slot-max">{t('maxLevel')}</span>
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
              <div class="buy">
                <button class="btn small" disabled={!!state.marketing || state.money < m.cost} onClick={() => send({ type: 'launchMarketing', id })}>
                  {CONFIG.managerTaskEnergy}⚡ · {m.cost} 🪙
                </button>
                {!state.marketing && state.money < m.cost && <div class="small muted">{t('lacking', { n: m.cost - state.money })}</div>}
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}

function slotArt(slot: CafeSlot, lvl: number): string {
  if (slot === 'fridge') return `fridge-${lvl}`;
  if (slot === 'storage') return 'storage';
  return `${slot}-${lvl}`;
}

/** Какие аудитории покрывает меню дня: каждая приводит гостей. */
function AudienceChips() {
  const { state, now } = useGame();
  const a = audiences(state, now);
  const keys = ['black', 'milky', 'sweet', 'plant', 'desserts', 'season'] as const;
  return (
    <div class="chips aud-chips">
      {keys.map((k) => (
        <span class={`chip small ${a[k] ? 'on' : 'off'}`}>{t(`aud_${k}`)}</span>
      ))}
    </div>
  );
}

// ---------- квартира ----------

export function RoomTab() {
  const { state, me } = useGame();
  const keys = roomOrder(state, me.id);
  const [idx, setIdx] = useState(0);
  const pager = useRef<HTMLDivElement>(null);
  function goTo(i: number) {
    const el = pager.current;
    if (el) el.scrollTo({ left: i * el.clientWidth, behavior: 'smooth' });
    setIdx(i);
  }
  return (
    <div class="tab">
      <div class="room-dots">
        {keys.map((k, i) => {
          const r = state.home.rooms[k];
          return (
            <button class={`room-dot ${i === idx ? 'on' : ''} ${r.open ? '' : 'locked'}`} onClick={() => goTo(i)}>
              {r.open ? ROOMS[r.kind].icon : '🔒'} <span>{roomTitle(state, k, me.id)}</span>
            </button>
          );
        })}
      </div>
      <div
        class="room-pager"
        ref={pager}
        onScroll={(e) => {
          const el = e.currentTarget as HTMLDivElement;
          const i = Math.round(el.scrollLeft / Math.max(1, el.clientWidth));
          if (i !== idx) setIdx(i);
        }}
      >
        {keys.map((k, i) => (
          <div class="room-page">{Math.abs(i - idx) <= 1 ? <RoomPage roomKey={k} /> : null}</div>
        ))}
      </div>
      <div class="muted small center">{t('swipeHint')}</div>
      <CatCard />
    </div>
  );
}

function effectList(items: (string | undefined)[], room: HomeRoom): string {
  let rest = 0;
  let joy = 0;
  let cut = 0;
  for (const id of Object.values(room.placed)) {
    const d = DECOR.find((x) => x.id === id);
    if (!d) continue;
    rest += d.rest;
    joy += d.joy;
    cut += d.shiftCut;
  }
  void items;
  const parts: string[] = [];
  if (rest) parts.push(t('effRest', { n: +rest.toFixed(3) }));
  if (joy) parts.push(t('effJoy', { n: joy }));
  if (cut) parts.push(t('effCut', { n: cut }));
  return parts.length ? `${t('roomEffects', { list: parts.join(' · ') })} (${room.kind === 'bedroom' ? t('forOwner') : t('forAll')})` : t('roomEffectsNone');
}

function itemEffect(d: (typeof DECOR)[number]): string {
  const parts: string[] = [];
  if (d.rest) parts.push(t('effRest', { n: d.rest }));
  if (d.joy) parts.push(t('effJoy', { n: d.joy }));
  if (d.shiftCut) parts.push(t('effCut', { n: d.shiftCut }));
  return parts.join(' · ');
}

function RoomPage({ roomKey }: { roomKey: string }) {
  const { state, me, send } = useGame();
  const room = state.home.rooms[roomKey];
  const p = getPlayer(state, me.id)!;
  const slots = ROOM_SLOTS[room.kind];
  const [slot, setSlotRaw] = useState<DecorSlot>(slots[0]);
  const [showWalls, setShowWalls] = useState(false);
  const setSlot = (x: DecorSlot) => {
    setShowWalls(false);
    setSlotRaw(x);
  };
  const canEdit = room.open && (room.kind !== 'bedroom' || room.owner === me.id);
  const title = roomTitle(state, roomKey, me.id);

  if (!room.open) {
    const cost = roomCost(room);
    const left = cost - room.fund;
    const steps = [50, 200, left].filter((n, i, a) => n > 0 && n <= left && a.indexOf(n) === i);
    return (
      <div class="room-wrap">
        <RoomScene kind={room.kind} placed={{}} catMood={null} locked wallpaper={room.wallpaper} />
        <div class="card center">
          <h3>🔒 {title}</h3>
          <Progress label={t('roomLockedFund', { fund: room.fund, cost })} value={room.fund / cost} />
          <p class="muted small">{t('roomFundHint')}</p>
          <div class="row gap center-row">
            {steps.map((n) => (
              <button class="btn small" disabled={p.wallet < n} onClick={() => send({ type: 'contributeRoom', room: roomKey, amount: n })}>
                {t('roomGive', { n })}
              </button>
            ))}
            {p.wallet > 0 && p.wallet < left && !steps.includes(p.wallet) && (
              <button class="btn small primary" onClick={() => send({ type: 'contributeRoom', room: roomKey, amount: p.wallet })}>
                {t('roomGive', { n: p.wallet })}
              </button>
            )}
          </div>
          <div class="muted small">👛 {p.wallet} 🪙</div>
        </div>
      </div>
    );
  }

  return (
    <div class="room-wrap">
      <RoomScene kind={room.kind} placed={room.placed} wallpaper={room.wallpaper} catMood={room.kind === 'hall' && state.cat ? state.cat.mood : null} onSlot={canEdit ? setSlot : undefined} />
      <div class="card">
        <div class="card-title">
          {ROOMS[room.kind].icon} {title}
        </div>
        <div class="muted small">{effectList([], room)}</div>
        {!canEdit ? (
          <div class="locked-note">🔒 {t('roomOwnerOnly')}</div>
        ) : (
          <>
            <div class="chips">
              {slots.map((sl) => (
                <button class={`chip ${slot === sl ? 'on' : ''}`} onClick={() => setSlot(sl)}>
                  {L(SLOT_LABEL[sl])}
                </button>
              ))}
              <button class={`chip ${showWalls ? 'on' : ''}`} onClick={() => setShowWalls(true)}>
                🖌 {t('wallpaper')}
              </button>
            </div>
            {showWalls ? (
              <div class="decor-grid">
                {WALLPAPERS.filter((w) => w.rooms.includes(room.kind)).map((w) => {
                  const cur = (room.wallpaper ?? defaultWallpaper(room.kind)) === w.id;
                  const have = (room.wallpapers ?? [defaultWallpaper(room.kind)]).includes(w.id);
                  return (
                    <div class={`decor ${cur ? 'placed' : ''}`}>
                      <WallSwatch w={w} />
                      <div class="small">{L(w.name)}</div>
                      <div class="tiny muted">{t('joyPlus', { n: w.joy })}</div>
                      {cur ? (
                        <span class="tiny muted">{t('onWall')}</span>
                      ) : (
                        <button class="btn small" disabled={!have && p.wallet < w.cost} onClick={() => send({ type: 'setWallpaper', id: w.id, room: roomKey })}>
                          {have ? t('place') : `👛 ${w.cost}`}
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
            <div class="decor-grid">
              {DECOR.filter((d) => d.slot === slot).map((d) => {
                const owned = room.owned.includes(d.id);
                const placed = room.placed[d.slot] === d.id;
                return (
                  <div class={`decor ${placed ? 'placed' : ''}`}>
                    <DecorIcon id={d.id} />
                    <div class="small">{L(d.name)}</div>
                    <div class="tiny muted">{itemEffect(d)}</div>
                    {placed ? (
                      <button class="btn small ghost" onClick={() => send({ type: 'placeDecor', slot: d.slot, id: null, room: roomKey })}>
                        {t('remove')}
                      </button>
                    ) : owned ? (
                      <button class="btn small" onClick={() => send({ type: 'placeDecor', slot: d.slot, id: d.id, room: roomKey })}>
                        {t('place')}
                      </button>
                    ) : (
                      <button class="btn small" disabled={p.wallet < d.cost} onClick={() => send({ type: 'buyDecor', id: d.id, room: roomKey })}>
                        👛 {d.cost}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function CatCard() {
  const { state, me, now, send } = useGame();
  const [catName, setCatName] = useState('');
  const p = getPlayer(state, me.id)!;
  const petReadyIn = p.lastPetAt + CONFIG.catPetCooldownMs - now;
  return (
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
            <div class="row gap wrap">
              <button class="btn small" disabled={state.stock.catFood < 1} onClick={() => send({ type: 'feedCat' })}>
                🐟 {t('feed')}
              </button>
              <button class="btn small" disabled={petReadyIn > 0} onClick={() => send({ type: 'petCat' })}>
                ✋ {t('pet')}
              </button>
              <button class="btn small" disabled={p.wallet < CONFIG.catFoodPackCost} onClick={() => send({ type: 'buyCatFood' })}>
                👛 {t('buyCatFood', { cost: CONFIG.catFoodPackCost })}
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

      <GiftCard />

      <div class="card">
        <div class="card-title">📌 {t('boardTitle')}</div>
        <div class="row">
          <input class="input grow" value={text} maxLength={CONFIG.noteMaxLen} placeholder={t('notePlaceholder')} onInput={(e) => setText((e.target as HTMLInputElement).value)} />
          <button class="btn primary" disabled={!text.trim() && !sticker} onClick={post}>
            {t('send')}
          </button>
        </div>
        <div class="muted tiny">{t('noteCost', { e: CONFIG.noteEnergy, s: CONFIG.stickerEnergy })}</div>
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

/** Открытки и подарки коллегам: стоят личных денег и бодрости, радуют получателя. */
function GiftCard() {
  const { state, me, send } = useGame();
  const others = humans(state).filter((h) => h.id !== me.id);
  const [to, setTo] = useState(others[0]?.id ?? '');
  const [text, setText] = useState('');
  if (!others.length) return null;
  const p = getPlayer(state, me.id)!;
  const target = others.some((o) => o.id === to) ? to : others[0].id;
  async function go(kind: 'postcard' | 'gift') {
    const r = await send({ type: 'sendGift', to: target, kind, text });
    if (r) setText('');
  }
  return (
    <div class="card">
      <div class="card-title">🎁 {t('giftTitle')}</div>
      <div class="chips">
        {others.map((o) => (
          <button class={`chip ${target === o.id ? 'on' : ''}`} onClick={() => setTo(o.id)}>
            {o.name}
          </button>
        ))}
      </div>
      <input class="input" value={text} maxLength={60} placeholder={t('giftText')} onInput={(e) => setText((e.target as HTMLInputElement).value)} />
      <div class="row gap wrap">
        <button class="btn small" disabled={p.wallet < CONFIG.postcardCost} onClick={() => go('postcard')}>
          {t('giftPostcard', { cost: CONFIG.postcardCost, e: CONFIG.postcardEnergy })}
        </button>
        <button class="btn small" disabled={p.wallet < CONFIG.giftCost} onClick={() => go('gift')}>
          {t('giftGift', { cost: CONFIG.giftCost, e: CONFIG.giftEnergy })}
        </button>
      </div>
    </div>
  );
}

/** Сколько всего ждёт игрока во вкладке «Команда». */
export function teamBadge(s: CafeState, meId: string): number {
  const apps = s.applications.filter((a) => !a.approvals.includes(meId)).length;
  return apps + (s.swap && s.swap.with === meId ? 1 : 0);
}

