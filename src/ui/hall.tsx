// Гостевой зал кофейни: сцена слоями, как комнаты квартиры, и редактор для управляющего.
// Раскладка — по разбору с дизайнером интерьера: стена 300 см, ось композиции 56.4 %, столики в два ряда.
import { useState } from 'preact/hooks';
import { HALL_BY_ID, HALL_FLOORS, HALL_FLOOR_BY_ID, HALL_ITEMS, HALL_ORDER, HALL_SLOTS, HALL_WALLS, HALL_WALL_BY_ID, type HallSlot } from '../core/content';
import { slotEffects } from '../core/engine';
import { L, t } from '../i18n';
import { useGame } from './game';
import { ART_RATIO } from './artSizes';
import { art } from './icons';
import { LogoView } from './logo';
import { Motif, SIZE, WallSwatch } from './wall';

// Зал в перспективе «три четверти», как на превью: задняя стена, две боковые, пол уходит к зрителю.
// Пол и боковые стены — CSS 3D (точная перспектива для узора), предметы — плоские спрайты,
// масштаб которых считается по той же формуле, что и перспектива пола.

/** Сцена 400×300 условных единиц (4:3). Задняя стена: x 40..360, y 0..132. Точка схода — над кадром. */
const WALL_B = 44; // % высоты — низ задней стены
const VP_Y = -12; // % высоты — точка схода
const WALL_W = 320; // ед.
const WALL_H = 132; // ед. = 300 см
const U_CM = WALL_H / 300; // ед. на см у задней стены
const SIDE_D = 224; // глубина пола и боковых стен, ед.
/** Во сколько раз крупнее предмет, стоящий на полу в точке y (% высоты), чем у задней стены. */
const depthK = (y: number) => (y - VP_Y) / (WALL_B - VP_Y);
/** На задней стене: высота в % стены и ширина в % стены для размера в см. */
const wallH = (cm: number) => (cm / 300) * 100;
const wallW = (cm: number) => ((cm * U_CM) / WALL_W) * 100;

type WallPlace = { x: number; cm: number | [number, number, number]; h?: [number, number, number]; wcm?: number; twin?: [number, number] };
type FloorPlace = { x: number; y: number; h: [number, number, number] };

/** Спрайты зала до генерации заменяем похожими из квартиры и старого декора. */
const FALLBACK: Record<string, string> = {
  'hall-window-0': 'room-window', 'hall-window-1': 'room-window', 'hall-window-2': 'room-window',
  'hall-table-0': 'home-dining-0', 'hall-table-1': 'home-dining-1', 'hall-table-2': 'home-dining-2',
  'hall-light-0': 'decor-lamp', 'hall-light-1': 'decor-lamp', 'hall-light-2': 'decor-lamp',
  'hall-sconce-0': 'decor-lamp', 'hall-sconce-1': 'decor-lamp', 'hall-sconce-2': 'decor-lamp',
  'hall-pic-0': 'decor-pic-cup', 'hall-pic-1': 'decor-pic-hills', 'hall-pic-2': 'home-wall-2',
  'hall-poster-0': 'home-wall-0', 'hall-poster-1': 'home-wall-1', 'hall-poster-2': 'home-wall-2',
  'hall-shelf-0': 'home-shelf-0', 'hall-shelf-1': 'home-shelf-1', 'hall-shelf-2': 'home-shelf-2',
  'hall-plant-0': 'home-plant-0', 'hall-plant-1': 'home-plant-1', 'hall-plant-2': 'home-plant-2',
};
const sprite = (name: string) => (ART_RATIO[name] ? name : FALLBACK[name] ?? name);
const ratio = (name: string) => ART_RATIO[sprite(name)] ?? 1;

/** Предметы на задней стене: x — % ширины стены, cm — высота нижнего края от пола. */
const WALL_ART: Partial<Record<HallSlot, WallPlace>> = {
  window1: { x: 27, cm: 80, wcm: 115 },
  window2: { x: 73, cm: 80, wcm: 115 },
  picture: { x: 50, cm: 115, h: [70, 80, 90] },
  sconces: { x: 50, cm: 140, h: [42, 46, 50], twin: [40, 60] },
  poster: { x: 91, cm: 165, h: [70, 70, 70] },
  shelf: { x: 91, cm: 115, h: [34, 50, 36] },
};
/** Предметы на полу: x, y — точка опоры в % сцены. */
const FLOOR_ART: Partial<Record<HallSlot, FloorPlace>> = {
  table1: { x: 28, y: 61, h: [85, 88, 90] },
  table3: { x: 72, y: 61, h: [85, 88, 88] },
  table2: { x: 50, y: 91, h: [85, 88, 88] },
  plant: { x: 91, y: 99, h: [70, 85, 110] },
};
const CHANDELIER = { x: 50, k: 1.3, h: [45, 60, 75] as [number, number, number] };

