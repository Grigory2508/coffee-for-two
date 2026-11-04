import { useCallback, useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { advance, type ShiftSummary } from '../core/engine';
import { GameError, type CafeState, type Command, type GuestResult, type LogEntry, type ShiftPlan } from '../core/types';
import { L, lang, setLang, t, type Lang } from '../i18n';
import { makeBackend, parseInviteParam, pendingInvite, type CafePeek, type Invite } from '../net/backend';
import { CONFIG, ROLES, type Role } from '../core/content';
import { identify, track } from '../platform/analytics';
import { now as clockNow, resetTime, skipTime, timeOffset } from '../platform/clock';
import { config } from '../platform/config';
import { getIdentity } from '../platform/identity';
import { tg } from '../platform/telegram';
import { CafeArt } from './icons';
import { describeLog, GameCtx, timeAgo, useGame, type Game } from './game';
import { CafeInfoTab, CounterTab, Header, OfficeTab, RoomTab, ShiftResult, TeamTab, teamBadge } from './screens';
import { RatingsTab } from './social';
import { BrandEditor } from './logo';
import { DEFAULT_LOGO, cleanCafeName, type Logo } from '../core/content';
import { digestFor, getPlayer, vitalsNow } from '../core/engine';
import { lowStock } from './stock';
import { Shift } from './Shift';

type Tab = 'work' | 'cafe' | 'home' | 'top' | 'team';
type Phase =
  | { kind: 'loading' }
  | { kind: 'welcome' }
  | { kind: 'invite'; invite: Invite; peek: CafePeek | null }
  | { kind: 'pending'; invite: Invite; peek: CafePeek | null }
  | { kind: 'game' };

function errorText(e: unknown): string {
  if (e instanceof GameError) {
    const key = `err_${e.code}`;
    const s = t(key, e.params);
    return s === key ? t('err_unknown') : s;
  }
  console.error(e);
  return t('err_unknown');
}

export function App() {
  const me = useMemo(getIdentity, []);
  const backend = useMemo(() => makeBackend(me), [me]);
  const [phase, setPhase] = useState<Phase>({ kind: 'loading' });
  const [state, setState] = useState<CafeState | null>(null);
  const [now, setNow] = useState(clockNow());
  const [tab, setTab] = useState<Tab>('work');
  // «Пока тебя не было» — один раз при входе, живые события его не открывают
  const [digestItems, setDigestItems] = useState<LogEntry[] | null>(null);
  const [shift, setShift] = useState<ShiftPlan | null>(null);
  const [result, setResult] = useState<{ summary: ShiftSummary; total: number } | null>(null);
  const [toastText, setToastText] = useState<string | null>(null);
  const [askWrite, setAskWrite] = useState(false);
  const toastTimer = useRef<number>(0);

  const toast = useCallback((text: string) => {
    setToastText(text);
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToastText(null), 2600);
  }, []);

  // запуск
  useEffect(() => {
    identify(me.id);
    const start = tg.startParam();
    const invite = parseInviteParam(start);
    track('session_start', { source: invite ? 'partner_card' : start === 'bot' ? 'bot_message' : 'direct', inTelegram: tg.inTelegram, mode: backend.mode });
    (async () => {
      try {
        const s = await backend.load();
        if (s) pendingInvite.set(null);
        // Ссылка-приглашение важнее отложенной заявки; без ссылки — проверяем отложенную
        const inv = invite ?? (!s ? parseInviteParam(pendingInvite.get()) : null);
        if (inv && (!s || s.code !== inv.code)) {
          const peek = await backend.peek(inv).catch(() => null);
          if (invite) track('invite_opened', { found: !!peek, full: !!peek?.full, expired: !!peek?.expired });
          if (peek?.isMember) {
            const st = await backend.enter(inv);
            if (st) {
              pendingInvite.set(null);
              setState(st);
              setPhase({ kind: 'game' });
              return;
            }
          }
          if (!s) {
            setPhase(peek?.application ? { kind: 'pending', invite: inv, peek } : { kind: 'invite', invite: inv, peek });
            return;
          }
          // У игрока уже есть кофейня: в MVP одна кофейня на игрока
        }
        if (s) {
          setState(s);
          setPhase({ kind: 'game' });
        } else setPhase({ kind: 'welcome' });
      } catch (e) {
        toast(errorText(e));
        setPhase({ kind: 'welcome' });
      }
    })();
  }, []);

  // Ожидание одобрения: опрашиваем кофейню, пока заявка висит
  useEffect(() => {
    if (phase.kind !== 'pending') return;
    const inv = phase.invite;
    let stop = false;
    const tick = async () => {
      const peek = await backend.peek(inv).catch(() => null);
      if (stop) return;
      if (peek?.isMember) {
        const st = await backend.enter(inv);
        if (st && !stop) {
          pendingInvite.set(null);
          tg.haptic('success');
          track('partner_joined', { role: peek.staff.find((x) => x.name === me.name)?.role ?? '' });
          setState(st);
          setPhase({ kind: 'game' });
        }
        return;
      }
      setPhase({ kind: 'pending', invite: inv, peek });
    };
    const id = window.setInterval(tick, backend.mode === 'local' ? 3000 : 15000);
    return () => {
      stop = true;
      window.clearInterval(id);
    };
  }, [phase.kind, backend]);

  useEffect(() => backend.subscribe((s) => setState(s)), [backend]);

  useEffect(() => {
    if (phase.kind !== 'game' || !state || digestItems !== null) return;
    setDigestItems(digestFor(state, me.id).slice(-6));
  }, [phase.kind, state]);

  // Игрока убрали из команды (или он вышел в другой вкладке) — возвращаем на старт
  const removed = phase.kind === 'game' && !!state && !state.players.some((p) => p.id === me.id);
  useEffect(() => {
    if (!removed) return;
    void backend.leave().catch(() => undefined);
    setShift(null);
    setResult(null);
    setTab('cafe');
    setState(null);
    setPhase({ kind: 'welcome' });
    toast(t('removedToast'));
  }, [removed]);

  useEffect(() => {
    const id = window.setInterval(() => setNow(clockNow()), 1000);
    return () => window.clearInterval(id);
  }, []);

  // Вид «прокрученного» до текущего момента состояния (энергия, кот, NPC) без записи
  const view = useMemo(() => (state ? advance(state, now) : null), [state, now]);

  const send = useCallback(
    async (cmd: Command, opts?: { quiet?: boolean }) => {
      try {
        const r = await backend.send(cmd);
        setState(r.state);
        setNow(clockNow());
        return r;
      } catch (e) {
        if (opts?.quiet) return null;
        tg.haptic('error');
        toast(errorText(e));
        return null;
      }
    },
    [backend],
  );

  async function startShift() {
    const r = await send({ type: 'startShift' });
    if (r?.shiftPlan) {
      track('shift_started', { resumed: !!state?.activeShifts[me.id] });
      setShift(r.shiftPlan);
    }
  }

  async function finishShift(results: GuestResult[], cleanliness: number) {
    const plan = shift;
    const r = await send({ type: 'finishShift', results, cleanliness });
    setShift(null);
    if (r?.summary && plan) {
      track('shift_finished', { ...r.summary, beats: r.summary.beats.length });
      setResult({ summary: r.summary, total: plan.guests.length });
      maybeAskWrite();
    }
  }

  function maybeAskWrite() {
    if (!tg.inTelegram) return;
    try {
      if (localStorage.getItem('cft:writeAsked') === '1') return;
    } catch {
      /* ignore */
    }
    if (tg.allowsWrite()) return;
    setAskWrite(true);
  }

  async function onWriteAnswer(allow: boolean) {
    setAskWrite(false);
    try {
      localStorage.setItem('cft:writeAsked', '1');
    } catch {
      /* ignore */
    }
    if (!allow) {
      track('write_access', { result: 'later' });
      return;
    }
    const ok = await tg.requestWriteAccess();
    track('write_access', { result: ok ? 'allowed' : 'denied' });
  }

  // ---------- экраны до игры ----------

  if (phase.kind === 'loading') return <div class="splash">{t('loading')}</div>;

  if (phase.kind === 'welcome')
    return (
      <Welcome
        onCreate={async (name, role, logo) => {
          try {
            const s = await backend.create(name, lang() === 'ru' ? 'Сосед Артур' : 'Neighbour Arthur', role, logo);
            track('cafe_created', { role });
            setState(s);
            setPhase({ kind: 'game' });
          } catch (e) {
            toast(errorText(e));
          }
        }}
        toastText={toastText}
      />
    );

  if (phase.kind === 'invite')
    return (
      <Invite
        peek={phase.peek}
        onApply={async (role) => {
          try {
            await backend.apply(phase.invite, role);
            pendingInvite.set(`cafe_${phase.invite.code}_${phase.invite.key}`);
            track('application_sent', { role });
            const peek = await backend.peek(phase.invite).catch(() => null);
            if (peek?.isMember) {
              // Единственный сотрудник мог одобрить мгновенно (или это повторный вход)
              const st = await backend.enter(phase.invite);
              if (st) {
                pendingInvite.set(null);
                setState(st);
                setPhase({ kind: 'game' });
                return;
              }
            }
            setPhase({ kind: 'pending', invite: phase.invite, peek });
            maybeAskWrite();
          } catch (e) {
            toast(errorText(e));
          }
        }}
        onOwn={() => setPhase({ kind: 'welcome' })}
        toastText={toastText}
      />
    );

  if (phase.kind === 'pending')
    return (
      <>
        <Pending
          peek={phase.peek}
          onCancel={async () => {
            await backend.cancelApplication(phase.invite).catch(() => undefined);
            pendingInvite.set(null);
            track('application_cancelled', {});
            setPhase({ kind: 'welcome' });
          }}
          onOwn={() => {
            pendingInvite.set(null);
            setPhase({ kind: 'welcome' });
          }}
          toastText={toastText}
        />
        {askWrite && <WriteAccessModal onAnswer={onWriteAnswer} />}
      </>
    );

  if (!view || !state || removed) return <div class="splash">{t('loading')}</div>;

  const game: Game = {
    state: view,
    me,
    now,
    backend,
    send,
    toast,
    refresh: async () => {
      const st = await backend.load().catch(() => null);
      if (st) setState(st);
    },
    onLeft: () => {
      setShift(null);
      setResult(null);
      setTab('work');
      setState(null);
      setPhase({ kind: 'welcome' });
    },
  };

  const meP = getPlayer(view, me.id);
  const isManager = meP?.role === 'manager';
  const tBadge = teamBadge(view, me.id);
  const lowN = isManager ? lowStock(view).length : 0;
  const canAgain = !!meP && vitalsNow(view, meP, now).energy >= vitalsNow(view, meP, now).shiftCost;
  const go = (id: Tab) => {
    tg.haptic('select');
    setTab(id);
    window.scrollTo(0, 0);
  };

  return (
    <GameCtx.Provider value={game}>
      <div class="app">
        {shift ? (
          <Shift plan={shift} onDone={finishShift} />
        ) : (
          <>
            <Header
              onRating={() => go('top')}
              onAlert={() => go(isManager ? 'work' : 'team')}
              extra={config.debug ? <DebugPanel onReset={() => location.reload()} /> : null}
            />
            <main>
              {result ? (
                <ShiftResult
                  summary={result.summary}
                  total={result.total}
                  canAgain={canAgain}
                  onAgain={() => {
                    setResult(null);
                    void startShift();
                  }}
                  onClose={() => setResult(null)}
                />
              ) : (
                <>
                  {tab === 'work' && (isManager ? <OfficeTab /> : <CounterTab onStartShift={startShift} />)}
                  {tab === 'cafe' && <CafeInfoTab />}
                  {tab === 'home' && <RoomTab />}
                  {tab === 'top' && <RatingsTab />}
                  {tab === 'team' && <TeamTab />}
                </>
              )}
            </main>
            {!result && (
              <nav class="tabs">
                {(
                  [
                    ['work', isManager ? '📋' : '☕', isManager ? t('tabOffice') : t('tabCounter'), lowN],
                    ['cafe', '🏪', t('tabCafe'), 0],
                    ['home', '🏠', t('tabHome'), 0],
                    ['top', '🏆', t('tabTop'), 0],
                    ['team', '💬', t('tabTeam'), tBadge],
                  ] as [Tab, string, string, number][]
                ).map(([id, icon, label, badge]) => (
                  <button class={`tab-btn ${tab === id ? 'on' : ''}`} onClick={() => go(id)}>
                    <span class="tab-icon">
                      {icon}
                      {badge > 0 && <span class="badge">{badge}</span>}
                    </span>
                    <span class="tab-label">{label}</span>
                  </button>
                ))}
              </nav>
            )}
            {!!digestItems?.length && !result && (
              <div class="sheet-bg" onClick={() => setDigestItems([])}>
                <div class="sheet" onClick={(e) => e.stopPropagation()}>
                  <div class="sheet-grip" />
                  <h3>📬 {t('whileAway')}</h3>
                  <ul class="log">
                    {digestItems.map((d) => (
                      <li>
                        <span class="muted small">{timeAgo(now, d.at)}</span> {describeLog(view, d)}
                      </li>
                    ))}
                  </ul>
                  <button
                    class="btn primary wide"
                    onClick={() => {
                      setDigestItems([]);
                      void send({ type: 'seen' }, { quiet: true });
                    }}
                  >
                    {t('gotIt')}
                  </button>
                </div>
              </div>
            )}
          </>
        )}
        {askWrite && <WriteAccessModal onAnswer={onWriteAnswer} />}
        {toastText && <div class="toast">{toastText}</div>}
      </div>
    </GameCtx.Provider>
  );
}

