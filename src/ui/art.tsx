// Векторные заглушки вместо финального арта (Nano Banana 2 — после выбора стиля).
import type { DecorSlot } from '../core/content';

const PAL: [string, string][] = [
  ['#c9b49c', '#8c7a66'],
  ['#e8a598', '#b8695a'],
  ['#6f9e88', '#3f6b58'],
];

export function CafeScene({ cat, busy }: { cat: boolean; busy: boolean }) {
  return (
    <svg viewBox="0 0 360 190" class="scene" role="img" aria-label="cafe">
      <rect width="360" height="190" fill="#f3e3cf" />
      <rect y="0" width="360" height="22" fill="#6b4226" />
      {[0, 1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
        <path d={`M${i * 40} 22 q20 18 40 0`} fill={i % 2 ? '#f6efe6' : '#c8873a'} />
      ))}
      <rect x="22" y="48" width="110" height="74" rx="6" fill="#bfe0ea" stroke="#6b4226" stroke-width="4" />
      <line x1="77" y1="48" x2="77" y2="122" stroke="#6b4226" stroke-width="3" />
      <circle cx="48" cy="72" r="10" fill="#fff8" />
      <rect x="222" y="40" width="124" height="44" rx="6" fill="#2e2420" />
      <text x="284" y="59" fill="#f6efe6" font-size="11" text-anchor="middle" font-family="inherit">ESPRESSO · LATTE</text>
      <text x="284" y="74" fill="#c8873a" font-size="10" text-anchor="middle" font-family="inherit">CAPPUCCINO · RAF</text>
      <rect x="0" y="128" width="360" height="62" fill="#8a5a3b" />
      <rect x="0" y="122" width="360" height="10" fill="#6b4226" />
      <g transform="translate(150 92)">
        <rect width="62" height="36" rx="5" fill="#9aa5ad" />
        <rect x="8" y="6" width="46" height="10" rx="3" fill="#5f6b73" />
        <rect x="18" y="20" width="8" height="10" fill="#2e2420" />
        <rect x="36" y="20" width="8" height="10" fill="#2e2420" />
        {busy && (
          <g class="steam">
            <path d="M22 -2 q-6 -8 0 -14 q6 -6 0 -12" stroke="#fff" stroke-width="3" fill="none" />
            <path d="M40 -2 q-6 -8 0 -14 q6 -6 0 -12" stroke="#fff" stroke-width="3" fill="none" />
          </g>
        )}
      </g>
      <g transform="translate(276 104)">
        <rect width="14" height="20" rx="3" fill="#f6efe6" />
        <rect x="18" width="14" height="20" rx="3" fill="#f6efe6" />
        <rect x="36" width="14" height="20" rx="3" fill="#e8a598" />
      </g>
      <g transform="translate(112 100)">
        <ellipse cx="14" cy="22" rx="14" ry="4" fill="#0002" />
        <rect x="4" y="2" width="20" height="20" rx="4" fill="#5f8f7a" />
        <path d="M14 2 q-12 -14 -6 -24 M14 2 q10 -16 4 -26 M14 2 q2 -16 14 -20" stroke="#3f6b58" stroke-width="4" fill="none" />
      </g>
      {cat && (
        <g transform="translate(40 108) scale(0.55)">
          <CatShape mood={80} />
        </g>
      )}
    </svg>
  );
}

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

// ---------- декор: каждая функция рисует предмет в своей локальной системе координат ----------

