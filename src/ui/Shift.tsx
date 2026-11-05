import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { cupDiff, cupUsage, expectedCup, nextStep, stepApplies, type Cup } from '../core/assembly';
import {
  BASES,
  BASE_ORDER,
  CONFIG,
  DAIRY_GRID,
  DESSERTS,
  DESSERT_ORDER,
  DRINKS,
  FLAVORS,
  FLAVOR_ORDER,
  MILKS,
  REGULARS,
  STEP_NAMES,
  STEP_NUM,
  STEP_ORDER,
  TEXTURES,
  TEXTURE_ORDER,
  TOPPINGS,
  TOPPING_ORDER,
  VESSELS,
  VESSEL_ORDER,
  dairyStock,
  type DairyPick,
  type DessertId,
  type StepId,
  type StockId,
} from '../core/content';
import { availableMilks, guestPrice, slotEffects } from '../core/engine';
import type { GuestResult, ShiftPlan, ShiftSegment } from '../core/types';
import { L, t } from '../i18n';
import { now as clockNow } from '../platform/clock';
import { tg } from '../platform/telegram';
import { CupView } from './cup';
import { CafeArt, DessertIcon, Img, MilkIcon } from './icons';
import { useGame } from './game';

// Смена: до трёх гостей у стойки (у них тикает терпение), остальные ждут в очереди без таймера.
// Напиток собирается по шагам 1–8, как в настоящей кофейне; конец сборки решает игрок кнопкой «Подать».
// Внизу две панели: «Напиток» (текущий шаг) и «Десерты» (витрина 4×4) — переключаются свайпом или стрелкой.

const GUEST_FACES = ['🧑', '👩', '👨‍🦱', '👩‍🦰', '🧔', '👱‍♀️', '🧑‍🎓', '👨‍💼'];
const SEG_ICON: Record<ShiftSegment['kind'], string> = { morning: '🌅', day: '☀️', lunch: '🍽', evening: '🌙' };

interface Popup {
  id: number;
  text: string;
  good: boolean;
}

interface Timer {
  step: StepId;
  until: number;
  total: number;
}

