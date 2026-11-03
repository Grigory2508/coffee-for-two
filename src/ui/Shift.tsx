import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { COMPONENTS, COMPONENT_ORDER, CONFIG, DRINKS, REGULARS, STATIONS, STATION_ORDER, type ComponentId, type StationId, type StockId } from '../core/content';
import { recipeUsage, todayMenu } from '../core/engine';
import type { GuestResult, ShiftPlan } from '../core/types';
import { L, t } from '../i18n';
import { now as clockNow } from '../platform/clock';
import { tg } from '../platform/telegram';
import { useGame } from './game';

// Смена в духе Cooking Fever, но на 75 секунд и только тапами:
// у каждого гостя у стойки своя чашка; ингредиент сам уходит в первую чашку, которой он нужен
// (или в выбранную); эспрессо и пенка готовятся с таймером — пока машина работает, собираешь другие чашки.

const GUEST_FACES = ['🧑', '👩', '👨‍🦱', '👩‍🦰', '🧔', '👱‍♀️', '🧑‍🎓', '👨‍💼'];
const SEATS = 3;
const TABLE_STAY_MS = 6000;

interface Popup {
  id: number;
  text: string;
  good: boolean;
  seat: number;
}

interface Table {
  status: 'free' | 'busy' | 'dirty';
  until: number;
  face: string;
}

interface Cup {
  items: ComponentId[];
  brewing: { c: ComponentId; until: number; total: number }[];
}

const emptyCup = (): Cup => ({ items: [], brewing: [] });
const count = (list: ComponentId[], c: ComponentId) => list.reduce((n, x) => n + (x === c ? 1 : 0), 0);
const contents = (cup: Cup) => [...cup.items, ...cup.brewing.map((b) => b.c)];