// ---------- онбординг ----------

function Welcome({ onCreate, toastText }: { onCreate: (name: string, role: Role, logo: Logo) => void; toastText: string | null }) {
  const [name, setName] = useState(t('cafeNameDefault'));
  const [logo, setLogo] = useState<Logo>(DEFAULT_LOGO);
  const [role, setRole] = useState<Role>('barista');
  const valid = !!cleanCafeName(name);
  return (
    <div class="app onboarding">
      <CafeArt />
      <div class="onb-body">
        <h1>{t('welcomeTitle')}</h1>
        <p class="muted">{t('welcomeText')}</p>
        <label class="small">{t('brandCreateLabel')}</label>
        <BrandEditor
          name={name}
          logo={logo}
          onChange={(n, l) => {
            setName(n);
            setLogo(l);
          }}
        />
        {!valid && name.trim() && <div class="small danger-text">{t('err_bad_name')}</div>}
        <label class="small">{t('roleChoose')}</label>
        <div class="role-cards">
          {(['barista', 'manager'] as Role[]).map((r) => (
            <button class={`role-card ${role === r ? 'on' : ''}`} onClick={() => setRole(r)}>
              <span class="role-icon">{ROLES[r].icon}</span>
              <b>{L(ROLES[r].name)}</b>
              <span class="muted small">{L(ROLES[r].desc)}</span>
            </button>
          ))}
        </div>
        <p class="muted small">{t('roleChooseHint')}</p>
        <button class="btn primary big wide" disabled={!valid} onClick={() => onCreate(name.trim(), role, logo)}>
          {t('openCafe')}
        </button>
      </div>
      {toastText && <div class="toast">{toastText}</div>}
    </div>
  );
}

