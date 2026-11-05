import type { Wallpaper } from '../core/content';

// Обои рисуются вектором: один повторяющийся «раппорт» на всю стену.
// Масштаб рассчитан на сцену ~360 px в ширину: мелкий рисунок, низкий контраст, чтобы не спорить с мебелью.

let uid = 0;

function Motif({ w }: { w: Wallpaper }) {
  const ink = w.ink;
  switch (w.pattern) {
    case 'stripes':
      return <rect x="0" y="0" width="7" height="24" fill={ink} />;
    case 'dots':
      return (
        <g fill={ink}>
          <circle cx="6" cy="6" r="2.4" />
          <circle cx="18" cy="18" r="2.4" />
        </g>
      );
    case 'flowers':
      return (
        <g>
          <g fill={ink}>
            {[0, 72, 144, 216, 288].map((a) => (
              <ellipse cx="8" cy="5.4" rx="1.6" ry="2.6" transform={`rotate(${a} 8 8)`} />
            ))}
          </g>
          <circle cx="8" cy="8" r="1.2" fill={w.accent ?? '#fff7e8'} />
          <circle cx="20" cy="20" r="1" fill={ink} />
        </g>
      );
    case 'diamonds':
      return <path d="M12 0 L24 12 L12 24 L0 12 Z" fill="none" stroke={ink} stroke-width="1.2" />;
    case 'herringbone':
      return <path d="M0 6 L6 0 L12 6 L18 0 L24 6 M0 18 L6 12 L12 18 L18 12 L24 18" fill="none" stroke={ink} stroke-width="1.3" />;
    case 'check':
      return (
        <g fill={ink}>
          <rect x="0" y="0" width="24" height="2.4" opacity="0.8" />
          <rect x="0" y="0" width="2.4" height="24" opacity="0.8" />
          <rect x="11" y="0" width="1.2" height="24" opacity="0.5" />
          <rect x="0" y="11" width="24" height="1.2" opacity="0.5" />
        </g>
      );
    case 'brick':
      // кирпич: светлые швы по терракотовому фону, ряды со сдвигом в полкирпича
      return (
        <g fill="none" stroke={ink} stroke-width="1.1">
          <path d="M0 0.5 H24 M0 12.5 H24 M12 0.5 V12.5 M0 12.5 V24 M24 12.5 V24" />
        </g>
      );
    case 'tiles':
      return <rect x="0.6" y="0.6" width="10.8" height="10.8" fill={w.accent ?? '#ffffff'} stroke={ink} stroke-width="1.2" />;
    default:
      return null;
  }
}

const SIZE: Record<string, number> = { stripes: 30, dots: 32, flowers: 34, diamonds: 32, herringbone: 30, check: 32, tiles: 12, panel: 24, plain: 24 };

/** Стена во всю сцену (пол и плинтус лягут поверх). */
export function WallLayer({ w }: { w: Wallpaper }) {
  const id = `wp${++uid}`;
  const size = SIZE[w.pattern] ?? 24;
  return (
    <svg class="layer-base wall-layer" viewBox="0 0 400 300" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <defs>
        <pattern id={id} width={size} height={size} patternUnits="userSpaceOnUse">
          <rect width={size} height={size} fill={w.base} />
          <g transform={`scale(${size / (w.pattern === 'tiles' ? 12 : 24)})`}>
            <Motif w={w} />
          </g>
        </pattern>
      </defs>
      <rect width="400" height="300" fill={w.pattern === 'panel' ? w.base : `url(#${id})`} />
      {w.pattern === 'panel' && (
        // Стеновые панели снизу: от плинтуса до ~95 см, с молдингом
        <g>
          <rect x="0" y="140" width="400" height="88" fill={w.accent ?? w.ink} />
          <rect x="0" y="137" width="400" height="5" fill={w.ink} />
          {Array.from({ length: 8 }, (_, i) => (
            <rect x={8 + i * 50} y="150" width="38" height="66" rx="2" fill="none" stroke={w.ink} stroke-width="1.4" />
          ))}
        </g>
      )}
      {/* мягкая тень у потолка и в углах, чтобы стена не была плоской */}
      <defs>
        <linearGradient id={`${id}s`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="#5a3a24" stop-opacity="0.12" />
          <stop offset="0.25" stop-color="#5a3a24" stop-opacity="0" />
        </linearGradient>
      </defs>
      <rect width="400" height="300" fill={`url(#${id}s)`} />
    </svg>
  );
}

/** Маленький образец обоев для каталога. */
export function WallSwatch({ w }: { w: Wallpaper }) {
  return (
    <span class="wall-swatch">
      <WallLayer w={w} />
    </span>
  );
}