export function Shift({ plan, onDone }: { plan: ShiftPlan; onDone: (results: GuestResult[], cleanliness: number) => void }) {
  const { state } = useGame();
  const duration = plan.durationMs ?? CONFIG.shiftMaxMs;
  const segs = plan.segments ?? [];
  const startOffset = Math.max(0, clockNow() - plan.startedAt);
  const t0 = useRef(performance.now() - startOffset);
  const [elapsed, setElapsed] = useState(startOffset);
  const [results, setResults] = useState<Map<number, GuestResult>>(new Map());
  // Кто у стойки и с какого момента: терпение считается только у стойки
  const [counter, setCounter] = useState<{ i: number; since: number }[]>([]);
  const [selected, setSelected] = useState<number | null>(null);
  const [cup, setCup] = useState<Cup>({});
  const [step, setStep] = useState<StepId | null>('vessel');
  const [timer, setTimer] = useState<Timer | null>(null);
  const [tray, setTray] = useState<DessertId | null>(null);
  const [panel, setPanel] = useState<'drink' | 'dessert'>('drink');
  const [showRecipe, setShowRecipe] = useState(false);
  const [stock, setStock] = useState<Record<StockId, number>>({ ...state.stock });
  const [popups, setPopups] = useState<Popup[]>([]);
  const [streak, setStreak] = useState(0);
  const [coins, setCoins] = useState(0);
  const finished = useRef(false);
  const touch = useRef<number | null>(null);

  const fx = slotEffects(state);
  const milks = availableMilks(state);
  // Ристретто и лунго открываются рецептами; вкус — если он есть хоть в одном открытом напитке
  const menuBases = useMemo(() => new Set(state.menu.map((d) => DRINKS[d]?.recipe.base).filter(Boolean)), []);
  const menuFlavors = useMemo(() => new Set(state.menu.map((d) => DRINKS[d]?.recipe.flavor).filter(Boolean)), []);
  const baseOpen = (b: string) => b === 'espresso' || b === 'double' || menuBases.has(b as never);

  useEffect(() => {
    const id = window.setInterval(() => setElapsed(performance.now() - t0.current), 100);
    return () => window.clearInterval(id);
  }, []);

  // Таймер шага закончился — переходим дальше
  useEffect(() => {
    if (timer && timer.until <= elapsed) {
      setTimer(null);
      tg.haptic('tap');
    }
  }, [elapsed]);

  // Очередь и стойка
  const arrived = plan.guests.map((g, i) => ({ g, i })).filter(({ g, i }) => g.arriveMs <= elapsed && !results.has(i));
  const atCounter = new Set(counter.map((c) => c.i));
  const queue = arrived.filter(({ i }) => !atCounter.has(i));

  useEffect(() => {
    if (finished.current) return;
    const next = new Map(results);
    let changed = false;
    let ctr = counter.filter((c) => !next.has(c.i));
    // у стойки кончилось терпение
    for (const c of ctr) {
      if (elapsed - c.since >= plan.guests[c.i].patienceMs) {
        next.set(c.i, { i: c.i, outcome: 'left', waitMs: plan.guests[c.i].patienceMs });
        changed = true;
        setStreak(0);
        tg.haptic('error');
      }
    }
    ctr = ctr.filter((c) => !next.has(c.i));
    // свободное место у стойки — подходит первый из очереди
    for (const q of queue) {
      if (ctr.length >= CONFIG.counterSlots) break;
      if (next.has(q.i) || ctr.some((c) => c.i === q.i)) continue;
      ctr.push({ i: q.i, since: elapsed });
    }
    if (ctr.length !== counter.length || ctr.some((c, k) => c.i !== counter[k]?.i)) setCounter(ctr);
    if (selected === null || !ctr.some((c) => c.i === selected)) setSelected(ctr[0]?.i ?? null);
    // конец смены: все необслуженные уходят
    if (elapsed >= duration) {
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
      window.setTimeout(() => onDone([...next.values()], 1), 600);
    }
  }, [elapsed]);

  const face = (i: number) => {
    const g = plan.guests[i];
    return g.regular ? REGULARS[g.regular].avatar : GUEST_FACES[(plan.seed + i) % GUEST_FACES.length];
  };

  // Склад с учётом того, что уже в чашке и на подносе
  const inUse = cupUsage(cup);
  const left = (k: StockId) => (stock[k] ?? 0) - (inUse[k] ?? 0) - (tray && k === `ds_${tray}` ? 1 : 0);

  function popup(text: string, good: boolean) {
    const id = Math.random();
    setPopups((p) => [...p, { id, text, good }]);
    window.setTimeout(() => setPopups((p) => p.filter((x) => x.id !== id)), 1500);
  }

  /** Выбор на текущем шаге: записываем в чашку, запускаем таймер, переходим к следующему возможному шагу. */
  function choose(patch: Partial<Cup>, key: string, ms = 0) {
    if (finished.current || timer || !step) return;
    const nc = { ...cup, ...patch };
    // смена молока на сливки и обратно сбрасывает шаги 6а/6б
    if (patch.dairy) {
      delete nc.texture;
      delete nc.whip;
    }
    tg.haptic('select');
    setCup(nc);
    if (ms) setTimer({ step, until: elapsed + ms, total: ms });
    setStep(nextStep(nc, step));
    void key;
  }

  function skip() {
    if (!step || step === 'vessel' || step === 'base' || timer) return;
    tg.haptic('tap');
    setStep(nextStep(cup, step));
  }

  function pourOut() {
    if (timer) return;
    tg.haptic('tap');
    setCup({});
    setStep('vessel');
  }

  function goTo(s: StepId) {
    // назад к шагу можно, только если он уже пройден и сейчас возможен (исправить выбор)
    if (timer || !cup.vessel) return;
    if (STEP_ORDER.indexOf(s) >= STEP_ORDER.indexOf(step ?? 'topping') && step !== null) return;
    if (!stepApplies(s, cup)) return;
    if (s === 'vessel' || s === 'base') return; // посуду и кофе не переделать — только вылить
    setStep(s);
  }

  function serve() {
    if (finished.current || timer || !cup.base || selected === null) return;
    const i = selected;
    const g = plan.guests[i];
    const since = counter.find((c) => c.i === i)?.since ?? g.arriveMs;
    const waitMs = Math.max(0, elapsed - since);
    const diff = cupDiff(cup, expectedCup(g));
    const dessertOk = (g.dessert ?? null) === tray;
    const ok = diff.length === 0 && dessertOk;
    // со склада уходит то, что реально собрано
    const ns = { ...stock };
    for (const [k, n] of Object.entries(cupUsage(cup)) as [StockId, number][]) ns[k] = (ns[k] ?? 0) - n;
    if (tray) ns[`ds_${tray}`] = (ns[`ds_${tray}`] ?? 0) - 1;
    setStock(ns);
    const next = new Map(results);
    next.set(i, { i, outcome: ok ? 'served' : 'wrong', waitMs });
    setResults(next);
    setCounter(counter.filter((c) => c.i !== i));
    setSelected(null);
    setCup({});
    setStep('vessel');
    setTray(null);
    setPanel('drink');
    if (ok) {
      tg.haptic('success');
      setStreak(streak + 1);
      setCoins(coins + guestPrice(g));
      popup(`+${guestPrice(g)} 🪙`, true);
    } else {
      tg.haptic('error');
      setStreak(0);
      const parts = diff.map((s) => L(STEP_NAMES[s]).toLowerCase());
      if (!dessertOk) parts.push(t('dessertWord'));
      popup(t('notLikeThat', { what: parts.join(', ') }), false);
    }
  }

  function endEarly() {
    if (finished.current) return;
    finished.current = true;
    const next = new Map(results);
    plan.guests.forEach((g, i) => {
      if (!next.has(i)) next.set(i, { i, outcome: 'left', waitMs: g.patienceMs });
    });
    onDone([...next.values()], 1);
  }

  const timeLeft = Math.max(0, duration - elapsed);
  const servedCount = [...results.values()].filter((r) => r.outcome === 'served').length;
  const sel = selected !== null ? plan.guests[selected] : null;
  const canServe = !!cup.base && !timer && selected !== null;
  const progress = timer ? { step: timer.step, p: 1 - Math.max(0, timer.until - elapsed) / timer.total } : null;
  const steps = STEP_ORDER.filter((s) => s !== 'whip' || cup.dairy?.type === 'cream').filter((s) => s !== 'texture' || cup.dairy?.type !== 'cream');

  // ---------- панели шагов ----------

  function DrinkPanel() {
    if (!step) return <div class="step-done muted small">{t('stepsOver')}</div>;
    switch (step) {
      case 'vessel':
        return (
          <div class="opt-grid four">
            {VESSEL_ORDER.map((v) => {
              const out = v === 'paper' && left('cups') <= 0;
              return (
                <button class="opt" data-k={`vessel:${v}`} disabled={out} onClick={() => choose({ vessel: v }, v)}>
                  <Img name={`vessel-${v}`} size={40} />
                  <span>{L(VESSELS[v].name)}</span>
                  {v === 'paper' && <i class="opt-n">{out ? t('outOf') : left('cups')}</i>}
                </button>
              );
            })}
          </div>
        );
      case 'ice':
        return (
          <div class="opt-grid one">
            <button class="opt wide" data-k="ice:true" onClick={() => choose({ ice: true }, 'ice')}>
              <Img name="act-ice" size={44} />
              <span>{t('addIce')}</span>
            </button>
          </div>
        );
      case 'base':
        return (
          <div class="opt-grid four">
            {BASE_ORDER.map((b) => {
              const open = baseOpen(b);
              const beans = left('beans') >= BASES[b].beans;
              const ms = fx.shotMs * (b === 'double' && fx.machineHeads < 2 ? 2 : 1) * (b === 'lungo' ? 1.3 : b === 'ristretto' ? 0.8 : 1);
              return (
                <button class={`opt ${open ? '' : 'locked'}`} data-k={`base:${b}`} disabled={!open || !beans} onClick={() => choose({ base: b }, b, Math.round(ms))}>
                  <Img name={`base-${b}`} size={40} />
                  <span>{L(BASES[b].name)}</span>
                  <i class="opt-n">{open ? (beans ? t('sec', { n: (ms / 1000).toFixed(1) }) : t('outOf')) : '🔒'}</i>
                </button>
              );
            })}
          </div>
        );
      case 'flavor':
        return (
          <div class="opt-grid grid4">
            {FLAVOR_ORDER.map((f) => {
              const open = menuFlavors.has(f);
              const n = left(`syr_${f}`);
              return (
                <button class={`opt cell ${open ? '' : 'locked'}`} data-k={`flavor:${f}`} disabled={!open || n <= 0} onClick={() => choose({ flavor: f }, f)} aria-label={L(FLAVORS[f].name)}>
                  <Img name={`syr-${f}`} size={34} />
                  <span>{L(FLAVORS[f].name)}</span>
                  {!open ? <i class="opt-n">🔒</i> : n <= 5 && <i class="opt-n">{n > 0 ? n : t('outOf')}</i>}
                </button>
              );
            })}
          </div>
        );
      case 'dairy':
        return (
          <div class="opt-grid grid4 dairy-grid">
            {DAIRY_GRID.map((d: DairyPick, k) => {
              const open = milks.includes(d.kind);
              const n = left(dairyStock(d.kind, d.type));
              return (
                <button
                  class={`opt cell ${open ? '' : 'locked'} ${d.temp} ${k % 4 === 2 ? 'gap-left' : ''} ${k === 8 ? 'gap-top' : ''}`}
                  data-k={`dairy:${d.kind}-${d.type}-${d.temp}`}
                  disabled={!open || n <= 0}
                  onClick={() => choose({ dairy: d }, `${d.kind}${d.type}${d.temp}`)}
                  aria-label={`${d.type === 'milk' ? L(MILKS[d.kind].name) : L(MILKS[d.kind].cream)} · ${t(d.temp === 'hot' ? 'hot' : 'cold')}`}
                >
                  <MilkIcon kind={d.kind} type={d.type} size={30} />
                  <span>{L(MILKS[d.kind].short)}</span>
                  <i class="temp-dot">{d.temp === 'hot' ? '♨' : '❄'}</i>
                  {!open ? <i class="opt-n">🔒</i> : n <= 3 && <i class="opt-n">{n > 0 ? n : t('outOf')}</i>}
                </button>
              );
            })}
            <div class="dairy-legend small muted">
              <span>{t('milkLeft')}</span>
              <span>{t('creamRight')}</span>
            </div>
          </div>
        );
      case 'texture':
        return (
          <div class="opt-grid three">
            {TEXTURE_ORDER.map((x) => (
              <button class="opt" data-k={`texture:${x}`} onClick={() => choose({ texture: x }, x, fx.steamMs)}>
                <Img name={`tex-${x}`} size={40} />
                <span>{L(TEXTURES[x])}</span>
                <i class="opt-n">{t('sec', { n: (fx.steamMs / 1000).toFixed(1) })}</i>
              </button>
            ))}
          </div>
        );
      case 'whip':
        return (
          <div class="opt-grid one">
            <button class="opt wide" data-k="whip:true" onClick={() => choose({ whip: true }, 'whip', fx.whipMs)}>
              <Img name="act-whip" size={44} />
              <span>{t('whipDrink')}</span>
            </button>
          </div>
        );
      case 'water':
        return (
          <div class="opt-grid one">
            <button class="opt wide" data-k="water:true" onClick={() => choose({ water: true }, 'water', fx.waterMs)}>
              <Img name="act-water" size={44} />
              <span>{t('addWater')}</span>
              <i class="opt-n">{t('sec', { n: (fx.waterMs / 1000).toFixed(1) })}</i>
            </button>
          </div>
        );
      case 'topping':
        return (
          <div class="opt-grid four">
            {TOPPING_ORDER.map((x) => (
              <button class="opt" data-k={`topping:${x}`} onClick={() => choose({ topping: x }, x)}>
                <Img name={`top-${x}`} size={40} />
                <span>{L(TOPPINGS[x].name)}</span>
              </button>
            ))}
          </div>
        );
    }
  }

  function DessertPanel() {
    return (
      <div class="opt-grid grid4">
        {DESSERT_ORDER.map((d) => {
          const n = left(`ds_${d}`);
          const has = (stock[`ds_${d}`] ?? 0) > 0;
          return (
            <button class={`opt cell ${has ? '' : 'locked'} ${tray === d ? 'on' : ''}`} data-k={`ds:${d}`} disabled={!has || (n <= 0 && tray !== d)} onClick={() => setTray(tray === d ? null : d)}>
              <DessertIcon d={d} size={34} />
              <span>{L(DESSERTS[d].name)}</span>
              {has && <i class="opt-n">{n}</i>}
            </button>
          );
        })}
      </div>
    );
  }

  const recipeSteps = sel ? expectedCup(sel) : null;

  return (
    <div class="shift">
      <div class="shift-top">
        <div class={`shift-clock ${timeLeft < 15000 ? 'low' : ''}`}>{Math.ceil(timeLeft / 1000)}</div>
        {/* Прогресс-бар = расписание: пики тёплым цветом, затишья светлым, бегунок — сейчас */}
        <div class="wave-bar grow">
          {segs.map((g) => (
            <div class={`wave-seg ${g.density > 1 ? 'peak' : 'calm'}`} style={{ flex: g.share }}>
              <span>{SEG_ICON[g.kind]}</span>
            </div>
          ))}
          <div class="wave-runner" style={{ left: `${Math.min(100, (elapsed / duration) * 100)}%` }} />
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

      {/* Стойка: до трёх гостей с терпением; тап — выбрать, кому собираем */}
      <div class="counter-row">
        {counter.map((c) => {
          const g = plan.guests[c.i];
          const lft = Math.max(0, 1 - (elapsed - c.since) / g.patienceMs);
          const ring = lft > 0.5 ? 'var(--ok)' : lft > 0.25 ? 'var(--warn)' : 'var(--bad)';
          const dairy = DRINKS[g.order].recipe.dairy;
          return (
            <button class={`order-card ${selected === c.i ? 'on' : ''} ${lft < 0.25 ? 'angry' : ''}`} key={c.i} onClick={() => setSelected(c.i)} data-want={JSON.stringify({ ...expectedCup(g), ds: g.dessert ?? null })}>
              <div class="guest-face" style={{ background: `conic-gradient(${ring} ${lft * 360}deg, var(--line) 0)` }}>
                <span>{face(c.i)}</span>
              </div>
              {g.regular && <div class="guest-name small">★ {L(REGULARS[g.regular].name)}</div>}
              <div class="order-name">{L(DRINKS[g.order].name)}</div>
              <div class="order-extras">
                {dairy && g.milk !== 'regular' && (
                  <span class="order-milk">
                    <MilkIcon kind={g.milk} type={dairy.type} size={18} /> {L(MILKS[g.milk].short)}
                  </span>
                )}
                {g.dessert && (
                  <span class="order-dessert">
                    + <DessertIcon d={g.dessert} size={20} />
                  </span>
                )}
                <span class={`to-go ${g.takeaway ? 'away' : 'here'}`}>{g.takeaway ? '🥤' : '☕'}</span>
              </div>
            </button>
          );
        })}
        {!counter.length && <div class="order-card empty muted small">{queue.length || plan.guests.some((g, i) => g.arriveMs > elapsed && !results.has(i)) ? t('nextGuest') : '…'}</div>}
      </div>
      {queue.length > 0 && (
        <div class="queue-strip small">
          {t('inQueue')}: {queue.slice(0, 8).map((q) => face(q.i)).join(' ')}
          {queue.length > 8 && ` +${queue.length - 8}`}
        </div>
      )}

      {/* Зал кофейни с декором — фон между гостями и прилавком */}
      <div class="shift-scene">
        <CafeArt levels={state.levels} />
      </div>

      {/* Прилавок: чашка, шаги, «Пропустить» и «Подать» */}
      <div class={`counter-bar ${canServe ? 'ready' : ''}`}>
        {popups.map((p) => (
          <div class={`popup ${p.good ? 'good' : 'bad'}`} key={p.id}>
            {p.text}
          </div>
        ))}
        <div class="cup-zone">
          <CupView cup={cup} size={70} progress={progress} />
          {tray && (
            <button class="tray" onClick={() => setTray(null)} aria-label={t('removeDessert')}>
              <DessertIcon d={tray} size={34} />
            </button>
          )}
        </div>
        <div class="steps-col">
          <div class="step-dots">
            {steps.map((s) => {
              const done = s === 'vessel' ? !!cup.vessel : s === 'ice' ? !!cup.ice : s === 'base' ? !!cup.base : s === 'flavor' ? !!cup.flavor : s === 'dairy' ? !!cup.dairy : s === 'texture' ? !!cup.texture : s === 'whip' ? !!cup.whip : s === 'water' ? !!cup.water : !!cup.topping;
              const passed = step === null || STEP_ORDER.indexOf(s) < STEP_ORDER.indexOf(step);
              const na = !stepApplies(s, cup) && !!cup.vessel;
              return (
                <button class={`step-dot ${step === s ? 'now' : ''} ${done ? 'done' : passed ? 'skipped' : ''} ${na ? 'na' : ''}`} onClick={() => goTo(s)} title={L(STEP_NAMES[s])}>
                  {STEP_NUM[s]}
                </button>
              );
            })}
          </div>
          <div class="step-title">
            {step ? `${STEP_NUM[step]}. ${L(STEP_NAMES[step])}` : t('stepsOver')}
            {sel && (
              <button class="link small" onClick={() => setShowRecipe(!showRecipe)}>
                📖
              </button>
            )}
          </div>
          {showRecipe && recipeSteps && (
            <div class="recipe-peek small">
              {L(DRINKS[sel!.order].name)}: {recipeLine(recipeSteps)}
            </div>
          )}
          <div class="counter-actions">
            <button class="btn ghost small" disabled={!cup.vessel || !!timer} onClick={pourOut} aria-label={t('pour')}>
              🗑
            </button>
            <button class="btn ghost small" disabled={!step || step === 'vessel' || step === 'base' || !!timer} onClick={skip}>
              {t('skipStep')}
            </button>
            <button class="btn primary serve-btn" disabled={!canServe} onClick={serve}>
              {t('serve')}
            </button>
          </div>
        </div>
      </div>

      {/* Низ экрана: «Напиток» ↔ «Десерты» — свайп или стрелка */}
      <div
        class="bottom-panel"
        data-step={step ?? ''}
        data-busy={timer ? 1 : 0}
        onTouchStart={(e) => (touch.current = e.touches[0].clientX)}
        onTouchEnd={(e) => {
          if (touch.current === null) return;
          const dx = e.changedTouches[0].clientX - touch.current;
          touch.current = null;
          if (dx < -50) setPanel('dessert');
          if (dx > 50) setPanel('drink');
        }}
      >
        <div class="panel-tabs">
          <button class={`seg ${panel === 'drink' ? 'on' : ''}`} onClick={() => setPanel('drink')}>
            ☕ {t('panelDrink')}
          </button>
          <button class={`seg ${panel === 'dessert' ? 'on' : ''}`} onClick={() => setPanel('dessert')}>
            🍰 {t('panelDessert')}
            {sel?.dessert && !tray && <span class="badge">1</span>}
          </button>
          <button class="seg arrow" onClick={() => setPanel(panel === 'drink' ? 'dessert' : 'drink')} aria-label="→">
            {panel === 'drink' ? '→' : '←'}
          </button>
        </div>
        <div class={`panel-body ${timer ? 'busy' : ''}`}>{panel === 'drink' ? DrinkPanel() : DessertPanel()}</div>
      </div>
    </div>
  );
}

/** Рецепт строкой: подсказка для того, кто учится (по кнопке 📖). */
function recipeLine(c: Cup): string {
  const parts: string[] = [];
  if (c.vessel) parts.push(L(VESSELS[c.vessel].name));
  if (c.ice) parts.push(t('iceWord'));
  if (c.base) parts.push(L(BASES[c.base].name));
  if (c.flavor) parts.push(L(FLAVORS[c.flavor].name));
  if (c.dairy) parts.push(`${c.dairy.type === 'milk' ? L(MILKS[c.dairy.kind].name) : L(MILKS[c.dairy.kind].cream)} ${c.dairy.temp === 'hot' ? '♨' : '❄'}`);
  if (c.texture) parts.push(L(TEXTURES[c.texture]));
  if (c.whip) parts.push(t('whipDrink'));
  if (c.water) parts.push(t('addWater'));
  if (c.topping) parts.push(L(TOPPINGS[c.topping].name));
  return parts.join(' → ');
}