function Invite({ peek, onApply, onOwn, toastText }: { peek: CafePeek | null; onApply: (role: Role) => void; onOwn: () => void; toastText: string | null }) {
  const ok = !!peek && !peek.full && !peek.expired;
  const [role, setRole] = useState<Role | null>(null);
  // По умолчанию — роль, где людей меньше всего (обычно ту, что прикрывает сосед)
  const byNeed = [...(peek?.freeRoles ?? [])].sort((x, y) => (peek?.staff.filter((p) => p.role === x).length ?? 0) - (peek?.staff.filter((p) => p.role === y).length ?? 0));
  const chosen = role && peek?.freeRoles.includes(role) ? role : (byNeed[0] ?? null);
  const [busy, setBusy] = useState(false);
  return (
    <div class="app onboarding">
      <CafeArt />
      <div class="onb-body">
        <h1>💌 {t('inviteTitle')}</h1>
        {ok && <p>{t('inviteText', { name: peek.owner, cafe: peek.name })}</p>}
        {ok && peek.staff.length > 0 && (
          <div class="team-mini">
            {peek.staff.map((p) => (
              <span class="chip">
                {ROLES[p.role].icon} {p.name}
              </span>
            ))}
          </div>
        )}
        {ok && (
          <>
            <label class="small">{t('chooseRole')}</label>
            <div class="role-cards">
              {(['barista', 'manager'] as Role[]).map((r) => {
                const n = peek.staff.filter((p) => p.role === r).length;
                const free = peek.freeRoles.includes(r);
                return (
                  <button class={`role-card ${chosen === r ? 'on' : ''}`} disabled={!free} onClick={() => setRole(r)}>
                    <span class="role-icon">{ROLES[r].icon}</span>
                    <b>{L(ROLES[r].name)}</b>
                    <span class="muted small">{L(ROLES[r].desc)}</span>
                    <span class="small">{t('roleSlots', { n, max: CONFIG.roleMax[r] })}</span>
                  </button>
                );
              })}
            </div>
            <p class="muted small">{t('applyHint')}</p>
          </>
        )}
        {peek?.full && <p class="muted">{t('inviteFull')}</p>}
        {peek?.expired && !peek.full && <p class="muted">{t('inviteExpired')}</p>}
        {!peek && <p class="muted">{t('inviteNotFound')}</p>}
        {ok && chosen && (
          <button
            class="btn primary big wide"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              await onApply(chosen);
              setBusy(false);
            }}
          >
            {t('applySend')}
          </button>
        )}
        <button class="btn ghost wide" onClick={onOwn}>
          {t('openOwn')}
        </button>
      </div>
      {toastText && <div class="toast">{toastText}</div>}
    </div>
  );
}

