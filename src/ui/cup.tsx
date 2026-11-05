import type { Cup } from '../core/assembly';
import { FLAVORS, MILKS, TOPPINGS } from '../core/content';

// Напиток в разрезе: посуда по шагу 1, внутри слои по шагам (кофе, вкус, молоко, пена, вода), сверху топпинг.

interface Props {
  cup: Cup;
  size?: number;
  glow?: boolean;
  /** Идёт таймер шага (0..1) — слой растёт. */
  progress?: { step: string; p: number } | null;
}

const W = 64;
const H = 80;

// Внутренность посуды: [верх-лево, верх-право, низ-лево, низ-право, верх, низ]
const SHAPES = {
  small: { l: 18, r: 46, bl: 21, br: 43, top: 46, bottom: 70, handle: true, saucer: true },
  capCup: { l: 10, r: 54, bl: 16, br: 48, top: 36, bottom: 70, handle: true, saucer: true },
  tall: { l: 14, r: 50, bl: 17, br: 47, top: 8, bottom: 74, handle: false, saucer: false },
  paper: { l: 12, r: 52, bl: 18, br: 46, top: 12, bottom: 74, handle: false, saucer: false },
};

let uid = 0;

const COFFEE = '#4a2a17';
const BASE_VOL = { espresso: 1, double: 1.8, ristretto: 0.6, lungo: 1.6 };

