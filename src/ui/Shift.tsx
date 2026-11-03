import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { COMPONENTS, COMPONENT_ORDER, CONFIG, DRINKS, REGULARS, STATIONS, type ComponentId, type StationId, type StockId } from '../core/content';
import { recipeUsage } from '../core/engine';
import type { GuestResult, ShiftPlan } from '../core/types';
import { L, t } from '../i18n';
import { now as clockNow } from '../platform/clock';
import { tg } from '../platform/telegram';
import { CupSection } from './cup';
import { useGame } from './game';

// Смена: 75 секунд, только тапы. Одна чашка на прилавке — для выбранного гостя (по умолчанию первого).
// Ингредиент, который заказу не нужен, отскакивает. Эспрессо и пенка готовятся с таймером —
// пока машина работает, можно добавить остальное. «Подать» всегда на одном месте.

const GUEST_FACES = ['🧑', '👩', '👨‍🦱', '👩‍🦰', '🧔', '👱‍♀️', '🧑‍🎓', '👨‍💼'];
const SEATS = 3;
const TABLE_STAY_MS = 6000;
// Станции снизу вверх по частоте: эспрессо почти в каждом напитке — ближе всего к большому пальцу
const STATION_STACK: StationId[] = ['extras', 'milk', 'machine'];

interface Popup {
  id: number;
  text: string;
  good: boolean;
}

interface Table {
  status: 'free' | 'busy' | 'dirty';
  until: number;
  face: string;
}

interface Cup {
  /** Для какого гостя собирается (индекс в плане), null — пустая чашка. */
  guest: number | null;
  items: ComponentId[];
  brewing: { c: ComponentId; until: number; total: number }[];
}

const EMPTY: Cup = { guest: null, items: [], brewing: [] };
const count = (list: ComponentId[], c: ComponentId) => list.reduce((n, x) => n + (x === c ? 1 : 0), 0);

