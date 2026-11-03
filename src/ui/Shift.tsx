import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { COMPONENTS, COMPONENT_ORDER, CONFIG, DRINKS, REGULARS, type ComponentId, type StockId } from '../core/content';
import { matchesRecipe, recipeUsage } from '../core/engine';
import type { GuestResult, ShiftPlan } from '../core/types';
import { L, t } from '../i18n';
import { now as clockNow } from '../platform/clock';
import { tg } from '../platform/telegram';
import { useGame } from './game';

const COMPONENT_STOCK: Partial<Record<ComponentId, StockId>> = { shot: 'beans', milk: 'milk', foam: 'milk', syrup: 'syrup', cocoa: 'cocoa' };
const GUEST_FACES = ['🧑', '👩', '👨‍🦱', '👩‍🦰', '🧔', '👱‍♀️', '🧑‍🎓', '👨‍💼'];

interface Popup {
  id: number;
  text: string;
  good: boolean;
}

interface Table {
  status: 'free' | 'busy' | 'dirty';
  until: number;
  wipes: number;
  face: string;
}

const WIPES_TO_CLEAN = 2;
const TABLE_STAY_MS = 6000;

export function Shift({ plan, onDone }: { plan: ShiftPlan; onDone: (results: GuestResult[], cleanliness: number) => void }) {
  const { state } = useGame();
  const startOffset = Math.max(0, clockNow() - plan.startedAt);
  const t0 = useRef(performance.now() - startOffset);
  const [elapsed, setElapsed] = useState(startOffset);
  const [results, setResults] = useState<Map<number, GuestResult>>(new Map());
  const [cup, setCup] = useState<ComponentId[]>([]);
  const [selected, setSelected] = useState<number | null>(null);
  const [stock, setStock] = useState<Record<StockId, number>>({ ...state.stock });
  const [popups, setPopups] = useState<Popup[]>([]);
  const [hints, setHints] = useState<boolean>(() => {
    try {
      const v = localStorage.getItem('cft:hints');
      return v === null ? true : v === '1';
    } catch {
      return true;
    }
  });
  const finished = useRef(false);
  const [tables, setTables] = useState<Table[]>(() =>
    Array.from({ length: plan.tables ?? CONFIG.tablesBase }, () => ({ status: 'free', until: 0, wipes: 0, face: '' })),
  );
  // Чистота зала: доля не-грязных столиков, усреднённая по времени смены
  const cleanSum = useRef(0);
  const cleanSamples = useRef(0);
  const cleanliness = () => (cleanSamples.current ? cleanSum.current / cleanSamples.current : 1);

  useEffect(() => {
    const id = window.setInterval(() => setElapsed(performance.now() - t0.current), 100);
    return () => window.clearInterval(id);
  }, []);

  // Столики: гости уходят и оставляют посуду; считаем чистоту зала
  useEffect(() => {
    if (finished.current) return;
    if (tables.some((tb) => tb.status === 'busy' && tb.until <= elapsed)) {
      setTables((ts) => ts.map((tb) => (tb.status === 'busy' && tb.until <= elapsed ? { ...tb, status: 'dirty', wipes: 0 } : tb)));
    }
    if (elapsed >= (plan.guests[0]?.arriveMs ?? 0)) {
      cleanSum.current += tables.filter((tb) => tb.status !== 'dirty').length / tables.length;
      cleanSamples.current += 1;
    }
  }, [elapsed]);

  function wipe(i: number) {
    if (finished.current) return;
    tg.haptic('tap');
    setTables((ts) =>
      ts.map((tb, k) => {
        if (k !== i || tb.status !== 'dirty') return tb;
        const wipes = tb.wipes + 1;
        return wipes >= WIPES_TO_CLEAN ? { status: 'free', until: 0, wipes: 0, face: '' } : { ...tb, wipes };
      }),
    );
  }

  function seat(face: string) {
    setTables((ts) => {
      const idx = ts.findIndex((tb) => tb.status === 'free');
      if (idx < 0) return ts; // свободных нет — гость берёт с собой
      return ts.map((tb, k) => (k === idx ? { status: 'busy', until: elapsed + TABLE_STAY_MS, wipes: 0, face } : tb));
    });
  }

  // Терпение гостей и конец смены
  useEffect(() => {
    if (finished.current) return;
    let changed = false;
    const next = new Map(results);
    plan.guests.forEach((g, i) => {
      if (next.has(i)) return;
      const waited = elapsed - g.arriveMs;
      if (waited >= g.patienceMs || elapsed >= CONFIG.shiftDurationMs) {
        next.set(i, { i, outcome: 'left', waitMs: g.patienceMs });
        changed = true;
      }
    });
    if (changed) {
      setResults(next);
      tg.haptic('error');
    }
    if (next.size === plan.guests.length) {
      finished.current = true;
      window.setTimeout(() => onDone([...next.values()], cleanliness()), 600);
    }
  }, [elapsed]);

  const queue = useMemo(
    () => plan.guests.map((g, i) => ({ g, i })).filter(({ g, i }) => g.arriveMs <= elapsed && !results.has(i)),
    [elapsed, results],
  );
  const target = queue.find((q) => q.i === selected) ?? queue[0];
  const upcoming = plan.guests.some((g, i) => g.arriveMs > elapsed && !results.has(i));

  const cupUsage = useMemo(() => {
    const u: Partial<Record<StockId, number>> = {};
    for (const c of cup) {
      const st = COMPONENT_STOCK[c];
      if (st) u[st] = (u[st] ?? 0) + 1;
    }
    return u;
  }, [cup]);

  function addComponent(c: ComponentId) {
    if (finished.current) return;
    const st = COMPONENT_STOCK[c];
    if (st && (cupUsage[st] ?? 0) + 1 > stock[st]) {
      tg.haptic('error');
      return;
    }
    if (cup.length >= 5) return;
    tg.haptic('tap');
    setCup([...cup, c]);
  }

  function popup(text: string, good: boolean) {
    const id = Math.random();
    setPopups((p) => [...p, { id, text, good }]);
    window.setTimeout(() => setPopups((p) => p.filter((x) => x.id !== id)), 1100);
  }

  function serve() {
    if (finished.current || !target || !cup.length) return;
    const { g, i } = target;
    const ok = matchesRecipe(cup, g.order);
    const waitMs = Math.max(0, elapsed - g.arriveMs);
    // Склад тратится по рецепту заказа — так же считает сервер
    const use = recipeUsage(g.order);
    const enough = (Object.keys(use) as StockId[]).every((k) => stock[k] >= (use[k] ?? 0));
    const outcome = ok && enough ? 'served' : 'wrong';
    if (enough) {
      const ns = { ...stock };
      for (const k of Object.keys(use) as StockId[]) ns[k] -= use[k] ?? 0;
      setStock(ns);
    }
    const next = new Map(results);
    next.set(i, { i, outcome, waitMs });
    setResults(next);
    setCup([]);
    setSelected(null);
    seat(target.g.regular ? REGULARS[target.g.regular].avatar : GUEST_FACES[(plan.seed + target.i) % GUEST_FACES.length]);
    if (outcome === 'served') {
      tg.haptic('success');
      popup(`+${DRINKS[g.order].price} 🪙`, true);
    } else {
      tg.haptic('error');
      popup('✗', false);
    }
  }

  function endEarly() {
    if (finished.current) return;
    finished.current = true;
    const next = new Map(results);
    plan.guests.forEach((g, i) => {
      if (!next.has(i)) next.set(i, { i, outcome: 'left', waitMs: g.patienceMs });
    });
    onDone([...next.values()], cleanliness());
  }

  const timeLeft = Math.max(0, CONFIG.shiftDurationMs - elapsed);
  const servedCount = [...results.values()].filter((r) => r.outcome === 'served').length;

  return (
    <div class="shift">
      <div class="shift-top">
        <div class="timer">
          <div class="timer-fill" style={{ width: `${(timeLeft / CONFIG.shiftDurationMs) * 100}%` }} />
        </div>
        <div class="shift-meta">
          <span>
            ☕ {servedCount}/{plan.guests.length}
          </span>
          {plan.catInCafe && state.cat && <span>🐈 {state.cat.name}</span>}
          <label class="hint-toggle">
            <input
              type="checkbox"
              checked={hints}
              onChange={(e) => {
                const v = (e.target as HTMLInputElement).checked;
                setHints(v);
                try {
                  localStorage.setItem('cft:hints', v ? '1' : '0');
                } catch {
                  /* ignore */
                }
              }}
            />{' '}
            {t('hints')}
          </label>
        </div>
      </div>

      <div class="queue">
        {queue.slice(0, 3).map(({ g, i }) => {
          const waited = elapsed - g.arriveMs;
          const left = Math.max(0, 1 - waited / g.patienceMs);
          const reg = g.regular ? REGULARS[g.regular] : null;
          return (
            <button class={`guest ${target?.i === i ? 'active' : ''} ${reg ? 'regular' : ''}`} onClick={() => setSelected(i)}>
              <div class="guest-face">{reg ? reg.avatar : GUEST_FACES[(plan.seed + i) % GUEST_FACES.length]}</div>
              {reg && <div class="guest-name">★ {L(reg.name)}</div>}
              <div class="guest-order">{L(DRINKS[g.order].name)}</div>
              {hints && <div class="guest-recipe">{DRINKS[g.order].recipe.map((c) => COMPONENTS[c].icon).join(' ')}</div>}
              <div class="patience">
                <div class={`patience-fill ${left < 0.3 ? 'low' : ''}`} style={{ width: `${left * 100}%` }} />
              </div>
            </button>
          );
        })}
        {!queue.length && <div class="queue-empty">{upcoming ? t('nextGuest') : '…'}</div>}
      </div>

      <div class="tables">
        {tables.map((tb, i) => (
          <button class={`table-spot ${tb.status}`} onClick={() => wipe(i)} disabled={tb.status !== 'dirty'} aria-label={t('tables')}>
            <span class="table-top">{tb.status === 'busy' ? tb.face : tb.status === 'dirty' ? (tb.wipes ? '🧽' : '🍽️') : '🪑'}</span>
          </button>
        ))}
        <span class="tables-note small">{t('tables')}</span>
      </div>

      <div class="counter">
        <div class="cup">
          {popups.map((p) => (
            <div class={`popup ${p.good ? 'good' : 'bad'}`} key={p.id}>
              {p.text}
            </div>
          ))}
          <div class="cup-body">
            {cup.length ? cup.map((c) => <span class="cup-item">{COMPONENTS[c].icon}</span>) : <span class="cup-empty">{t('cupEmpty')}</span>}
          </div>
        </div>
        <div class="cup-actions">
          <button class="btn ghost" disabled={!cup.length} onClick={() => setCup([])}>
            {t('pour')}
          </button>
          <button class="btn primary" disabled={!cup.length || !target} onClick={serve}>
            {t('serve')}
          </button>
        </div>
      </div>

      <div class="stations">
        {COMPONENT_ORDER.map((c) => {
          const st = COMPONENT_STOCK[c];
          const avail = st ? stock[st] - (cupUsage[st] ?? 0) : Infinity;
          return (
            <button class="station" disabled={avail <= 0} onClick={() => addComponent(c)}>
              <span class="station-icon">{COMPONENTS[c].icon}</span>
              <span class="station-name">{L(COMPONENTS[c].name)}</span>
              {st && <span class="station-stock">{avail > 0 ? avail : t('outOf')}</span>}
            </button>
          );
        })}
      </div>
      <div class="shift-foot">
        <span class="muted">{t('tablesHint')}</span>
        <button class="link" onClick={endEarly}>
          {t('endShift')}
        </button>
      </div>
    </div>
  );
}