export function CupView({ cup, size = 64, glow, progress }: Props) {
  if (!cup.vessel) {
    return (
      <svg class="cup-section empty" viewBox={`0 0 ${W} ${H}`} width={size} height={(size * H) / W} aria-hidden="true">
        <rect x="8" y="20" width="48" height="54" rx="10" fill="none" stroke="#c9b59b" stroke-width="2" stroke-dasharray="4 4" />
      </svg>
    );
  }
  const sh = SHAPES[cup.vessel];
  const id = `cup${++uid}`;
  const shape = `M${sh.l} ${sh.top} L${sh.r} ${sh.top} L${sh.br} ${sh.bottom - 4} Q${sh.br} ${sh.bottom} ${sh.br - 4} ${sh.bottom} L${sh.bl + 4} ${sh.bottom} Q${sh.bl} ${sh.bottom} ${sh.bl} ${sh.bottom - 4} Z`;
  const p = (step: string) => (progress && progress.step === step ? progress.p : 1);

  // Объёмы в условных долях; высота посуды — 4.2 доли
  const layers: { color: string; vol: number; kind?: 'foam' | 'cream' }[] = [];
  if (cup.flavor) layers.push({ color: FLAVORS[cup.flavor].color, vol: 0.35 });
  const whipped = cup.whip && cup.dairy;
  if (cup.base && !whipped) layers.push({ color: COFFEE, vol: BASE_VOL[cup.base] * p('base') });
  if (cup.water) layers.push({ color: '#8a5a36', vol: 1.6 * p('water') });
  if (cup.dairy && !whipped) {
    const milk = cup.dairy.type === 'milk' ? MILKS[cup.dairy.kind].color : '#fffaf2';
    const big = cup.vessel === 'tall' || cup.vessel === 'paper' ? 2.2 : cup.vessel === 'capCup' ? 1.6 : 0.8;
    const foam = cup.texture === 'thick' ? 0.9 : cup.texture === 'thin' ? 0.35 : 0;
    layers.push({ color: milk, vol: big * (cup.texture ? p('texture') : 1) });
    if (foam) layers.push({ color: '#fffaf0', vol: foam * p('texture'), kind: 'foam' });
  }
  // Раф: эспрессо, вкус и сливки взбиты вместе — один светлый кофейный слой
  if (whipped) layers.push({ color: '#d9b892', vol: 3.2 * p('whip') });

  const unit = (sh.bottom - sh.top) / 4.2;
  let y = sh.bottom;
  const rects = layers.map((l) => {
    const h = Math.min(y - sh.top, l.vol * unit);
    const r = { ...l, y: y - h, h };
    y -= h;
    return r;
  });
  const surface = y;
  const top = cup.topping;

  return (
    <svg class={`cup-section ${glow ? 'glow' : ''}`} viewBox={`0 0 ${W} ${H}`} width={size} height={(size * H) / W} aria-hidden="true">
      <defs>
        <clipPath id={id}>
          <path d={shape} />
        </clipPath>
      </defs>
      {sh.saucer && <ellipse cx="32" cy={sh.bottom + 3} rx={cup.vessel === 'small' ? 20 : 27} ry="3.5" fill="#f3eee6" stroke="#c9b59b" stroke-width="1.2" />}
      {sh.handle && <path d={`M${sh.r - 1} ${sh.top + 6} q${cup.vessel === 'small' ? 9 : 12} 2 ${cup.vessel === 'small' ? 7 : 10} ${cup.vessel === 'small' ? 10 : 14} q-2 7 -9 8`} fill="none" stroke="#d9c6ae" stroke-width="3.5" stroke-linecap="round" />}
      <path d={shape} fill={cup.vessel === 'tall' ? '#eef7fb' : cup.vessel === 'paper' ? '#fbf6ee' : '#f6f3ee'} />
      <g clip-path={`url(#${id})`}>
        {rects.map((r) => (
          <g>
            <rect class="layer" x="0" y={r.y} width={W} height={r.h + 0.4} fill={r.color} />
            {r.kind === 'foam' && [16, 24, 32, 40, 48].map((x, i) => <circle cx={x + (i % 2) * 2} cy={r.y + 1.5} r="2.2" fill="#fffaf0" stroke="#eadcc6" stroke-width="0.5" />)}
          </g>
        ))}
        {cup.ice &&
          [
            [20, 0],
            [32, 8],
            [24, 18],
            [36, 26],
          ].map(([x, dy]) => <rect x={x} y={Math.min(sh.top + 6 + dy, sh.bottom - 12)} width="10" height="9" rx="2.5" fill="#eaf7ff" stroke="#9fd0ea" stroke-width="1" opacity="0.9" />)}
        {top === 'cinnamon' && [18, 23, 28, 33, 38, 43, 47].map((x, i) => <circle cx={x} cy={surface + 1.4 + (i % 3) * 0.8} r="1.1" fill={TOPPINGS.cinnamon.color} />)}
        {top === 'halvaCrumb' && [19, 25, 31, 37, 44].map((x, i) => <rect x={x} y={surface + (i % 2)} width="3" height="2.4" rx="0.8" fill="#d8c3a0" stroke="#b39a74" stroke-width="0.4" />)}
        {top === 'lemon' && <path d={`M22 ${surface + 2} q6 -3 10 0 q4 3 9 -1`} stroke="#e8c63a" stroke-width="2" fill="none" stroke-linecap="round" />}
      </g>
      {top === 'whipped' && <path d={`M${sh.l + 2} ${surface} q4 -9 10 -4 q4 -10 10 -3 q6 -9 10 0 q5 -4 ${sh.r - sh.l - 34} 4 Z`} fill="#fff" stroke="#e7dccb" stroke-width="0.8" />}
      {cup.vessel === 'paper' && <path d={`M${sh.l + 2} ${sh.top + 30} L${sh.r - 2} ${sh.top + 30} L${sh.r - 3.5} ${sh.top + 44} L${sh.l + 3.5} ${sh.top + 44} Z`} fill="#b07a4a" opacity="0.5" />}
      <path d={shape} fill="none" stroke={cup.vessel === 'paper' ? '#b9a184' : '#c9b59b'} stroke-width="1.6" />
      {cup.vessel === 'tall' && <path d={`M${sh.l + 4} ${sh.top + 6} L${sh.bl + 3} ${sh.bottom - 8}`} stroke="#fff" stroke-width="2.5" stroke-linecap="round" opacity="0.8" />}
    </svg>
  );
}