const tierOf = (id: string) => Number(id.split('-').pop()) || 0;
const pick = <T,>(v: T | [T, T, T], tier: number): T => (Array.isArray(v) ? v[tier] : v);

const WALL_ORDER: HallSlot[] = ['window1', 'window2', 'picture', 'sconces', 'poster', 'shelf'];
const FLOOR_ORDER = (Object.keys(FLOOR_ART) as HallSlot[]).sort((a, b) => FLOOR_ART[a]!.y - FLOOR_ART[b]!.y);

export function HallScene({ placed, wall, floor, name, onSlot, active }: { placed: Partial<Record<HallSlot, string>>; wall: string; floor: string; name: string; onSlot?: (s: HallSlot) => void; active?: HallSlot }) {
  const { state } = useGame();
  const w = HALL_WALL_BY_ID[wall] ?? HALL_WALLS[0];
  const fl = HALL_FLOOR_BY_ID[floor] ?? HALL_FLOORS[0];
  const cls = (slot: HallSlot) => `layer ${onSlot ? 'tappable' : ''} ${active === slot ? 'active' : ''}`;
  const tap = (slot: HallSlot) => (onSlot ? () => onSlot(slot) : undefined);
  const empty = (slot: HallSlot, style: Record<string, string>) =>
    onSlot ? <button class={`layer room-empty ${active === slot ? 'active' : ''}`} style={style} onClick={() => onSlot(slot)} aria-label={L(HALL_SLOTS[slot])} /> : null;
  const ch = placed.chandelier && HALL_BY_ID[placed.chandelier];
  return (
    <div class="scene scene-layers room-scene hall-scene hall3d-scene" role="img" aria-label={t('hallTitle')}>
      <div class="hall3d">
        <div class="h3-floor">
          <FloorSvg id={fl.id} rug />
        </div>
        <div class="h3-side h3-left">
          <WallSvg w={w} width={SIDE_D} side="left" />
        </div>
        <div class="h3-side h3-right">
          <WallSvg w={w} width={SIDE_D} side="right" />
        </div>
      </div>
      <div class="h3-back">
        <WallSvg w={w} width={WALL_W} />
        <Door name={name} />
        <div class="layer hall-sign" style={{ left: '1.5%', top: '6%' }}>
          <LogoView logo={state.logo} size={18} />
          <span>{name}</span>
        </div>
        {placed.sconces && <>{WALL_ART.sconces!.twin!.map((x) => <div class="layer sconce-wash" style={{ left: `${x}%`, bottom: `${wallH(110)}%` }} />)}</>}
        {WALL_ORDER.map((slot) => {
          const p = WALL_ART[slot]!;
          const id = placed[slot];
          const it = id ? HALL_BY_ID[id] : undefined;
          if (!it || !id) return empty(slot, { left: `${p.x}%`, transform: 'translateX(-50%)', bottom: `${wallH(pick(p.cm, 1))}%`, width: '11%', height: '26%' });
          const tier = tierOf(id);
          const width = p.wcm ? wallW(p.wcm) : wallW(pick(p.h ?? [60, 60, 60], tier) * ratio(it.art));
          return (
            <>
              {(p.twin ?? [p.x]).map((x) => (
                <img class={cls(slot)} src={art(sprite(it.art))} style={{ left: `${x}%`, bottom: `${wallH(pick(p.cm, tier))}%`, width: `${width}%`, transform: 'translateX(-50%)' }} alt="" draggable={false} onClick={tap(slot)} />
              ))}
            </>
          );
        })}
      </div>
      {FLOOR_ORDER.map((slot) => {
        const p = FLOOR_ART[slot]!;
        const k = depthK(p.y);
        const id = placed[slot];
        const it = id ? HALL_BY_ID[id] : undefined;
        if (!it || !id) return empty(slot, { left: `${p.x}%`, transform: 'translateX(-50%)', bottom: `${100 - p.y}%`, width: `${13 * k}%`, height: `${7 * k}%` });
        const hPct = pick(p.h, tierOf(id)) * U_CM * k / 3; // % высоты сцены (300 ед.)
        const wPct = hPct * 0.75 * ratio(it.art);
        return (
          <>
            <div class="layer contact" style={{ left: `${p.x}%`, width: `${wPct * 0.85}%`, bottom: `${100 - p.y - 1.2}%`, height: `${2.4 * k}%` }} />
            <img class={cls(slot)} src={art(sprite(it.art))} style={{ left: `${p.x}%`, bottom: `${100 - p.y}%`, width: `${wPct}%`, transform: 'translateX(-50%)' }} alt="" draggable={false} onClick={tap(slot)} />
          </>
        );
      })}
      {ch ? (
        <>
          <div class="layer lamp-glow hall-glow" style={{ left: `${CHANDELIER.x}%`, width: '34%', top: '2%' }} />
          <img
            class={cls('chandelier')}
            src={art(sprite(ch.art))}
            style={{ left: `${CHANDELIER.x}%`, top: 0, width: `${(pick(CHANDELIER.h, tierOf(placed.chandelier!)) * U_CM * CHANDELIER.k * ratio(ch.art)) / 4}%`, transform: 'translateX(-50%)' }}
            alt=""
            draggable={false}
            onClick={tap('chandelier')}
          />
        </>
      ) : (
        empty('chandelier', { left: `${CHANDELIER.x}%`, transform: 'translateX(-50%)', top: '1%', width: '10%', height: '10%' })
      )}
      <div class="layer room-vignette" />
    </div>
  );
}

