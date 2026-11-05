// Квартира: фон комнаты из Nano Banana + мебель слоями (как сцена кофейни).
import { WALLPAPER_BY_ID, defaultWallpaper, type DecorSlot, type RoomKind } from '../core/content';
import { WallLayer } from './wall';
import { ART_RATIO } from './artSizes';
import { art } from './icons';

export function CatShape({ mood }: { mood: number }) {
  const happy = mood > 50;
  return (
    <g>
      <path d="M86 70 q34 -6 26 -40" stroke="#e39a4c" stroke-width="9" fill="none" stroke-linecap="round" class={happy ? 'tail' : ''} />
      <ellipse cx="60" cy="68" rx="34" ry="22" fill="#f0a95b" />
      <circle cx="34" cy="40" r="22" fill="#f0a95b" />
      <path d="M16 30 l2 -22 l14 14 z M52 30 l-2 -22 l-14 14 z" fill="#f0a95b" />
      <path d="M20 26 l1 -12 l8 8 z M48 26 l-1 -12 l-8 8 z" fill="#f6c9a0" />
      {happy ? (
        <path d="M24 40 q4 -4 8 0 M38 40 q4 -4 8 0" stroke="#2e2420" stroke-width="2.5" fill="none" stroke-linecap="round" />
      ) : (
        <g fill="#2e2420">
          <circle cx="28" cy="40" r="3" />
          <circle cx="42" cy="40" r="3" />
        </g>
      )}
      <path d={happy ? 'M31 48 q4 4 8 0' : 'M31 50 q4 -3 8 0'} stroke="#2e2420" stroke-width="2" fill="none" />
      <path d="M12 46 h-12 M12 50 h-10 M56 46 h12 M56 50 h10" stroke="#2e2420" stroke-width="1.2" />
    </g>
  );
}

export function CatPortrait({ mood }: { mood: number }) {
  return (
    <svg viewBox="-12 -2 140 100" class="cat-portrait" aria-hidden="true">
      <CatShape mood={mood} />
    </svg>
  );
}

// ---------- сцена комнаты ----------
// Стена — вектор (обои), пол с плинтусом — картинка, окно и кухонная тумба — отдельные спрайты.
// Мебель ставится в реальном масштабе (разбор с дизайнером интерьера): высота в см, ширина — из пропорций спрайта.
// Слои сортируются по глубине (bottom): что ближе к зрителю — рисуется позже.

/** Линия пола (верх плинтуса), % высоты сцены. */
export const FLOOR = 75.2;
/** Видимая стена от пола до верха кадра — 250 см (потолок 260 чуть за кадром). */
export const CM = FLOOR / 250;
/** 1 см по горизонтали в % ширины (сцена 4:3). */
const CMW = CM * 0.75;
/** Высота над полом (см) → % от верха сцены. */
export const atCm = (cm: number) => FLOOR - cm * CM;

/** h — реальная высота в см (одна на слот или по тирам 0/1/2); w — ширина в % (для штор и ковров). */
type Place = { x: number; bottom: number; h?: number | [number, number, number]; w?: number; hang?: true };
type RoomSpec = { slots: Partial<Record<DecorSlot, Place>>; window: { x: number; wcm: number; sill: number }; counter?: { x: number; w: number; bottom: number } };