function Pending({ peek, onCancel, onOwn, toastText }: { peek: CafePeek | null; onCancel: () => void; onOwn: () => void; toastText: string | null }) {
  const app = peek?.application;
  return (
    <div class="app onboarding">
      <CafeArt />
      <div class="onb-body">
        <h1>⏳ {t('pendingTitle')}</h1>
        {app && peek ? (
          <>
            <p>{t('pendingText', { cafe: peek.name, role: L(ROLES[app.role].name), n: app.approvals, m: app.needed })}</p>
            <div class="progress">
              <div class="progress-fill" style={{ width: `${Math.round((100 * app.approvals) / Math.max(1, app.needed))}%` }} />
            </div>
            <p class="muted small">{t('pendingHint')}</p>
            <button class="btn ghost wide" onClick={onCancel}>
              {t('pendingCancel')}
            </button>
          </>
        ) : (
          <>
            <p class="muted">{t('pendingGone')}</p>
            <button class="btn primary wide" onClick={onOwn}>
              {t('openOwn')}
            </button>
          </>
        )}
      </div>
      {toastText && <div class="toast">{toastText}</div>}
    </div>
  );
}

function WriteAccessModal({ onAnswer }: { onAnswer: (allow: boolean) => void }) {
  return (
    <div class="modal-bg">
      <div class="modal">
        <div class="modal-icon">🐈📬</div>
        <h3>{t('writeTitle')}</h3>
        <p class="muted">{t('writeText')}</p>
        <button class="btn primary wide" onClick={() => onAnswer(true)}>
          {t('writeAllow')}
        </button>
        <button class="btn ghost wide" onClick={() => onAnswer(false)}>
          {t('writeLater')}
        </button>
      </div>
    </div>
  );
}