export function Shift({ plan, onDone }: { plan: ShiftPlan; onDone: (results: GuestResult[], cleanliness: number) => void }) {
  const { state } = useGame();
  const startOffset = Math.max(0, clockNow() - plan.startedAt);
  const t0 = useRef(performance.now() - startOffset);
  const [elapsed, setElapsed] = useState(startOffset);
  const [results, setResults] = useState<Map<number, GuestResult>>(new Map());
  const [cup, setCup] = useState<Cup>(EMPTY);
  const [picked, setPicked] = useState<number | null>(null);
  const [stock, setStock] = useState<Record<StockId, number>>({ ...state.stock });
  const [popups, setPopups] = useState<Popup[]>([]);
  const [bounce, setBounce] = useState<string | null>(null);
  const [streak, setStreak] = useState(0);
  const [coins, setCoins] = useState(0);
  const finished = useRef(false);
  const [tables, setTables] = useState<Table[]>(() => Array.from({ length: plan.tables ?? CONFIG.tablesBase }, () => ({ status: 'free', until: 0, face: '' })));
  const cleanSum = useRef(0);
  const cleanSamples = useRef(0);
  const cleanliness = () => (cleanSamples.current ? cleanSum.current / cleanSamples.current : 1);

  const heads: Record<StationId, number> = { machine: state.upgrades.machinePro ? 2 : 1, milk: 1, extras: 99 };

  // Кнопки ингредиентов стоят на постоянных местах: набор зависит от всего открытого меню,
  // а не от меню дня — раскладка меняется только когда открывают новый напиток
  const used = useMemo(() => {
    const set = new Set<ComponentId>();
    for (const d of state.menu) for (const c of DRINKS[d].recipe) set.add(c);
    for (const g of plan.guests) for (const c of DRINKS[g.order].recipe) set.add(c);
    return COMPONENT_ORDER.filter((c) => set.has(c));
  }, []);

  useEffect(() => {
    const id = window.setInterval(() => setElapsed(performance.now() - t0.current), 100);
    return () => window.clearInterval(id);
  }, []);

  // Готовка: «сварившееся» переходит в чашку
  useEffect(() => {
    if (!cup.brewing.some((b) => b.until <= elapsed)) return;
    const done = cup.brewing.filter((b) => b.until <= elapsed);
    setCup({ ...cup, items: [...cup.items, ...done.map((b) => b.c)], brewing: cup.brewing.filter((b) => b.until > elapsed) });
    tg.haptic('tap');
  }, [elapsed]);

  // Столики: гости уходят и оставляют посуду; считаем чистоту зала
  useEffect(() => {
    if (finished.current) return;
    if (tables.some((tb) => tb.status === 'busy' && tb.until <= elapsed)) {
      setTables((ts) => ts.map((tb) => (tb.status === 'busy' && tb.until <= elapsed ? { ...tb, status: 'dirty' } : tb)));
    }
    if (elapsed >= (plan.guests[0]?.arriveMs ?? 0)) {
      cleanSum.current += tables.filter((tb) => tb.status !== 'dirty').length / tables.length;
      cleanSamples.current += 1;
    }
  }, [elapsed]);

  function wipe(i: number) {
    if (finished.current) return;
    tg.haptic('tap');
    setTables((ts) => ts.map((tb, k) => (k === i && tb.status === 'dirty' ? { status: 'free', until: 0, face: '' } : tb)));
  }

  function seat(face: string) {
    setTables((ts) => {
      const idx = ts.findIndex((tb) => tb.status === 'free');
      if (idx < 0) return ts;
      return ts.map((tb, k) => (k === idx ? { status: 'busy', until: elapsed + TABLE_STAY_MS, face } : tb));
    });
  }

  // Терпение гостей и конец смены
  useEffect(() => {
    if (finished.current) return;
    let changed = false;
    const next = new Map(results);
    plan.guests.forEach((g, i) => {
      if (next.has(i)) return;
      if (elapsed - g.arriveMs >= g.patienceMs || elapsed >= CONFIG.shiftDurationMs) {
        next.set(i, { i, outcome: 'left', waitMs: g.patienceMs });
        changed = true;
      }
    });
    if (changed) {
      setResults(next);
      setStreak(0);
      tg.haptic('error');
      // Гость ушёл, не дождавшись, — его чашка больше не нужна
      if (cup.guest !== null && next.has(cup.guest)) setCup(EMPTY);
      if (picked !== null && next.has(picked)) setPicked(null);
    }
    if (next.size === plan.guests.length) {
      finished.current = true;
      window.setTimeout(() => onDone([...next.values()], cleanliness()), 600);
    }
  }, [elapsed]);

  const waiting = useMemo(
    () => plan.guests.map((g, i) => ({ g, i })).filter(({ g, i }) => g.arriveMs <= elapsed && !results.has(i)),
    [elapsed, results],
  );
  const atCounter = waiting.slice(0, SEATS);
  const upcoming = plan.guests.some((g, i) => g.arriveMs > elapsed && !results.has(i));
  const face = (i: number) => {
    const g = plan.guests[i];
    return g.regular ? REGULARS[g.regular].avatar : GUEST_FACES[(plan.seed + i) % GUEST_FACES.length];
  };

  // Для кого чашка: к кому уже начали собирать, иначе выбранный, иначе первый у стойки
  const target = cup.guest ?? (picked !== null && atCounter.some((q) => q.i === picked) ? picked : (atCounter[0]?.i ?? null));
  const recipe = target !== null ? DRINKS[plan.guests[target].order].recipe : [];
  const inCup = [...cup.items, ...cup.brewing.map((b) => b.c)];
  const needs = (c: ComponentId) => count(recipe, c) > count(inCup, c);
  const complete = target !== null && !cup.brewing.length && cup.items.length === recipe.length && recipe.every((c) => count(cup.items, c) === count(recipe, c));

  const brewingAt = (st: StationId) => cup.brewing.filter((b) => COMPONENTS[b.c].station === st);
  const stationProgress = (st: StationId) => {
    const all = brewingAt(st);
    if (!all.length) return 0;
    const b = all.reduce((x, y) => (x.until < y.until ? x : y));
    return 1 - Math.max(0, b.until - elapsed) / b.total;
  };

  function shake(key: string) {
    tg.haptic('error');
    setBounce(key);
    window.setTimeout(() => setBounce(null), 350);
  }

  function pick(i: number) {
    if (finished.current) return;
    if (cup.guest !== null && cup.guest !== i) {
      // Чашку можно передать другому гостю, если то, что в ней, подходит его заказу
      const r = DRINKS[plan.guests[i].order].recipe;
      if (inCup.every((c) => count(r, c) >= count(inCup, c))) {
        tg.haptic('select');
        setCup({ ...cup, guest: i });
        setPicked(i);
      } else shake('cup');
      return;
    }
    tg.haptic('select');
    setPicked(i);
  }

  function add(c: ComponentId) {
    if (finished.current) return;
    const comp = COMPONENTS[c];
    const st = comp.uses;
    const usedStock = st ? inCup.filter((x) => COMPONENTS[x].uses === st).length : 0;
    if (target === null || !needs(c) || (st && usedStock + 1 > stock[st]) || (comp.brewMs && brewingAt(comp.station).length >= heads[comp.station])) {
      shake(c);
      return;
    }
    if (comp.brewMs) {
      tg.haptic('select');
      setCup({ ...cup, guest: target, brewing: [...cup.brewing, { c, until: elapsed + comp.brewMs, total: comp.brewMs }] });
    } else {
      tg.haptic('tap');
      setCup({ ...cup, guest: target, items: [...cup.items, c] });
    }
  }

  function popup(text: string, good: boolean) {
    const id = Math.random();
    setPopups((p) => [...p, { id, text, good }]);
    window.setTimeout(() => setPopups((p) => p.filter((x) => x.id !== id)), 1100);
  }

  function serve() {
    if (finished.current || !complete || target === null) return;
    const i = target;
    const g = plan.guests[i];
    const waitMs = Math.max(0, elapsed - g.arriveMs);
    const use = recipeUsage(g.order);
    const enough = (Object.keys(use) as StockId[]).every((s) => stock[s] >= (use[s] ?? 0));
    if (enough) {
      const ns = { ...stock };
      for (const s of Object.keys(use) as StockId[]) ns[s] -= use[s] ?? 0;
      setStock(ns);
    }
    const next = new Map(results);
    next.set(i, { i, outcome: enough ? 'served' : 'wrong', waitMs });
    setResults(next);
    setCup(EMPTY);
    setPicked(null);
    seat(face(i));
    if (enough) {
      tg.haptic('success');
      setStreak(streak + 1);
      setCoins(coins + DRINKS[g.order].price);
      popup(`+${DRINKS[g.order].price} 🪙`, true);
    } else {
      tg.haptic('error');
      setStreak(0);
      popup('✗', false);
    }
  }

  function pourOut() {
    if (cup.brewing.length || !cup.items.length) return;
    tg.haptic('tap');
    setCup(EMPTY);
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
  const stockLeft = (st: StockId) => stock[st] - inCup.filter((x) => COMPONENTS[x].uses === st).length;

  return (
    <div class="shift">
      <div class="shift-top">
        <div class={`shift-clock ${timeLeft < 15000 ? 'low' : ''}`}>{Math.ceil(timeLeft / 1000)}</div>
        <div class="timer grow">
          <div class={`timer-fill ${timeLeft < 15000 ? 'low' : ''}`} style={{ width: `${(timeLeft / CONFIG.shiftDurationMs) * 100}%` }} />
        </div>
        <span class="shift-chip">
          ☕ {servedCount}/{plan.guests.length}
        </span>
        <span class="shift-chip">🪙 {coins}</span>
        {streak >= 2 && <span class="shift-chip streak">🔥 ×{streak}</span>}
        <button class="shift-close" onClick={endEarly} aria-label={t('endShift')}>
          ✕
        </button>
      </div>

      {/* Гости у стойки: тап — собирать его заказ */}
      <div class="guests">
        {Array.from({ length: SEATS }, (_, k) => {
          const q = atCounter[k];
          if (!q) return <div class="guest empty">{k === 0 && !waiting.length ? <span class="muted small">{upcoming ? t('nextGuest') : '…'}</span> : null}</div>;
          const { g, i } = q;
          const left = Math.max(0, 1 - (elapsed - g.arriveMs) / g.patienceMs);
          const reg = g.regular ? REGULARS[g.regular] : null;
          const ring = left > 0.5 ? 'var(--ok)' : left > 0.25 ? 'var(--warn)' : 'var(--bad)';
          const mine = target === i;
          const have = mine ? [...inCup] : [];
          return (
            <button class={`guest ${mine ? 'target' : ''} ${left < 0.25 ? 'angry' : ''} ${mine && bounce === 'cup' ? 'bounce' : ''}`} onClick={() => pick(i)}>
              <div class="guest-face" style={{ background: `conic-gradient(${ring} ${left * 360}deg, var(--line) 0)` }}>
                <span>{face(i)}</span>
              </div>
              {reg && <div class="guest-name">★ {L(reg.name)}</div>}
              <div class="ticket-name">{L(DRINKS[g.order].name)}</div>
              <div class="ticket-recipe">
                {DRINKS[g.order].recipe.map((c) => {
                  const k2 = have.indexOf(c);
                  if (k2 >= 0) have.splice(k2, 1);
                  return <span class={`ri ${k2 >= 0 ? 'done' : ''}`}>{COMPONENTS[c].icon}</span>;
                })}
              </div>
            </button>
          );
        })}
      </div>
      {waiting.length > SEATS && <div class="queue-more">{t('moreWaiting', { n: waiting.length - SEATS })}</div>}

      {/* Столики плашками в ряд: тап по грязному — протереть */}
      <div class="tables">
        {tables.map((tb, i) => (
          <button class={`table-spot ${tb.status}`} onClick={() => wipe(i)} disabled={tb.status !== 'dirty'} aria-label={t('tables')}>
            <span class="table-top">{tb.status === 'busy' ? tb.face : tb.status === 'dirty' ? '🍽️' : '🪑'}</span>
          </button>
        ))}
        <span class="tables-note small">{tables.some((tb) => tb.status === 'dirty') ? t('tablesWipe') : t('tables')}</span>
      </div>

      {/* Прилавок: одна чашка в разрезе, «Вылить» и «Подать» всегда здесь */}
      <div class={`counter-bar ${complete ? 'ready' : ''}`}>
        {popups.map((p) => (
          <div class={`popup ${p.good ? 'good' : 'bad'}`} key={p.id}>
            {p.text}
          </div>
        ))}
        <div class={`counter-cup ${bounce === 'cup' ? 'bounce' : ''}`}>
          {target !== null ? (
            <CupSection recipe={recipe} have={cup.items} brewing={cup.brewing.map((b) => ({ c: b.c, p: 1 - Math.max(0, b.until - elapsed) / b.total }))} size={70} glow={complete} />
          ) : (
            <CupSection recipe={[]} size={70} />
          )}
        </div>
        <div class="counter-info">
          {target !== null ? (
            <>
              <div class="counter-for">
                {face(target)} <b>{L(DRINKS[plan.guests[target].order].name)}</b>
              </div>
              <div class="muted small">{complete ? t('cupReady') : t('cupHint')}</div>
            </>
          ) : (
            <div class="muted small">{upcoming ? t('nextGuest') : '…'}</div>
          )}
        </div>
        <div class="counter-actions">
          <button class="btn ghost pour-btn" disabled={!cup.items.length || cup.brewing.length > 0} onClick={pourOut} aria-label={t('pour')}>
            🗑
          </button>
          <button class="btn primary serve-btn" disabled={!complete} onClick={serve}>
            {t('serve')}
          </button>
        </div>
      </div>

      {/* Станции в зоне большого пальца: внизу самое частое (кофемашина) */}
      <div class="stations">
        {STATION_STACK.map((sid) => {
          const comps = used.filter((c) => COMPONENTS[c].station === sid);
          if (!comps.length) return null;
          const brewing = brewingAt(sid).length;
          return (
            <div class={`station-group st-${sid}`}>
              <div class="station-label">
                <span>{L(STATIONS[sid].name)}</span>
                {sid !== 'extras' && (
                  <span class="station-heads">
                    {Array.from({ length: heads[sid] }, (_, h) => (
                      <span class={`head ${h < brewing ? 'on' : ''}`}>{h < brewing && h === 0 ? <i style={{ width: `${stationProgress(sid) * 100}%` }} /> : null}</span>
                    ))}
                  </span>
                )}
              </div>
              <div class="station-row">
                {comps.map((c) => {
                  const st = COMPONENTS[c].uses;
                  const avail = st ? stockLeft(st) : Infinity;
                  return (
                    <button class={`station ${COMPONENTS[c].brewMs ? 'timed' : ''} ${needs(c) ? 'wanted' : ''} ${bounce === c ? 'bounce' : ''}`} disabled={avail <= 0} onClick={() => add(c)}>
                      <span class="station-icon">{COMPONENTS[c].icon}</span>
                      <span class="station-name">{L(COMPONENTS[c].name)}</span>
                      {COMPONENTS[c].brewMs && <span class="station-time">{t('sec', { n: (COMPONENTS[c].brewMs! / 1000).toFixed(1) })}</span>}
                      {st && avail <= 5 && <span class="station-stock">{avail > 0 ? avail : t('outOf')}</span>}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