/** Стена: узор обоев, панели до 100 см, плинтус. side — боковая стена (затемнена, угол у задней стены). */
function WallSvg({ w, width, side }: { w: (typeof HALL_WALLS)[number]; width: number; side?: 'left' | 'right' }) {
  const id = `hw${++uid}`;
  const size = SIZE[w.pattern] ?? 24;
  const panelTop = WALL_H - 100 * U_CM;
  const base = WALL_H - 8 * U_CM;
  const panel = w.pattern === 'panel' ? w.accent ?? w.ink : w.accent ?? '#c9a27e';
  const boards = Math.ceil(width / 11);
  const corner = side === 'left' ? width : 0;
  return (
    <svg class="layer-base" viewBox={`0 0 ${width} ${WALL_H}`} preserveAspectRatio="none" aria-hidden="true">
      <defs>
        <pattern id={id} width={size} height={size} patternUnits="userSpaceOnUse">
          <rect width={size} height={size} fill={w.base} />
          <g transform={`scale(${size / (w.pattern === 'tiles' ? 12 : 24)})`}>
            <Motif w={w} />
          </g>
        </pattern>
      </defs>
      <rect width={width} height={WALL_H} fill={w.pattern === 'panel' ? w.base : `url(#${id})`} />
      <rect x="0" y={panelTop} width={width} height={base - panelTop} fill={panel} opacity={w.pattern === 'panel' ? 1 : 0.6} />
      {Array.from({ length: boards }, (_, i) => (
        <line x1={i * 11 + 5.5} x2={i * 11 + 5.5} y1={panelTop + 3} y2={base} stroke="#5b3b2b" stroke-opacity="0.22" stroke-width="0.9" />
      ))}
      <rect x="-1" y={panelTop - 2.5} width={width + 2} height="3.5" fill={w.pattern === 'panel' ? w.ink : '#c98f5e'} stroke="#5b3b2b" stroke-width="0.7" />
      <rect x="-1" y={base} width={width + 2} height={WALL_H - base + 1} fill="#c98f5e" stroke="#5b3b2b" stroke-width="0.8" />
      <rect width={width} height="10" fill="#5a3a24" opacity="0.08" />
      {side && <rect width={width} height={WALL_H} fill="#5a3a24" opacity="0.13" />}
      {side && <line x1={corner} x2={corner} y1="0" y2={WALL_H} stroke="#5b3b2b" stroke-width="1.6" />}
    </svg>
  );
}
let uid = 0;

