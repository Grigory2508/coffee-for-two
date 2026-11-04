import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { COMPONENTS, COMPONENT_ORDER, CONFIG, DRINKS, REGULARS, STATIONS, type ComponentId, type StationId, type StockId } from '../core/content';
import { recipeUsage, slotEffects } from '../core/engine';
import type { GuestResult, ShiftPlan } from '../core/types';
import { L, t } from '../i18n';
import { now as clockNow } from '../platform/clock';
import { tg } from '../platform/telegram';
import { CupSection } from './cup';
import { CafeArt, CompIcon } from './icons';
import { useGame } from './game';

// Смена: 75 секунд, только тапы. У стойки один гость, за ним видна очередь из 2–3 человек с их заказами;
// следующий подходит, когда этого обслужили (или он ушёл). Столиков и уборки нет — всё внимание сборке. Сначала ставишь посуду — чашку (здесь) или стакан (с собой), потом ингредиенты.
// Ненужный ингредиент отскакивает. Эспрессо и пенка готовятся с таймером. «Подать» всегда на одном месте.

const GUEST_FACES = ['🧑', '👩', '👨‍🦱', '👩‍🦰', '🧔', '👱‍♀️', '🧑‍🎓', '👨‍💼'];
const NEXT_GAP_MS = 700;
const QUEUE_SHOWN = 3;
// Станции снизу вверх по частоте: эспрессо почти в каждом напитке — ближе всего к большому пальцу
const STATION_STACK: StationId[] = ['extras', 'milk', 'machine'];

interface Popup {
  id: number;
  text: string;
  good: boolean;
}

type Vessel = 'mug' | 'paper';

interface Cup {
  vessel: Vessel | null;
  items: ComponentId[];
  brewing: { c: ComponentId; until: number; total: number }[];
}

const EMPTY: Cup = { vessel: null, items: [], brewing: [] };
const count = (list: ComponentId[], c: ComponentId) => list.reduce((n, x) => n + (x === c ? 1 : 0), 0);

