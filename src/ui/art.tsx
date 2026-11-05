// Квартира: фон комнаты из Nano Banana + мебель слоями (как сцена кофейни).
import type { DecorSlot, RoomKind } from '../core/content';
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

/** Место предмета на фоне комнаты, % от картинки: x — центр, w — ширина, bottom — опора снизу, h — высота рамки пустого места. */
type Place = { x: number; w: number; bottom: number; h: number };

/** Порядок слоёв: сначала стена, потом пол, впереди — то, что ближе к зрителю. */
const ROOM_ART: Record<RoomKind, Partial<Record<DecorSlot, Place>>> = {
  hall: {
    window: { x: 27.5, w: 40, bottom: 55, h: 44 },
    wall: { x: 64, w: 12, bottom: 47, h: 18 },
    shelf: { x: 86, w: 20, bottom: 38, h: 14 },
    rug: { x: 55, w: 50, bottom: 99, h: 18 },
    plant: { x: 7, w: 12, bottom: 88, h: 24 },
    sofa: { x: 60, w: 40, bottom: 86, h: 22 },
    lamp: { x: 89, w: 12, bottom: 88, h: 40 },
    table: { x: 45, w: 24, bottom: 98, h: 12 },
  },
  kitchen: {
    window: { x: 27.5, w: 40, bottom: 55, h: 44 },
    shelf: { x: 80, w: 20, bottom: 33, h: 12 },
    coffeemaker: { x: 66, w: 8, bottom: 56, h: 13 },
    plant: { x: 5, w: 9, bottom: 88, h: 20 },
    stove: { x: 24, w: 15, bottom: 87, h: 22 },
    fridge: { x: 50, w: 12, bottom: 87, h: 40 },
    dining: { x: 45, w: 42, bottom: 99, h: 22 },
  },
  bedroom: {
    window: { x: 50, w: 44, bottom: 58, h: 48 },
    wall: { x: 17, w: 14, bottom: 44, h: 18 },
    wardrobe: { x: 92, w: 17, bottom: 90, h: 52 },
    desk: { x: 18, w: 35, bottom: 91, h: 24 },
    lamp: { x: 39, w: 9, bottom: 90, h: 34 },
    rug: { x: 64, w: 40, bottom: 99, h: 14 },
    bed: { x: 64, w: 44, bottom: 96, h: 32 },
    plant: { x: 6, w: 10, bottom: 99, h: 22 },
  },
};

export function RoomScene({ kind = 'hall', placed, catMood, onSlot, locked }: { kind?: RoomKind; placed: Partial<Record<DecorSlot, string>>; catMood: number | null; onSlot?: (s: DecorSlot) => void; locked?: boolean }) {
  const pos = ROOM_ART[kind];
  return (
    <div class={`scene scene-art scene-layers room-scene ${locked ? 'scene-locked' : ''}`} role="img" aria-label={kind}>
      <img class="layer-base" src={art(`room-${kind}`)} alt="" draggable={false} />
      {(Object.keys(pos) as DecorSlot[]).map((slot) => {
        const p = pos[slot]!;
        const id = placed[slot];
        const style = { left: `${p.x - p.w / 2}%`, width: `${p.w}%`, bottom: `${100 - p.bottom}%` };
        if (!id) {
          return onSlot ? <button class="layer room-empty" style={{ ...style, height: `${p.h}%` }} onClick={() => onSlot(slot)} aria-label={slot} /> : null;
        }
        return <img class={`layer ${onSlot ? 'tappable' : ''}`} src={art(`home-${id}`)} style={style} alt="" draggable={false} onClick={onSlot ? () => onSlot(slot) : undefined} />;
      })}
      {catMood !== null && (
        <svg viewBox="-12 -2 140 100" class="layer room-cat" style={{ left: '30%', width: '12%', bottom: '8%' }} aria-hidden="true">
          <CatShape mood={catMood} />
        </svg>
      )}
    </div>
  );
}

export function DecorIcon({ slot, v }: { slot: DecorSlot; v: number }) {
  return <img class="decor-icon" src={art(`home-${slot}-${v}`)} alt="" draggable={false} />;
}