/** Пол сверху (перспективу даёт CSS 3D). Узоры рисуются вектором в стиле игры: тёплые тона, коричневая обводка. */
export function FloorSvg({ id, rug, swatch }: { id: string; rug?: boolean; swatch?: boolean }) {
  const pid = `hf${++uid}`;
  const W = swatch ? 120 : WALL_W;
  const H = swatch ? 60 : SIDE_D;
  return (
    <svg class={swatch ? 'floor-swatch' : 'layer-base'} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden="true">
      <defs>
        <FloorPattern id={id} pid={pid} />
      </defs>
      <rect width={W} height={H} fill={`url(#${pid})`} />
      {rug && (
        <g>
          <ellipse cx={W / 2} cy={H * 0.74} rx={W * 0.27} ry={H * 0.15} fill="#a9c99a" stroke="#5b3b2b" stroke-width="1.6" />
          <ellipse cx={W / 2} cy={H * 0.74} rx={W * 0.27 - 7} ry={H * 0.15 - 5} fill="none" stroke="#7fa874" stroke-width="1.6" />
        </g>
      )}
      {!swatch && <rect width={W} height="14" fill="#5a3a24" opacity="0.1" />}
    </svg>
  );
}

const LINE = '#5b3b2b';
function FloorPattern({ id, pid }: { id: string; pid: string }) {
  switch (id) {
    case 'hf-herring':
      // ёлочка: дощечки 4×16 под 45°, как на превью
      return (
        <pattern id={pid} width="24" height="24" patternUnits="userSpaceOnUse" patternTransform="rotate(45) scale(1.35)">
          <rect width="24" height="24" fill="#f2c27e" />
          <rect x="0" y="0" width="12" height="6" fill="#efbb74" stroke={LINE} stroke-opacity="0.45" stroke-width="0.8" />
          <rect x="12" y="0" width="6" height="12" fill="#f5ca8a" stroke={LINE} stroke-opacity="0.45" stroke-width="0.8" />
          <rect x="18" y="0" width="6" height="12" fill="#efbb74" stroke={LINE} stroke-opacity="0.45" stroke-width="0.8" />
          <rect x="0" y="6" width="12" height="6" fill="#f5ca8a" stroke={LINE} stroke-opacity="0.45" stroke-width="0.8" />
          <rect x="0" y="12" width="6" height="12" fill="#efbb74" stroke={LINE} stroke-opacity="0.45" stroke-width="0.8" />
          <rect x="6" y="12" width="6" height="12" fill="#f5ca8a" stroke={LINE} stroke-opacity="0.45" stroke-width="0.8" />
          <rect x="12" y="12" width="12" height="6" fill="#efbb74" stroke={LINE} stroke-opacity="0.45" stroke-width="0.8" />
          <rect x="12" y="18" width="12" height="6" fill="#f5ca8a" stroke={LINE} stroke-opacity="0.45" stroke-width="0.8" />
        </pattern>
      );
    case 'hf-tile':
      return (
        <pattern id={pid} width="28" height="28" patternUnits="userSpaceOnUse">
          <rect width="28" height="28" fill="#fbf1e0" />
          <rect width="14" height="14" fill="#8a6450" />
          <rect x="14" y="14" width="14" height="14" fill="#8a6450" />
          <path d="M0 0H28V28" fill="none" stroke={LINE} stroke-opacity="0.35" stroke-width="0.8" />
        </pattern>
      );
    case 'hf-terrazzo':
      return (
        <pattern id={pid} width="40" height="40" patternUnits="userSpaceOnUse">
          <rect width="40" height="40" fill="#f4e7d6" />
          {[[5, 7, '#f3a6a0'], [18, 4, '#9cc59a'], [30, 12, '#f6d27a'], [10, 22, '#b9a6e3'], [24, 27, '#f3a6a0'], [35, 33, '#9cc59a'], [4, 35, '#c9a27e'], [17, 15, '#c9a27e'], [29, 22, '#b9a6e3']].map(([x, y, c], i) => (
            <path d={`M${x} ${y} l${2 + (i % 3)} -1 l1 ${2 + (i % 2)} l-${3 + (i % 2)} 1 z`} fill={c as string} opacity="0.75" />
          ))}
        </pattern>
      );
    default:
      // дубовые доски вдоль взгляда, со сдвигом стыков
      return (
        <pattern id={pid} width="30" height="60" patternUnits="userSpaceOnUse">
          <rect width="30" height="60" fill="#e9b97c" />
          <rect x="10" width="10" height="60" fill="#e2b072" />
          <path d="M0 0V60M10 0V60M20 0V60M0 22H10M10 48H20M20 8H30" fill="none" stroke={LINE} stroke-opacity="0.42" stroke-width="0.8" />
        </pattern>
      );
  }
}

/** Входная дверь на задней стене слева. */
function Door({ name }: { name: string }) {
  return <img class="layer" src={art('hall-door')} style={{ left: '7%', bottom: 0, width: `${wallW(95)}%`, transform: 'translateX(-50%)' }} alt={name} draggable={false} />;
}