export function Shift({ plan, onDone }: { plan: ShiftPlan; onDone: (results: GuestResult[], cleanliness: number) => void }) {
  const { state } = useGame();
  const startOffset = Math.max(0, clockNow() - plan.startedAt);
  const t0 = useRef(performance.now() - startOffset);
  const [elapsed, setElapsed] = useState(startOffset);
  const [results, setResults] = useState<Map<number, GuestResult>>(new Map());
  const [cup, setCup] = useState<Cup>(EMPTY);
  // Кто у стойки и с какого момента (терпение считается от подхода к стойке)
  const [current, setCurrent] = useState<{ i: number; since: number } | null>(null);
  const [nextAt, setNextAt] = useState(0);
  const [stock, setStock] = useState<Record<StockId, number>>({ ...state.stock });
  const [popups, setPopups] = useState<Popup[]>([]);
  const [bounce, setBounce] = useState<string | null>(null);
  const [streak, setStreak] = useState(0);
  const [coins, setCoins] = useState(0);
  const finished = useRef(false);
  const cleanliness = () => 1;

  const fx = slotEffects(state);
  const heads: Record<StationId, number> = { machine: fx.machineHeads, milk: 1, extras: 99 };
  // профессиональная машина варит эспрессо быстрее
  const brewMs = (c: ComponentId) => Math.round((COMPONENTS[c].brewMs ?? 0) / (c === 'shot' ? fx.shotSpeed : 1));

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

  // Очередь: кто пришёл и ещё не обслужен; к стойке подходит первый, когда она свободна
  const waiting = useMemo(
    () => plan.guests.map((g, i) => ({ g, i })).filter(({ g, i }) => g.arriveMs <= elapsed && !results.has(i)),
    [elapsed, results],
  );

  useEffect(() => {
    if (finished.current) return;
    const next = new Map(results);
    let changed = false;
    // гость у стойки не дождался
    if (current && elapsed - current.since >= plan.guests[current.i].patienceMs) {
      next.set(current.i, { i: current.i, outcome: 'left', waitMs: plan.guests[current.i].patienceMs });
      changed = true;
      setCurrent(null);
      setCup(EMPTY);
      setNextAt(elapsed + NEXT_GAP_MS);
      setStreak(0);
      tg.haptic('error');
    } else if (!current && elapsed >= nextAt && waiting.length) {
      setCurrent({ i: waiting[0].i, since: elapsed });
    }
    // конец смены: все, кто не обслужен, уходят
    if (elapsed >= CONFIG.shiftDurationMs) {
      plan.guests.forEach((g, i) => {
        if (!next.has(i)) {
          next.set(i, { i, outcome: 'left', waitMs: g.patienceMs });
          changed = true;
        }
      });
    }
    if (changed) setResults(next);
    if (next.size === plan.guests.length) {
      finished.current = true;
      window.setTimeout(() => onDone([...next.values()], cleanliness()), 600);
    }
  }, [elapsed]);

  const queue = waiting.filter((q) => q.i !== current?.i);
  const upcoming = plan.guests.some((g, i) => g.arriveMs > elapsed && !results.has(i));
  const face = (i: number) => {
    const g = plan.guests[i];
    return g.regular ? REGULARS[g.regular].avatar : GUEST_FACES[(plan.seed + i) % GUEST_FACES.length];
  };

  const target = current?.i ?? null;
  const guest = target !== null ? plan.guests[target] : null;
  const recipe = guest ? DRINKS[guest.order].recipe : [];
  const wantVessel: Vessel | null = guest ? (guest.takeaway ? 'paper' : 'mug') : null;
  const inCup = [...cup.items, ...cup.brewing.map((b) => b.c)];
  const needs = (c: ComponentId) => count(recipe, c) > count(inCup, c);
  const complete = target !== null && !!cup.vessel && !cup.brewing.length && cup.items.length === recipe.length && recipe.every((c) => count(cup.items, c) === count(recipe, c));

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

  function setVessel(v: Vessel) {
    if (finished.current || cup.vessel) return;
    if (v === 'paper' && stock.cups <= 0) {
      shake('cups');
      return;
    }
    tg.haptic('select');
    setCup({ ...cup, vessel: v });
  }

  function add(c: ComponentId) {
    if (finished.current) return;
    const comp = COMPONENTS[c];
    const st = comp.uses;
    const usedStock = st ? inCup.filter((x) => COMPONENTS[x].uses === st).length : 0;
    if (target !== null && !cup.vessel) {
      shake('vessel');
      popup(t('pickCup'), false);
      return;
    }
    if (target === null || !needs(c) || (st && usedStock + 1 > stock[st]) || (comp.brewMs && brewingAt(comp.station).length >= heads[comp.station])) {
      shake(c);
      return;
    }
    if (comp.brewMs) {
      tg.haptic('select');
      setCup({ ...cup, brewing: [...cup.brewing, { c, until: elapsed + brewMs(c), total: brewMs(c) }] });
    } else {
      tg.haptic('tap');
      setCup({ ...cup, items: [...cup.items, c] });
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
    if (cup.vessel !== wantVessel) {
      shake('cup');
      popup(g.takeaway ? t('wrongCupAway') : t('wrongCupHere'), false);
      return;
    }
    const waitMs = Math.max(0, elapsed - (current?.since ?? g.arriveMs));
    const use = { ...recipeUsage(g.order) };
    if (g.takeaway) use.cups = 1;
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
    setCurrent(null);
    setNextAt(elapsed + NEXT_GAP_MS);
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
    if (cup.brewing.length || !cup.vessel) return;
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

      {/* У стойки один гость; остальные ждут в очереди */}
      <div class="counter-guest">
        {guest && target !== null ? (
          (() => {
            const left = Math.max(0, 1 - (elapsed - current!.since) / guest.patienceMs);
            const reg = guest.regular ? REGULARS[guest.regular] : null;
            const ring = left > 0.5 ? 'var(--ok)' : left > 0.25 ? 'var(--warn)' : 'var(--bad)';
            const have = [...inCup];
            return (
              <div class={`guest-card ${left < 0.25 ? 'angry' : ''}`} key={target}>
                <div class="guest-face big" style={{ background: `conic-gradient(${ring} ${left * 360}deg, var(--line) 0)` }}>
                  <span>{face(target)}</span>
                </div>
                <div class="guest-order">
                  {reg && <div class="guest-name">★ {L(reg.name)}</div>}
                  <div class="ticket-name">{L(DRINKS[guest.order].name)}</div>
                  <div class="ticket-recipe">
                    {recipe.map((c) => {
                      const k = have.indexOf(c);
                      if (k >= 0) have.splice(k, 1);
                      return <span class={`ri ${k >= 0 ? 'done' : ''}`}><CompIcon c={c} size={30} /></span>;
                    })}
                  </div>
                  <span class={`to-go ${guest.takeaway ? 'away' : 'here'}`}>{guest.takeaway ? t('takeaway') : t('dineIn')}</span>
                </div>
              </div>
            );
          })()
        ) : (
          <div class="guest-card empty muted small">{upcoming || queue.length ? t('nextGuest') : '…'}</div>
        )}
        {queue.length > 0 && (
          <div class="queue-cards">
            {queue.slice(0, QUEUE_SHOWN).map((q) => {
              const g = plan.guests[q.i];
              return (
                <div class="queue-card">
                  <span class="queue-face">{face(q.i)}</span>
                  <span class="queue-drink">{L(DRINKS[g.order].name)}</span>
                  <span class={`queue-go ${g.takeaway ? 'away' : ''}`}>{g.takeaway ? '🥡' : '☕'}</span>
                </div>
              );
            })}
            {queue.length > QUEUE_SHOWN && <div class="queue-more">+{queue.length - QUEUE_SHOWN}</div>}
          </div>
        )}
      </div>

      {/* Зал кофейни с декором — фон между гостем и прилавком (столиков и уборки больше нет) */}
      <div class="shift-scene">
        <CafeArt levels={state.levels} decor={state.cafeDecor?.placed} />
      </div>

      {/* Прилавок: посуда, чашка в разрезе, «Вылить» и «Подать» всегда здесь */}
      <div class={`counter-bar ${complete && cup.vessel === wantVessel ? 'ready' : ''}`}>
        {popups.map((p) => (
          <div class={`popup ${p.good ? 'good' : 'bad'}`} key={p.id}>
            {p.text}
          </div>
        ))}
        {cup.vessel ? (
          <div class={`counter-cup ${bounce === 'cup' ? 'bounce' : ''}`}>
            <CupSection
              recipe={recipe}
              have={cup.items}
              brewing={cup.brewing.map((b) => ({ c: b.c, p: 1 - Math.max(0, b.until - elapsed) / b.total }))}
              size={70}
              glow={complete && cup.vessel === wantVessel}
              vessel={cup.vessel}
            />
          </div>
        ) : (
          <div class={`vessel-pick ${bounce === 'vessel' ? 'bounce' : ''}`}>
            <button class="vessel" disabled={target === null} onClick={() => setVessel('mug')}>
              <CupSection recipe={[]} size={34} />
              <span>{t('mug')}</span>
            </button>
            <button class={`vessel ${bounce === 'cups' ? 'bounce' : ''}`} disabled={target === null || stock.cups <= 0} onClick={() => setVessel('paper')}>
              <CupSection recipe={[]} size={34} vessel="paper" />
              <span>{stock.cups > 0 ? `${t('paperCup')} · ${stock.cups}` : t('noCups')}</span>
            </button>
          </div>
        )}
        <div class="counter-actions">
          <button class="btn ghost pour-btn" disabled={!cup.vessel || cup.brewing.length > 0} onClick={pourOut} aria-label={t('pour')}>
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
                      <span class="station-icon"><CompIcon c={c} size={34} /></span>
                      <span class="station-name">{L(COMPONENTS[c].name)}</span>
                      {COMPONENTS[c].brewMs && <span class="station-time">{t('sec', { n: (brewMs(c) / 1000).toFixed(1) })}</span>}
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
