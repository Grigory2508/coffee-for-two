import { useCallback, useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { advance, type ShiftSummary } from '../core/engine';
import { GameError, type CafeState, type Command, type GuestResult, type ShiftPlan } from '../core/types';
import { lang, setLang, t, type Lang } from '../i18n';
import { makeBackend, parseInviteParam, type CafePeek } from '../net/backend';
import { identify, track } from '../platform/analytics';
import { now as clockNow, resetTime, skipTime, timeOffset } from '../platform/clock';
import { config } from '../platform/config';
import { getIdentity } from '../platform/identity';
import { tg } from '../platform/telegram';
import { CafeScene } from './art';
import { GameCtx, useGame, type Game } from './game';
import { BoardTab, CafeTab, Header, ManageTab, RoomTab, ShiftResult, TopTab } from './screens';
import { Shift } from './Shift';

type Tab = 'cafe' | 'manage' | 'home' | 'board' | 'top';
type Phase = { kind: 'loading' } | { kind: 'welcome' } | { kind: 'invite'; code: string; peek: CafePeek | null } | { kind: 'game' };

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
  const [tab, setTab] = useState<Tab>('cafe');
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
        if (invite && (!s || s.code !== invite)) {
          const peek = await backend.peek(invite).catch(() => null);
          track('invite_opened', { found: !!peek, full: !!peek?.full });
          if (peek?.isMember) {
            setState(await backend.join(invite));
            setPhase({ kind: 'game' });
          } else if (!s) {
            setPhase({ kind: 'invite', code: invite, peek });
          } else {
            // У игрока уже есть кофейня: в MVP одна кофейня на игрока
            setState(s);
            setPhase({ kind: 'game' });
          }
          return;
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

  useEffect(() => backend.subscribe((s) => setState(s)), [backend]);

  useEffect(() => {
    const id = window.setInterval(() => setNow(clockNow()), 1000);
    return () => window.clearInterval(id);
  }, []);

  // Вид «прокрученного» до текущего момента состояния (энергия, кот, NPC) без записи
  const view = useMemo(() => (state ? advance(state, now) : null), [state, now]);

  const send = useCallback(
    async (cmd: Command) => {
      try {
        const r = await backend.send(cmd);
        setState(r.state);
        setNow(clockNow());
        return r;
      } catch (e) {
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

  async function finishShift(results: GuestResult[]) {
    const plan = shift;
    const r = await send({ type: 'finishShift', results });
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
        onCreate={async (name) => {
          try {
            const s = await backend.create(name, lang() === 'ru' ? 'Сосед Артур' : 'Neighbour Arthur');
            track('cafe_created', {});
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
        onJoin={async () => {
          try {
            const s = await backend.join(phase.code);
            track('partner_joined', {});
            setState(s);
            setPhase({ kind: 'game' });
            maybeAskWrite();
          } catch (e) {
            toast(errorText(e));
          }
        }}
        onOwn={() => setPhase({ kind: 'welcome' })}
        toastText={toastText}
      />
    );

  if (!view || !state) return <div class="splash">{t('loading')}</div>;

  const game: Game = { state: view, me, now, backend, send, toast };

  return (
    <GameCtx.Provider value={game}>
      <div class="app">
        {shift ? (
          <Shift plan={shift} onDone={finishShift} />
        ) : result ? (
          <>
            <Header />
            <main>
              <ShiftResult summary={result.summary} total={result.total} onClose={() => setResult(null)} />
            </main>
          </>
        ) : (
          <>
            <Header />
            <main>
              {tab === 'cafe' && <CafeTab onStartShift={startShift} />}
              {tab === 'manage' && <ManageTab />}
              {tab === 'home' && <RoomTab />}
              {tab === 'board' && <BoardTab />}
              {tab === 'top' && <TopTab />}
            </main>
            <nav class="tabs">
              {(
                [
                  ['cafe', '☕', t('tabCafe')],
                  ['manage', '📦', t('tabManage')],
                  ['home', view.room.unlocked ? '🏠' : '🔒', t('tabHome')],
                  ['board', '💬', t('tabBoard')],
                  ['top', '🏆', t('tabTop')],
                ] as [Tab, string, string][]
              ).map(([id, icon, label]) => (
                <button
                  class={`tab-btn ${tab === id ? 'on' : ''}`}
                  onClick={() => {
                    tg.haptic('select');
                    setTab(id);
                  }}
                >
                  <span class="tab-icon">{icon}</span>
                  <span class="tab-label">{label}</span>
                </button>
              ))}
            </nav>
          </>
        )}
        {askWrite && <WriteAccessModal onAnswer={onWriteAnswer} />}
        {config.debug && !shift && <DebugPanel onReset={() => location.reload()} />}
        {toastText && <div class="toast">{toastText}</div>}
      </div>
    </GameCtx.Provider>
  );
}

// ---------- онбординг ----------

function Welcome({ onCreate, toastText }: { onCreate: (name: string) => void; toastText: string | null }) {
  const [name, setName] = useState(t('cafeNameDefault'));
  return (
    <div class="app onboarding">
      <CafeScene cat={false} busy={true} />
      <div class="onb-body">
        <h1>{t('welcomeTitle')}</h1>
        <p class="muted">{t('welcomeText')}</p>
        <label class="small">{t('cafeNameLabel')}</label>
        <input class="input" value={name} maxLength={24} onInput={(e) => setName((e.target as HTMLInputElement).value)} />
        <button class="btn primary big wide" disabled={!name.trim()} onClick={() => onCreate(name.trim())}>
          {t('openCafe')}
        </button>
      </div>
      {toastText && <div class="toast">{toastText}</div>}
    </div>
  );
}

function Invite({ peek, onJoin, onOwn, toastText }: { peek: CafePeek | null; onJoin: () => void; onOwn: () => void; toastText: string | null }) {
  return (
    <div class="app onboarding">
      <CafeScene cat={false} busy={true} />
      <div class="onb-body">
        <h1>💌 {t('inviteTitle')}</h1>
        {peek && !peek.full && <p>{t('inviteText', { name: peek.owner, cafe: peek.name })}</p>}
        {peek?.full && <p class="muted">{t('inviteFull')}</p>}
        {!peek && <p class="muted">{t('inviteNotFound')}</p>}
        {peek && !peek.full && (
          <button class="btn primary big wide" onClick={onJoin}>
            {t('inviteJoin')}
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
    u.searchParams.set('startapp', `cafe_${state.code}`);
    u.searchParams.set('as', 'partner');
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
      <div class="chips">
        <button class="chip" onClick={() => send({ type: 'debugRefill' })}>
          {t('debugRefill')}
        </button>
        <a class="chip" href={partnerUrl} target="_blank" rel="noopener">
          {t('debugPartner')}
        </a>
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
