import { COMPONENTS, type ComponentId } from '../core/content';

// Чашка в разрезе: слои рецепта в реальных пропорциях (vol), снизу вверх по layer.
// Ещё не налитое — полупрозрачный «призрак» с пунктирной границей: видно, сколько и чего не хватает.

interface Props {
  recipe: ComponentId[];
  /** Что уже в чашке. Без него рисуется готовый напиток. */
  have?: ComponentId[];
  /** Что готовится прямо сейчас, p — доля 0..1. */
  brewing?: { c: ComponentId; p: number }[];
  size?: number;
  glow?: boolean;
  /** Керамическая чашка (здесь) или бумажный стакан с крышкой (с собой). */
  vessel?: 'mug' | 'paper';
}

const W = 64;
const H = 76;
// внутренность стакана: трапеция чуть сужается книзу
const TOP = 10;
const BOTTOM = 70;
const IN_TOP_L = 9;
const IN_TOP_R = 55;
const IN_BOT_L = 13;
const IN_BOT_R = 51;
// бумажный стакан: заметнее сужается книзу, без ручки
const PAPER = `M8 ${TOP + 4} L56 ${TOP + 4} L49 ${BOTTOM} L15 ${BOTTOM} Z`;
const CLIP = `M${IN_TOP_L} ${TOP} L${IN_TOP_R} ${TOP} L${IN_BOT_R} ${BOTTOM - 4} Q${IN_BOT_R} ${BOTTOM} ${IN_BOT_R - 4} ${BOTTOM} L${IN_BOT_L + 4} ${BOTTOM} Q${IN_BOT_L} ${BOTTOM} ${IN_BOT_L} ${BOTTOM - 4} Z`;

let uid = 0;

export function CupSection({ recipe, have, brewing = [], size = 64, glow, vessel = 'mug' }: Props) {
  const paper = vessel === 'paper';
  const shape = paper ? PAPER : CLIP;
  const id = `cup${++uid}`;
  const filled = have ?? recipe;
  // какие компоненты рецепта уже есть (мультимножество)
  const pool = [...filled];
  const brewPool = [...brewing];
  const parts = [...recipe]
    .sort((a, b) => COMPONENTS[a].layer - COMPONENTS[b].layer)
    .map((c) => {
      const k = pool.indexOf(c);
      if (k >= 0) {
        pool.splice(k, 1);
        return { c, p: 1 };
      }
      const b = brewPool.findIndex((x) => x.c === c);
      if (b >= 0) {
        const p = brewPool[b].p;
        brewPool.splice(b, 1);
        return { c, p };
      }
      return { c, p: 0 };
    });

  const total = recipe.reduce((s, c) => s + COMPONENTS[c].vol, 0);
  const cap = Math.max(total, 3) / 0.86;
  const unit = (BOTTOM - TOP) / cap;

  // Слои жидкостей: призрак на полную высоту, налитое — по доле p
  let y = BOTTOM;
  const layers: { c: ComponentId; y0: number; h: number; p: number }[] = [];
  for (const part of parts) {
    const v = COMPONENTS[part.c].vol;
    if (!v) continue;
    const h = v * unit;
    layers.push({ c: part.c, y0: y - h, h, p: part.p });
    y -= h;
  }
  const surface = y;
  const sprinkles = parts.filter((x) => COMPONENTS[x.c].kind === 'sprinkle');
  const ice = parts.filter((x) => COMPONENTS[x.c].kind === 'ice');

  return (
    <svg class={`cup-section ${glow ? 'glow' : ''}`} viewBox={`0 0 ${W} ${H}`} width={size} height={(size * H) / W} role="img" aria-label={recipe.map((c) => COMPONENTS[c].icon).join(' ')}>
      <defs>
        <clipPath id={id}>
          <path d={shape} />
        </clipPath>
      </defs>
      {/* ручка у чашки */}
      {!paper && <path d={`M${IN_TOP_R + 2} 24 q12 2 10 16 q-2 12 -12 12`} fill="none" stroke="#d9c6ae" stroke-width="4" stroke-linecap="round" />}
      <path d={shape} fill={paper ? '#fbf6ee' : '#f6f3ee'} />
      <g clip-path={`url(#${id})`}>
        {layers.map((l) => {
          const comp = COMPONENTS[l.c];
          const ghost = (
            <rect x="0" y={l.y0} width={W} height={l.h} fill={comp.color} opacity="0.16" />
          );
          const fh = l.h * l.p;
          const fy = l.y0 + l.h - fh;
          return (
            <g>
              {ghost}
              {l.p < 1 && <line x1="0" x2={W} y1={l.y0} y2={l.y0} stroke={comp.color === '#ffffff' || comp.color === '#fffaf0' ? '#c9b59b' : comp.color} stroke-width="0.8" stroke-dasharray="2 2" opacity="0.9" />}
              {fh > 0 && <rect class="layer" x="0" y={fy} width={W} height={fh + 0.4} fill={comp.color} />}
              {fh > 0 && <line x1="0" x2={W} y1={fy} y2={fy} stroke="#00000022" stroke-width="0.7" />}
              {fh > 0 && comp.kind === 'foam' && [10, 20, 30, 40, 50].map((x, i) => <circle cx={x + (i % 2) * 3} cy={fy + 2.5} r="2.6" fill={comp.color} stroke="#eadcc6" stroke-width="0.5" />)}
              {fh > 0 && comp.kind === 'cream' && <path d={`M0 ${fy + 3} q8 -7 16 0 q8 -7 16 0 q8 -7 16 0 q8 -7 16 0 V${fy + 4} H0Z`} fill="#fff" stroke="#efe4d4" stroke-width="0.6" />}
            </g>
          );
        })}
        {/* лёд — кубики в напитке */}
        {ice.map((part) =>
          [
            [18, surface + 4],
            [33, surface + 9],
            [24, surface + 16],
          ].map(([x, yy]) => (
            <rect x={x} y={Math.min(yy, BOTTOM - 12)} width="11" height="10" rx="2.5" fill="#eaf7ff" stroke="#9fd0ea" stroke-width="1" opacity={part.p ? 0.92 : 0.25} />
          )),
        )}
        {/* корица и прочая посыпка — точки по поверхности */}
        {sprinkles.map((part) =>
          [12, 17, 23, 28, 34, 39, 45, 50].map((x, i) => <circle cx={x} cy={surface + 1.6 + (i % 3) * 0.9} r="1.1" fill={COMPONENTS[part.c].color} opacity={part.p ? 1 : 0.25} />),
        )}
      </g>
      {paper ? (
        <>
          {/* картонная манжета и крышка поверх разреза */}
          <path d={`M10.5 40 L53.5 40 L51.6 54 L12.4 54 Z`} fill="#b07a4a" opacity="0.55" />
          <path d={shape} fill="none" stroke="#b9a184" stroke-width="1.6" />
          <rect x="5" y={TOP - 1} width="54" height="6" rx="3" fill="#fff" stroke="#b9a184" stroke-width="1.3" />
          <rect x="20" y={TOP - 5} width="24" height="5" rx="2" fill="#fff" stroke="#b9a184" stroke-width="1.2" />
        </>
      ) : (
        <>
          <path d={CLIP} fill="none" stroke="#c9b59b" stroke-width="1.6" />
          <path d={`M${IN_TOP_L + 5} ${TOP + 6} L${IN_BOT_L + 4} ${BOTTOM - 10}`} stroke="#fff" stroke-width="2.5" stroke-linecap="round" opacity="0.7" />
        </>
      )}
    </svg>
  );
}