// ---------- отладка ----------

function DebugPanel({ onReset }: { onReset: () => void }) {
  const [open, setOpen] = useState(false);
  const { send, state, backend } = useGame();
  const H = 3600_000;
  if (!open)
    return (
      <button class="debug-fab" onClick={() => setOpen(true)} aria-label={t('debug')}>
        🛠
      </button>
    );
  const off = timeOffset();
  const partnerUrl = (() => {
    const u = new URL(location.href);
    u.search = '';
    u.searchParams.set('startapp', `cafe_${state.code}_${state.inviteKey}`);
    u.searchParams.set('as', `staff${state.players.length + state.applications.length + 1}`);
    return u.toString();
  })();
  return (
    <div class="debug">
      <div class="row">
        <b class="grow">🛠 {t('debug')}</b>
        <button class="link" onClick={() => setOpen(false)}>
          ✕
        </button>
      </div>
      <div class="muted small">
        {t('debugTime', { t: `${Math.round(off / 60_000)} min` })} · {backend.mode} · {state.code}
      </div>
      {backend.mode === 'local' && (
      <div class="chips">
        {[
          ['+1h', H],
          ['+4h', 4 * H],
          ['+1d', 24 * H],
          ['+1w', 7 * 24 * H],
        ].map(([label, ms]) => (
          <button
            class="chip"
            onClick={() => {
              skipTime(ms as number);
              send({ type: 'seen' });
            }}
          >
            {t('debugSkip')} {label}
          </button>
        ))}
        <button
          class="chip"
          onClick={() => {
            resetTime();
            location.reload();
          }}
        >
          {t('debugResetTime')}
        </button>
      </div>
      )}
      <div class="chips">
        <button class="chip" onClick={() => send({ type: 'debugRefill' })}>
          {t('debugRefill')}
        </button>
        {Object.values(state.home.rooms).some((r) => !r.open) && (
          <button class="chip" onClick={() => send({ type: 'debugUnlockRoom' })}>
            {t('debugUnlockRoom')}
          </button>
        )}
        {backend.mode === 'local' && (
          <a class="chip" href={partnerUrl} target="_blank" rel="noopener">
            {t('debugPartner')}
          </a>
        )}
        {(['ru', 'en'] as Lang[]).map((l) => (
          <button
            class={`chip ${lang() === l ? 'on' : ''}`}
            onClick={() => {
              setLang(l, true);
              location.reload();
            }}
          >
            {l.toUpperCase()}
          </button>
        ))}
        <button
          class="chip danger"
          onClick={async () => {
            if (!confirm(t('debugResetConfirm'))) return;
            await backend.leave();
            if (backend.mode === 'local') {
              Object.keys(localStorage)
                .filter((k) => k.startsWith('cft:'))
                .forEach((k) => localStorage.removeItem(k));
              try {
                sessionStorage.clear();
              } catch {
                /* ignore */
              }
            }
            onReset();
          }}
        >
          {t('debugReset')}
        </button>
      </div>
    </div>
  );
}
