// Гостевой зал кофейни: сцена слоями, как комнаты квартиры, и редактор для управляющего.
// Раскладка — по разбору с дизайнером интерьера: стена 300 см, ось композиции 56.4 %, столики в два ряда.
import { useState } from 'preact/hooks';
import { HALL_BY_ID, HALL_FLOORS, HALL_FLOOR_BY_ID, HALL_ITEMS, HALL_ORDER, HALL_SLOTS, HALL_WALLS, HALL_WALL_BY_ID, type HallSlot } from '../core/content';
import { slotEffects } from '../core/engine';
import { L, t } from '../i18n';
import { useGame } from './game';
import { ART_RATIO } from './artSizes';
import { FLOOR } from './art';
import { art } from './icons';
import { LogoView } from './logo';
import { WallLayer } from './wall';

/** Видимая стена зала — 300 см (выше потолок квартиры): свой масштаб. */
const HCM = FLOOR / 300;
const HCMW = HCM * 0.75;
const hAt = (cm: number) => FLOOR - cm * HCM;

type HPlace = { x: number; bottom: number | [number, number, number]; h?: [number, number, number]; wcm?: number; hang?: true; twin?: [number, number] };

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

export const HALL_ART: Record<HallSlot, HPlace> = {
  window1: { x: 33.8, bottom: hAt(85), wcm: 90, hang: true },
  window2: { x: 75.5, bottom: hAt(85), wcm: 90, hang: true },
  picture: { x: 56.4, bottom: hAt(125), h: [50, 60, 70], hang: true },
  sconces: { x: 56.4, bottom: hAt(158), h: [25, 30, 35], hang: true, twin: [47.4, 65.4] },
  chandelier: { x: 56.4, bottom: [hAt(255), hAt(240), hAt(225)], h: [45, 60, 75], hang: true },
  poster: { x: 91.5, bottom: hAt(175), h: [55, 55, 55], hang: true },
  shelf: { x: 91.5, bottom: hAt(125), h: [26, 40, 28], hang: true },
  plant: { x: 95.5, bottom: FLOOR + 2, h: [70, 85, 110] },
  table1: { x: 56.4, bottom: FLOOR + 2, h: [85, 88, 90] },
  table2: { x: 37.6, bottom: 98, h: [85, 88, 88] },
  table3: { x: 75.2, bottom: 98, h: [85, 88, 88] },
};

const tierOf = (id: string) => Number(id.split('-').pop()) || 0;
const pick = <T,>(v: T | [T, T, T], tier: number): T => (Array.isArray(v) ? v[tier] : v);

function box(slot: HallSlot, id: string) {
  const p = HALL_ART[slot];
  const it = HALL_BY_ID[id];
  const r = ratio(it.art);
  const tier = tierOf(id);
  if (p.wcm) return { w: p.wcm * HCMW, h: ((p.wcm * HCMW) / r) * (4 / 3) };
  const h = pick(p.h ?? [80, 80, 80], tier) * HCM;
  return { w: pick(p.h ?? [80, 80, 80], tier) * HCMW * r, h };
}

/** Порядок: стена → люстра → задний ряд → передний ряд. */
const LAYER_ORDER: HallSlot[] = ['window1', 'window2', 'picture', 'sconces', 'poster', 'shelf', 'chandelier', 'plant', 'table1', 'table2', 'table3'];

export function HallScene({ placed, wall, floor, name, onSlot, active }: { placed: Partial<Record<HallSlot, string>>; wall: string; floor: string; name: string; onSlot?: (s: HallSlot) => void; active?: HallSlot }) {
  const { state } = useGame();
  const w = HALL_WALL_BY_ID[wall] ?? HALL_WALLS[0];
  const fl = HALL_FLOOR_BY_ID[floor] ?? HALL_FLOORS[0];
  const lit = (slot: HallSlot) => !!placed[slot];
  return (
    <div class="scene scene-art scene-layers room-scene hall-scene" role="img" aria-label={t('hallTitle')}>
      <WallLayer w={w} />
      <Wainscot accent={w.accent ?? '#8a6a4f'} />
      {/* свет из окон — тёплые трапеции на полу */}
      {(['window1', 'window2'] as const).map((s) => (
        <div class={`layer window-light ${placed[s] === `${s}-2` ? 'stained' : ''}`} style={{ left: `${HALL_ART[s].x}%`, width: `${(HALL_ART[s].wcm ?? 90) * HCMW * 1.6}%`, top: `${FLOOR}%` }} />
      ))}
      <Door name={name} />
      <img class="layer room-floor" src={art(fl.id === 'hf-oak' || !ART_RATIO[`hall-floor-${fl.id}`] ? 'room-floor-hall' : `hall-floor-${fl.id}`)} style={fl.id === 'hf-oak' || ART_RATIO[`hall-floor-${fl.id}`] ? undefined : { filter: FLOOR_TINT[fl.id] }} alt="" draggable={false} />
      <div class="layer baseboard-shade" style={{ top: `${FLOOR - 1.2}%` }} />
      {lit('sconces') && HALL_ART.sconces.twin!.map((x) => <div class="layer sconce-wash" style={{ left: `${x}%`, bottom: `${100 - hAt(140)}%` }} />)}
      {LAYER_ORDER.map((slot) => {
        const p = HALL_ART[slot];
        const id = placed[slot];
        const tier = id ? tierOf(id) : 1;
        const bottom = pick(p.bottom, tier);
        if (!id) {
          if (!onSlot) return null;
          return <button class={`layer room-empty ${active === slot ? 'active' : ''}`} style={{ left: `${p.x}%`, transform: 'translateX(-50%)', bottom: `${100 - bottom}%`, height: `${p.hang ? 9 : 16}%`, width: `${p.hang ? 9 : 22}%` }} onClick={() => onSlot(slot)} aria-label={L(HALL_SLOTS[slot])} />;
        }
        const it = HALL_BY_ID[id];
        if (!it) return null;
        const b = box(slot, id);
        const xs = p.twin ?? [p.x];
        return (
          <>
            {slot === 'chandelier' && <div class="layer lamp-glow hall-glow" style={{ left: `${p.x}%`, width: `${b.h * 2.2}%`, bottom: `${100 - bottom - b.h * 0.6}%` }} />}
            {xs.map((x) => (
              <>
                {!p.hang && <div class="layer contact" style={{ left: `${x}%`, width: `${b.w * 0.85}%`, bottom: `${100 - bottom - 1}%` }} />}
                <img
                  class={`layer ${onSlot ? 'tappable' : ''} ${active === slot ? 'active' : ''}`}
                  src={art(sprite(it.art))}
                  style={{ left: `${x}%`, bottom: `${100 - bottom}%`, width: `${b.w}%`, transform: 'translateX(-50%)' }}
                  alt=""
                  draggable={false}
                  onClick={onSlot ? () => onSlot(slot) : undefined}
                />
              </>
            ))}
          </>
        );
      })}
      <div class="layer hall-sign" style={{ left: '1.5%', top: `${hAt(262)}%` }}>
        <LogoView logo={state.logo} size={18} />
        <span>{name}</span>
      </div>
      <div class="layer room-vignette" />
    </div>
  );
}