export const ROOM_ART: Record<RoomKind, RoomSpec> = {
  // Растение · окно · диван (картина и полка над ним) · торшер; перед диваном столик и ковёр
  hall: {
    window: { x: 25, wcm: 120, sill: 85 },
    slots: {
      window: { x: 25, bottom: atCm(70), w: 38, hang: true },
      wall: { x: 52, bottom: atCm(110), h: [45, 45, 60], hang: true },
      shelf: { x: 73, bottom: atCm(115), h: [25, 60, 80], hang: true },
      rug: { x: 61, bottom: 99, w: 52 },
      plant: { x: 8, bottom: FLOOR + 3, h: [70, 60, 110] },
      lamp: { x: 91, bottom: FLOOR + 3, h: 165 },
      sofa: { x: 61, bottom: FLOOR + 5, h: 85 },
      table: { x: 61, bottom: 95, h: 45 },
    },
  },
  // Холодильник · окно (растение под ним) · плита вплотную к тумбе · тумба с кофеваркой; стол перед тумбой
  kitchen: {
    window: { x: 31, wcm: 100, sill: 105 },
    counter: { x: 77.6, w: 44.8, bottom: 85 },
    slots: {
      window: { x: 31, bottom: atCm(95), w: 30, hang: true },
      shelf: { x: 82, bottom: atCm(160), h: [25, 55, 75], hang: true },
      fridge: { x: 11, bottom: FLOOR + 4, h: 175 },
      plant: { x: 31, bottom: FLOOR + 4, h: [60, 55, 90] },
      stove: { x: 47.5, bottom: 85, h: 92 },
      coffeemaker: { x: 66, bottom: 59, h: 34 },
      dining: { x: 74, bottom: 98, h: 95 },
    },
  },
  // Стол (картина над ним) · торшер · кровать под окном · шкаф или комод в углу; растение впереди
  bedroom: {
    window: { x: 50, wcm: 120, sill: 105 },
    slots: {
      window: { x: 50, bottom: atCm(95), w: 38, hang: true },
      wall: { x: 14, bottom: atCm(120), h: [45, 45, 60], hang: true },
      desk: { x: 15, bottom: FLOOR + 3, h: [85, 95, 85] },
      lamp: { x: 31, bottom: FLOOR + 2, h: 160 },
      wardrobe: { x: 86, bottom: FLOOR + 3, h: 200 },
      rug: { x: 51, bottom: 99, w: 44 },
      bed: { x: 52, bottom: FLOOR + 6, h: 100 },
      plant: { x: 5, bottom: 98, h: [60, 55, 90] },
    },
  },
};

/** Предметы со своей высотой на общем месте (комод вместо шкафа). */
const ITEM_H: Record<string, number> = { 'dresser-0': 85, 'dresser-1': 90, 'dresser-2': 85 };

function heightCm(p: Place, id: string): number {
  if (ITEM_H[id]) return ITEM_H[id];
  if (Array.isArray(p.h)) return p.h[Number(id.split('-').pop()) || 0];
  return p.h ?? 80;
}

/** Размер предмета в % сцены. */
function boxOf(p: Place, id: string) {
  const ratio = ART_RATIO[`home-${id}`] ?? 1.3;
  if (p.w) return { w: p.w, h: (p.w / ratio) * (4 / 3) };
  const h = heightCm(p, id) * CM;
  return { w: heightCm(p, id) * CMW * ratio, h };
}

const LAMP_TOP = 0.08; // абажур — у самого верха спрайта