export function Shift({ plan, onDone }: { plan: ShiftPlan; onDone: (results: GuestResult[], cleanliness: number) => void }) {
  const { state } = useGame();
  const startOffset = Math.max(0, clockNow() - plan.startedAt);
  const t0 = useRef(performance.now() - startOffset);
  const [elapsed, setElapsed] = useState(startOffset);
  const [results, setResults] = useState<Map<number, GuestResult>>(new Map());
  const [cups, setCups] = useState<Map<number, Cup>>(new Map());
  const [picked, setPicked] = useState<number | null>(null);
  const [stock, setStock] = useState<Record<StockId, number>>({ ...state.stock });
  const [popups, setPopups] = useState<Popup[]>([]);
  const [bounce, setBounce] = useState<ComponentId | null>(null);
  const [streak, setStreak] = useState(0);
  const [coins, setCoins] = useState(0);
  const finished = useRef(false);
  const [tables, setTables] = useState<Table[]>(() => Array.from({ length: plan.tables ?? CONFIG.tablesBase }, () => ({ status: 'free', until: 0, face: '' })));
  const cleanSum = useRef(0);
  const cleanSamples = useRef(0);
  const cleanliness = () => (cleanSamples.current ? cleanSum.current / cleanSamples.current : 1);

  // Сколько «рожков» у кофемашины: с Pro — два эспрессо одновременно
  const heads: Record<StationId, number> = { machine: state.upgrades.machinePro ? 2 : 1, milk: 1, extras: 99 };

  // На станциях только то, что нужно для меню дня (и заказов этой смены)
  const used = useMemo(() => {
    const set = new Set<ComponentId>();
    for (const d of todayMenu(state)) for (const c of DRINKS[d].recipe) set.add(c);
    for (const g of plan.guests) for (const c of DRINKS[g.order].recipe) set.add(c);
    return COMPONENT_ORDER.filter((c) => set.has(c));
  }, []);

  useEffect(() => {
    const id = window.setInterval(() => setElapsed(performance.now() - t0.current), 100);
    return () => window.clearInterval(id);
  }, []);

  const cupOf = (i: number) => cups.get(i) ?? emptyCup();

  // Готовка: то, что «сварилось», переходит в чашку
  useEffect(() => {
    let any = false;
    for (const c of cups.values()) if (c.brewing.some((b) => b.until <= elapsed)) any = true;
    if (!any) return;
    const next = new Map(cups);
    for (const [i, c] of cups) {
      const done = c.brewing.filter((b) => b.until <= elapsed);
      if (done.length) next.set(i, { items: [...c.items, ...done.map((b) => b.c)], brewing: c.brewing.filter((b) => b.until > elapsed) });
    }
    setCups(next);
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

  // Склад «в работе» во всех чашках
  const inCups = useMemo(() => {
    const u: Partial<Record<StockId, number>> = {};
    for (const cup of cups.values())
      for (const c of contents(cup)) {
        const st = COMPONENTS[c].uses;
        if (st) u[st] = (u[st] ?? 0) + 1;
      }
    return u;
  }, [cups]);

  const brewingAt = (st: StationId) => [...cups.values()].flatMap((c) => c.brewing.filter((b) => COMPONENTS[b.c].station === st));
  const stationProgress = (st: StationId) => {
    const all = brewingAt(st);
    if (!all.length) return 0;
    const b = all.reduce((x, y) => (x.until < y.until ? x : y));
    return 1 - Math.max(0, b.until - elapsed) / b.total;
  };

  const needs = (i: number, c: ComponentId) => count(DRINKS[plan.guests[i].order].recipe, c) > count(contents(cupOf(i)), c);
  const complete = (i: number) => {
    const cup = cupOf(i);
    if (cup.brewing.length) return false;
    const r = DRINKS[plan.guests[i].order].recipe;
    return cup.items.length === r.length && r.every((c) => count(cup.items, c) === count(r, c));
  };

  function add(c: ComponentId) {
    if (finished.current) return;
    const comp = COMPONENTS[c];
    // Куда: в выбранную чашку, если ей это нужно, иначе — первому гостю у стойки, кому нужно
    const target = picked !== null && atCounter.some((q) => q.i === picked) && needs(picked, c) ? picked : atCounter.find((q) => needs(q.i, c))?.i;
    const st = comp.uses;
    const noStock = !!st && (inCups[st] ?? 0) + 1 > stock[st];
    const machineBusy = !!comp.brewMs && brewingAt(comp.station).length >= heads[comp.station];
    if (target === undefined || noStock || machineBusy) {
      tg.haptic('error');
      setBounce(c);
      window.setTimeout(() => setBounce(null), 350);
      return;
    }
    const cup = cupOf(target);
    const next = new Map(cups);
    if (comp.brewMs) {
      tg.haptic('select');
      next.set(target, { ...cup, brewing: [...cup.brewing, { c, until: elapsed + comp.brewMs, total: comp.brewMs }] });
    } else {
      tg.haptic('tap');
      next.set(target, { ...cup, items: [...cup.items, c] });
    }
    setCups(next);
  }

  function popup(text: string, good: boolean, seatIdx: number) {
    const id = Math.random();
    setPopups((p) => [...p, { id, text, good, seat: seatIdx }]);
    window.setTimeout(() => setPopups((p) => p.filter((x) => x.id !== id)), 1100);
  }

  function serve(i: number, seatIdx: number) {
    if (finished.current || !complete(i)) return;
    const g = plan.guests[i];
    const waitMs = Math.max(0, elapsed - g.arriveMs);
    // Склад тратится по рецепту заказа — так же считает сервер
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
    const nc = new Map(cups);
    nc.delete(i);
    setCups(nc);
    if (picked === i) setPicked(null);
    seat(face(i));
    if (enough) {
      tg.haptic('success');
      const s = streak + 1;
      setStreak(s);
      setCoins(coins + DRINKS[g.order].price);
      popup(`+${DRINKS[g.order].price} 🪙`, true, seatIdx);
    } else {
      tg.haptic('error');
      setStreak(0);
      popup('✗', false, seatIdx);
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

      {/* Стойка: три места; у каждого гостя тикет, кольцо терпения и своя чашка */}
      <div class="counter-seats">
        {Array.from({ length: SEATS }, (_, k) => {
          const q = atCounter[k];
          if (!q) return <div class="seat empty">{k === 0 && !waiting.length ? <span class="muted small">{upcoming ? t('nextGuest') : '…'}</span> : null}</div>;
          const { g, i } = q;
          const left = Math.max(0, 1 - (elapsed - g.arriveMs) / g.patienceMs);
          const reg = g.regular ? REGULARS[g.regular] : null;
          const cup = cupOf(i);
          const have = [...contents(cup)];
          const done = complete(i);
          const ring = left > 0.5 ? 'var(--ok)' : left > 0.25 ? 'var(--warn)' : 'var(--bad)';
          return (
            <div class={`seat ${done ? 'ready' : ''} ${picked === i ? 'picked' : ''} ${left < 0.25 ? 'angry' : ''}`} onClick={() => (done ? serve(i, k) : setPicked(picked === i ? null : i))}>
              {popups
                .filter((p) => p.seat === k)
                .map((p) => (
                  <div class={`popup ${p.good ? 'good' : 'bad'}`} key={p.id}>
                    {p.text}
                  </div>
                ))}
              <div class="guest-face" style={{ background: `conic-gradient(${ring} ${left * 360}deg, var(--line) 0)` }}>
                <span>{face(i)}</span>
              </div>
              {reg && <div class="guest-name">★ {L(reg.name)}</div>}
              <div class="ticket">
                <div class="ticket-name">{L(DRINKS[g.order].name)}</div>
                <div class="ticket-recipe">
                  {DRINKS[g.order].recipe.map((c) => {
                    const k2 = have.indexOf(c);
                    const ok = k2 >= 0;
                    if (ok) have.splice(k2, 1);
                    return <span class={`ri ${ok ? 'done' : ''}`}>{COMPONENTS[c].icon}</span>;
                  })}
                </div>
              </div>
              <div class="cup">
                {cup.items.map((c) => (
                  <span class="cup-item">{COMPONENTS[c].icon}</span>
                ))}
                {cup.brewing.map((b) => (
                  <span class="cup-item brewing" style={{ opacity: 0.3 + 0.7 * (1 - Math.max(0, b.until - elapsed) / b.total) }}>
                    {COMPONENTS[b.c].icon}
                  </span>
                ))}
              </div>
              {done ? <div class="seat-cta">{t('serve')} ✓</div> : picked === i ? <div class="seat-pin">📌</div> : null}
            </div>
          );
        })}
      </div>
      {waiting.length > SEATS && <div class="queue-more">{t('moreWaiting', { n: waiting.length - SEATS })}</div>}

      <div class="tables">
        {tables.map((tb, i) => (
          <button class={`table-spot ${tb.status}`} onClick={() => wipe(i)} disabled={tb.status !== 'dirty'} aria-label={t('tables')}>
            <span class="table-top">{tb.status === 'busy' ? tb.face : tb.status === 'dirty' ? '🍽️' : '🪑'}</span>
          </button>
        ))}
        <span class="tables-note small">{tables.some((tb) => tb.status === 'dirty') ? t('tablesWipe') : t('tables')}</span>
      </div>

      {/* Станции — в зоне большого пальца. Показываем только нужное для меню дня. */}
      <div class="stations">
        {STATION_ORDER.map((sid) => {
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
                  const avail = st ? stock[st] - (inCups[st] ?? 0) : Infinity;
                  const wanted = atCounter.some((q) => needs(q.i, c));
                  return (
                    <button
                      class={`station ${COMPONENTS[c].brewMs ? 'timed' : ''} ${wanted ? 'wanted' : ''} ${bounce === c ? 'bounce' : ''}`}
                      disabled={avail <= 0}
                      onClick={() => add(c)}
                    >
                      <span class="station-icon">{COMPONENTS[c].icon}</span>
                      <span class="station-name">{L(COMPONENTS[c].name)}</span>
                      {st && avail <= 5 && <span class="station-stock">{avail > 0 ? avail : t('outOf')}</span>}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
      <div class="shift-foot muted small">{t('shiftHint')}</div>
    </div>
  );
}