function Decor({ slot, v }: { slot: DecorSlot; v: number }) {
  const [a, b] = PAL[v] ?? PAL[0];
  switch (slot) {
    case 'wall':
      return (
        <g>
          <rect width="64" height="46" rx="3" fill={b} />
          <rect x="5" y="5" width="54" height="36" fill="#f6efe6" />
          {v === 0 && <path d="M8 38 l14 -16 l10 10 l8 -8 l16 14 z" fill={a} />}
          {v === 1 && <circle cx="32" cy="23" r="11" fill={a} />}
          {v === 2 && <path d="M8 8 h22 v28 h-22 z M34 8 h22 v13 h-22 z" fill={a} />}
        </g>
      );
    case 'window':
      return (
        <g>
          <path d={v === 2 ? 'M0 0 h22 q-6 40 4 70 h-26 z' : 'M0 0 h18 v70 h-18 z'} fill={a} />
          <path d={v === 2 ? 'M86 0 h-22 q6 40 -4 70 h26 z' : 'M86 0 h-18 v70 h18 z'} fill={a} />
          <rect x="-4" y="-6" width="94" height="7" rx="3" fill={b} />
          {v === 1 && <path d="M2 30 h14 M70 30 h14" stroke={b} stroke-width="4" />}
        </g>
      );
    case 'sofa':
      return (
        <g>
          <rect x="0" y="14" width="120" height="34" rx={v === 2 ? 4 : 12} fill={a} />
          <rect x="10" y="0" width="100" height="26" rx={v === 2 ? 3 : 10} fill={b} />
          <rect x="-6" y="18" width="16" height="30" rx="6" fill={b} />
          <rect x="110" y="18" width="16" height="30" rx="6" fill={b} />
          {v >= 1 && <rect x="22" y="8" width="20" height="16" rx="5" fill="#f6efe6" />}
          <rect x="6" y="48" width="6" height="8" fill="#2e2420" />
          <rect x="108" y="48" width="6" height="8" fill="#2e2420" />
        </g>
      );
    case 'rug':
      return (
        <g>
          <ellipse cx="80" cy="16" rx="80" ry="16" fill={a} />
          <ellipse cx="80" cy="16" rx={v === 0 ? 0 : 60} ry={v === 0 ? 0 : 10} fill="none" stroke={b} stroke-width="3" stroke-dasharray={v === 2 ? '6 4' : ''} />
        </g>
      );
    case 'table':
      return (
        <g>
          <rect x="0" y="0" width="54" height="8" rx="3" fill={b} />
          <rect x="6" y="8" width="5" height="26" fill={b} />
          <rect x="43" y="8" width="5" height="26" fill={b} />
          {v >= 1 && <rect x="18" y="-10" width="10" height="10" rx="2" fill="#f6efe6" />}
          {v === 2 && <circle cx="40" cy="-6" r="6" fill={a} />}
        </g>
      );
    case 'lamp':
      return (
        <g>
          <path d={v === 1 ? 'M0 30 q16 -34 32 0 z' : 'M4 30 l6 -26 h12 l6 26 z'} fill={a} />
          <rect x="14" y="30" width="4" height="70" fill="#2e2420" />
          <rect x="4" y="98" width="24" height="6" rx="3" fill="#2e2420" />
          {v === 2 && <circle cx="16" cy="36" r="30" fill="#ffd98a33" />}
        </g>
      );
    case 'plant':
      return (
        <g>
          <path d="M6 40 h28 l-4 24 h-20 z" fill={b} />
          {v === 0 && <path d="M20 40 q-14 -18 -4 -34 M20 40 q14 -18 2 -36" stroke="#4f8a5f" stroke-width="6" fill="none" />}
          {v === 1 && <circle cx="20" cy="24" r="18" fill="#5f9e6c" />}
          {v === 2 && <path d="M20 40 l-16 -36 M20 40 l0 -42 M20 40 l16 -36 M20 40 l-24 -20 M20 40 l24 -20" stroke="#3f7a4f" stroke-width="5" stroke-linecap="round" />}
        </g>
      );
    case 'shelf':
      return (
        <g>
          <rect x="0" y="22" width="74" height="6" rx="2" fill={b} />
          {[0, 1, 2, 3, 4].slice(0, 2 + v).map((i) => (
            <rect x={6 + i * 13} y={2 + (i % 2) * 4} width="9" height={20 - (i % 2) * 4} rx="1" fill={i % 2 ? a : '#f6efe6'} stroke={b} stroke-width="1" />
          ))}
        </g>
      );
  }
}

const SLOT_POS: Record<DecorSlot, { x: number; y: number; w: number; h: number }> = {
  wall: { x: 150, y: 40, w: 64, h: 46 },
  window: { x: 30, y: 36, w: 86, h: 70 },
  shelf: { x: 254, y: 50, w: 74, h: 28 },
  lamp: { x: 300, y: 112, w: 32, h: 104 },
  sofa: { x: 136, y: 150, w: 120, h: 56 },
  rug: { x: 116, y: 214, w: 160, h: 32 },
  table: { x: 54, y: 180, w: 54, h: 34 },
  plant: { x: 18, y: 152, w: 40, h: 64 },
};

export function RoomScene({ placed, catMood, onSlot }: { placed: Partial<Record<DecorSlot, string>>; catMood: number | null; onSlot?: (s: DecorSlot) => void }) {
  return (
    <svg viewBox="0 0 360 260" class="scene" role="img" aria-label="room">
      <rect width="360" height="200" fill="#efe1cc" />
      <rect y="200" width="360" height="60" fill="#c9a27e" />
      <path d="M0 200 h360" stroke="#a9825f" stroke-width="3" />
      <rect x="36" y="40" width="74" height="62" fill="#bfe0ea" stroke="#fff" stroke-width="4" />
      {(Object.keys(SLOT_POS) as DecorSlot[]).map((slot) => {
        const pos = SLOT_POS[slot];
        const id = placed[slot];
        const v = id ? Number(id.split('-')[1]) : -1;
        return (
          <g transform={`translate(${pos.x} ${pos.y})`} onClick={() => onSlot?.(slot)} class={onSlot ? 'slot' : ''}>
            {v >= 0 ? (
              <Decor slot={slot} v={v} />
            ) : (
              <rect width={pos.w} height={pos.h} rx="6" fill="#ffffff55" stroke="#a9825f" stroke-dasharray="5 4" />
            )}
          </g>
        );
      })}
      {catMood !== null && (
        <g transform="translate(176 120) scale(0.5)">
          <CatShape mood={catMood} />
        </g>
      )}
    </svg>
  );
}

export function DecorIcon({ slot, v }: { slot: DecorSlot; v: number }) {
  const pos = SLOT_POS[slot];
  const pad = 10;
  const extraTop = slot === 'table' ? 12 : slot === 'plant' ? 4 : slot === 'sofa' ? 0 : 0;
  return (
    <svg viewBox={`${-pad - 8} ${-pad - extraTop} ${pos.w + pad * 2 + 16} ${pos.h + pad * 2 + extraTop}`} class="decor-icon" aria-hidden="true">
      <Decor slot={slot} v={v} />
    </svg>
  );
}