export function RoomScene({ kind = 'hall', placed, catMood, onSlot, locked, wallpaper }: { kind?: RoomKind; placed: Partial<Record<DecorSlot, string>>; catMood: number | null; onSlot?: (s: DecorSlot) => void; locked?: boolean; wallpaper?: string }) {
  const spec = ROOM_ART[kind];
  const wp = WALLPAPER_BY_ID[wallpaper ?? ''] ?? WALLPAPER_BY_ID[defaultWallpaper(kind)];
  const win = spec.window;
  const winW = win.wcm * CMW;
  // Слои: сначала висящее на стене, потом ковёр, потом напольное — от дальнего к ближнему
  const slots = (Object.keys(spec.slots) as DecorSlot[]).sort((a, b) => {
    const A = spec.slots[a]!;
    const B = spec.slots[b]!;
    const ka = A.hang ? 0 : a === 'rug' ? 1 : 2;
    const kb = B.hang ? 0 : b === 'rug' ? 1 : 2;
    return ka - kb || A.bottom - B.bottom;
  });
  return (
    <div class={`scene scene-art scene-layers room-scene ${locked ? 'scene-locked' : ''}`} role="img" aria-label={kind}>
      <WallLayer w={wp} />
      {kind === 'kitchen' && <KitchenTiles />}
      <img class="layer" src={art('room-window')} style={{ left: `${win.x}%`, width: `${winW}%`, bottom: `${100 - atCm(win.sill)}%`, transform: 'translateX(-50%)' }} alt="" draggable={false} />
      <img class="layer room-floor" src={art(`room-floor-${kind}`)} alt="" draggable={false} />
      <div class="layer baseboard-shade" style={{ top: `${FLOOR - 1.2}%` }} />
      {spec.counter && <div class="layer contact" style={{ left: `${spec.counter.x}%`, width: `${spec.counter.w * 0.95}%`, bottom: `${100 - spec.counter.bottom - 1}%` }} />}
      {spec.counter && <img class="layer" src={art('room-counter')} style={{ left: `${spec.counter.x}%`, width: `${spec.counter.w}%`, bottom: `${100 - spec.counter.bottom}%`, transform: 'translateX(-50%)' }} alt="" draggable={false} />}
      {slots.map((slot) => {
        const p = spec.slots[slot]!;
        const id = placed[slot];
        if (!id) {
          if (!onSlot) return null;
          const b = boxOf(p, `${slot}-1`);
          return <button class="layer room-empty" style={{ left: `${p.x}%`, transform: 'translateX(-50%)', bottom: `${100 - p.bottom}%`, height: `${Math.min(b.h, 45)}%`, width: `${Math.min(b.w, 45)}%` }} onClick={() => onSlot(slot)} aria-label={slot} />;
        }
        const b = boxOf(p, id);
        const style = { left: `${p.x}%`, bottom: `${100 - p.bottom}%`, width: `${b.w}%`, transform: 'translateX(-50%)' };
        return (
          <>
            {!p.hang && slot !== 'rug' && <div class="layer contact" style={{ left: `${p.x}%`, width: `${b.w * 0.88}%`, bottom: `${100 - p.bottom - 1}%` }} />}
            {slot === 'lamp' && <div class="layer lamp-glow" style={{ left: `${p.x}%`, width: `${b.h * 0.9}%`, bottom: `${100 - p.bottom + b.h * (1 - LAMP_TOP) - b.h * 0.45}%` }} />}
            <img class={`layer ${onSlot ? 'tappable' : ''}`} src={art(`home-${id}`)} style={style} alt="" draggable={false} onClick={onSlot ? () => onSlot(slot) : undefined} />
          </>
        );
      })}
      {catMood !== null && (
        <svg viewBox="-12 -2 140 100" class="layer room-cat" style={{ left: '30%', width: '12%', bottom: '4%' }} aria-hidden="true">
          <CatShape mood={catMood} />
        </svg>
      )}
      <div class="layer room-vignette" />
    </div>
  );
}

/** Кухонный фартук: белая плитка за тумбой и плитой (от 90 до 150 см). */
function KitchenTiles() {
  return (
    <svg class="layer-base" viewBox="0 0 400 300" preserveAspectRatio="none" aria-hidden="true">
      <defs>
        <pattern id="ktiles" width="12" height="12" patternUnits="userSpaceOnUse">
          <rect x="0.6" y="0.6" width="10.8" height="10.8" fill="#fbf8f2" stroke="#d6cfc2" stroke-width="1" />
        </pattern>
      </defs>
      <rect x="0" y={(atCm(150) / 100) * 300} width="400" height={((atCm(85) - atCm(150)) / 100) * 300} fill="url(#ktiles)" />
      <rect x="0" y={(atCm(150) / 100) * 300 - 1.5} width="400" height="3" fill="#c9bba5" />
      <rect x="0" y={(atCm(85) / 100) * 300} width="400" height="1.5" fill="#c9bba5" />
    </svg>
  );
}

export function DecorIcon({ id }: { id: string }) {
  return <img class="decor-icon" src={art(`home-${id}`)} alt="" draggable={false} />;
}