/** Пока нет картинок пола — перекраска паркета. */
const FLOOR_TINT: Record<string, string> = {
  'hf-tile': 'grayscale(1) contrast(1.4) brightness(1.05)',
  'hf-terrazzo': 'sepia(0.3) saturate(0.5) brightness(1.15)',
  'hf-herring': 'sepia(0.5) saturate(1.3) brightness(0.9)',
};

/** Панели до 100 см и карниз под потолком — главный признак заведения (разбор визуала). */
function Wainscot({ accent }: { accent: string }) {
  const top = (hAt(100) / 100) * 300;
  const fl = (FLOOR / 100) * 300;
  return (
    <svg class="layer-base" viewBox="0 0 400 300" preserveAspectRatio="none" aria-hidden="true">
      <rect x="0" y={top} width="400" height={fl - top} fill={accent} opacity="0.55" />
      {Array.from({ length: 16 }, (_, i) => (
        <rect x={i * 25 + 3} y={top + 6} width="19" height={fl - top - 12} rx="1.5" fill="none" stroke="#0000001f" stroke-width="1" />
      ))}
      <rect x="0" y={top - 2.5} width="400" height="3.5" fill="#00000026" />
      <rect x="0" y="0" width="400" height="5" fill="#00000014" />
    </svg>
  );
}

/** Входная дверь (пока рисуем вектором, спрайт hall-door заменит). */
function Door({ name }: { name: string }) {
  const w = 95 * HCMW;
  if (ART_RATIO['hall-door']) {
    return <img class="layer" src={art('hall-door')} style={{ left: '10.3%', bottom: `${100 - FLOOR}%`, width: `${w}%`, transform: 'translateX(-50%)' }} alt={name} draggable={false} />;
  }
  return (
    <svg class="layer" viewBox="0 0 95 220" style={{ left: '10.3%', bottom: `${100 - FLOOR}%`, width: `${w}%`, transform: 'translateX(-50%)' }} aria-hidden="true">
      <rect x="1" y="1" width="93" height="219" rx="3" fill="#7a5238" stroke="#3b2a20" stroke-width="2" />
      <rect x="8" y="8" width="79" height="204" rx="2" fill="#9a6a48" stroke="#3b2a20" stroke-width="1.5" />
      <rect x="16" y="16" width="63" height="88" rx="2" fill="#cfe6ee" stroke="#3b2a20" stroke-width="1.5" />
      <path d="M47.5 16 V104 M16 60 H79" stroke="#3b2a20" stroke-width="1.5" />
      <rect x="16" y="118" width="63" height="84" rx="2" fill="none" stroke="#3b2a20" stroke-width="1.5" />
      <circle cx="80" cy="122" r="3.5" fill="#d9b25a" stroke="#3b2a20" stroke-width="1" />
    </svg>
  );
}

/** Вкладка «Зал»: сцена + выбор предметов, обоев и пола (управляющий, из бюджета). */
export function HallTab() {
  const { state, me, send } = useGame();
  const [slot, setSlot] = useState<HallSlot | 'wall' | 'floor'>('table1');
  const hall = state.hall;
  const isManager = state.players.find((p) => p.id === me.id)?.role === 'manager';
  const eff = slotEffects(state);
  const items = slot === 'wall' || slot === 'floor' ? [] : HALL_ITEMS.filter((d) => d.slot === slot);
  return (
    <>
      <div class="card hero">
        <HallScene placed={hall.placed} wall={hall.wall} floor={hall.floor} name={state.name} onSlot={isManager ? setSlot : undefined} active={slot === 'wall' || slot === 'floor' ? undefined : slot} />
        <div class="hero-body">
          <div class="hero-title">🪑 {t('hallTitle')}</div>
          <div class="muted small">{t('cafeDecorEffect', { s: (eff.patienceMs / 1000).toFixed(1), p: Math.round(eff.satBonus * 100) })}</div>
          {!isManager && <div class="locked-note">🔒 {t('cafeDecorManager')}</div>}
        </div>
      </div>
      {isManager && (
        <div class="card">
          <div class="chips">
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
                  <div class="grow">
                    <div>{L(sf.name)}</div>
                    {sf.sat > 0 && <div class="muted small">{t('cafeDecorEffect', { s: '0.0', p: (sf.sat * 100).toFixed(1) })}</div>}
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