/** Вкладка «Зал»: сцена + выбор предметов, обоев и пола (управляющий, из бюджета). */
export function HallTab() {
  const { state, me, send } = useGame();
  const [slot, setSlot] = useState<HallSlot | 'wall' | 'floor'>('table1');
  const hall = state.hall;
  // зал обставляет любой сотрудник (Гриша, 16.11); деньги — из бюджета кофейни
  const canEdit = !!state.players.find((p) => p.id === me.id && !p.isNpc);
  const eff = slotEffects(state);
  const items = slot === 'wall' || slot === 'floor' ? [] : HALL_ITEMS.filter((d) => d.slot === slot);
  return (
    <>
      <div class="card hero">
        <HallScene placed={hall.placed} wall={hall.wall} floor={hall.floor} name={state.name} onSlot={canEdit ? setSlot : undefined} active={slot === 'wall' || slot === 'floor' ? undefined : slot} />
        <div class="hero-body">
          <div class="hero-title">🪑 {t('hallTitle')}</div>
          <div class="muted small">{t('cafeDecorEffect', { s: (eff.patienceMs / 1000).toFixed(1), p: Math.round(eff.satBonus * 100) })}</div>
          {canEdit && <div class="muted small">{t('hallFromBudget')}</div>}
        </div>
      </div>
      {canEdit && (
        <div class="card">
          <div class="muted small">{t('hallTapHint')}</div>
          <div class="chips hall-slots">
            {HALL_ORDER.map((sl) => (
              <button class={`chip ${slot === sl ? 'on' : ''}`} onClick={() => setSlot(sl)}>
                {L(HALL_SLOTS[sl])}
              </button>
            ))}
            <button class={`chip ${slot === 'wall' ? 'on' : ''}`} onClick={() => setSlot('wall')}>
              🖌 {t('hallWalls')}
            </button>
            <button class={`chip ${slot === 'floor' ? 'on' : ''}`} onClick={() => setSlot('floor')}>
              🟫 {t('hallFloor')}
            </button>
          </div>
          {items.map((d) => {
            const owned = hall.owned.includes(d.id);
            const on = hall.placed[d.slot] === d.id;
            return (
              <div class="list-row">
                <img class="decor-icon" src={art(sprite(d.art))} alt="" draggable={false} />
                <div class="grow">
                  <div>{L(d.name)}</div>
                  <div class="muted small">{t('cafeDecorEffect', { s: (d.patienceMs / 1000).toFixed(1), p: (d.sat * 100).toFixed(1) })}</div>
                </div>
                {on ? (
                  d.slot !== 'window1' && d.slot !== 'window2' ? (
                    <button class="btn small ghost" onClick={() => send({ type: 'placeHall', slot: d.slot, id: null })}>
                      {t('remove')}
                    </button>
                  ) : (
                    <span class="muted small">✓</span>
                  )
                ) : owned ? (
                  <button class="btn small" onClick={() => send({ type: 'placeHall', slot: d.slot, id: d.id })}>
                    {t('place')}
                  </button>
                ) : (
                  <button class="btn small" disabled={state.money < d.cost} onClick={() => send({ type: 'buyHall', id: d.id })}>
                    🪙 {d.cost}
                  </button>
                )}
              </div>
            );
          })}
          {(slot === 'wall' || slot === 'floor') &&
            (slot === 'wall' ? HALL_WALLS : HALL_FLOORS).map((sf) => {
              const have = (slot === 'wall' ? hall.walls : hall.floors).includes(sf.id);
              const on = (slot === 'wall' ? hall.wall : hall.floor) === sf.id;
              return (
                <div class="list-row">
                  {slot === 'wall' ? (
                    <WallSwatch w={sf as (typeof HALL_WALLS)[number]} />
                  ) : (
                    <FloorSvg id={sf.id} swatch />
                  )}
                  <div class="grow">
                    <div>{L(sf.name)}</div>
                    {sf.sat > 0 && <div class="muted small">{t('satOnly', { p: (sf.sat * 100).toFixed(1) })}</div>}
                  </div>
                  {on ? (
                    <span class="muted small">✓</span>
                  ) : (
                    <button class="btn small" disabled={!have && state.money < sf.cost} onClick={() => send({ type: slot === 'wall' ? 'setHallWall' : 'setHallFloor', id: sf.id })}>
                      {have ? t('place') : `🪙 ${sf.cost}`}
                    </button>
                  )}
                </div>
              );
            })}
        </div>
      )}
    </>
  );
}
