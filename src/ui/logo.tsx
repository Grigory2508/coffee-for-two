// Логотип кофейни: собирается только из элементов конструктора (форма, цвета, значок, буквы, рамка).
// Свои картинки не загружаем: логотип видят все в рейтингах, а модерация картинок — отдельная большая задача.
import { useState } from 'preact/hooks';
import { LOGO_COLORS, LOGO_DECOS, LOGO_FONTS, LOGO_FRAMES, LOGO_ICONS, LOGO_NO_ICON, LOGO_SHAPES, LOGO_TEXT_MAX, cleanLogo, type Logo } from '../core/content';
import { art } from './icons';
import { L, t } from '../i18n';

const SHAPES = [
  'M50 4 a46 46 0 1 0 0.01 0 z', // круг
  'M50 4 L92 16 V48 C92 74 72 90 50 97 C28 90 8 74 8 48 V16 Z', // щит
  'M50 3 L97 50 L50 97 L3 50 Z', // ромб
  'M8 18 Q8 10 16 10 H84 Q92 10 92 18 V78 Q92 86 84 86 H16 Q8 86 8 78 Z', // вывеска
  'M10 96 V46 A40 40 0 0 1 90 46 V96 Z', // арка
  'M50 4 L90 27 V73 L50 96 L10 73 V27 Z', // шестиугольник
  'M32 5 H68 L95 32 V68 L68 95 H32 L5 68 V32 Z', // восьмиугольник
  scallop(16, 46, 40), // печать
  'M8 16 H92 V40 A10 10 0 0 0 92 60 V84 H8 V60 A10 10 0 0 0 8 40 Z', // билет
  'M24 82 A18 18 0 0 1 18 47 A20 20 0 0 1 44 26 A24 24 0 0 1 84 40 A21 21 0 0 1 80 82 Z', // облако
  'M12 6 H88 V94 L50 76 L12 94 Z', // флажок
  'M50 5 A38 45 0 1 0 50.01 5 Z', // овал
];

const FONTS = ['ui-rounded, system-ui, sans-serif', 'Georgia, "Times New Roman", serif', '"Segoe Print", "Bradley Hand", "Comic Sans MS", cursive'];

/** Круг с зубцами: n зубцов, внешний и внутренний радиус. */
function scallop(n: number, r1: number, r2: number): string {
  let d = '';
  for (let i = 0; i < n * 2; i++) {
    const a = (Math.PI * i) / n - Math.PI / 2;
    const r = i % 2 ? r2 : r1;
    d += `${i ? 'L' : 'M'}${(50 + r * Math.cos(a)).toFixed(1)} ${(50 + r * Math.sin(a)).toFixed(1)} `;
  }
  return d + 'Z';
}

let maskSeq = 0;
const ICON_GROUPS = ['funny', 'fantasy', 'street', 'coffee', 'bakery', 'animals', 'nature', 'base'] as const;

/** Значок-маска: силуэт из файла, залитый цветом рисунка. */
function MaskIcon({ src, color, box = [20, 20, 60, 60] }: { src: string; color: string; box?: [number, number, number, number] }) {
  const id = `lm${++maskSeq}`;
  return (
    <g>
      <mask id={id} maskUnits="userSpaceOnUse" x="0" y="0" width="100" height="100">
        <image href={art(src)} x={box[0]} y={box[1]} width={box[2]} height={box[3]} />
      </mask>
      <rect x="0" y="0" width="100" height="100" fill={color} mask={`url(#${id})`} />
    </g>
  );
}

function Icon({ i, color }: { i: number; color: string }) {
  const def = LOGO_ICONS[i];
  if (def?.art) return <MaskIcon src={`logo/${def.art}`} color={color} />;
  switch (i) {
    case 0: // чашка
      return (
        <g fill={color}>
          <path d="M30 42 h34 v18 a17 17 0 0 1 -34 0 z" />
          <path d="M64 46 a9 9 0 0 1 0 18" fill="none" stroke={color} stroke-width="5" />
          <path d="M38 36 q-4 -6 0 -12 M48 36 q-4 -6 0 -12 M58 36 q-4 -6 0 -12" fill="none" stroke={color} stroke-width="3.5" stroke-linecap="round" />
        </g>
      );
    case 1: // зерно
      return (
        <g>
          <ellipse cx="50" cy="52" rx="17" ry="24" fill={color} transform="rotate(-25 50 52)" />
          <path d="M43 32 Q56 52 46 72" fill="none" stroke="#0004" stroke-width="4" />
        </g>
      );
    case 2: // кот
      return (
        <g fill={color}>
          <circle cx="50" cy="56" r="20" />
          <path d="M32 46 L34 24 L46 38 Z M68 46 L66 24 L54 38 Z" />
        </g>
      );
    case 3: // сердце
      return <path d="M50 74 C20 54 26 30 42 32 C47 33 50 37 50 40 C50 37 53 33 58 32 C74 30 80 54 50 74 Z" fill={color} />;
    case 4: // звезда
      return <path d="M50 24 L57 43 L77 43 L61 55 L67 74 L50 62 L33 74 L39 55 L23 43 L43 43 Z" fill={color} />;
    case 5: // лист
      return (
        <g>
          <path d="M28 70 C28 40 50 26 74 26 C74 52 58 72 28 70 Z" fill={color} />
          <path d="M30 68 L66 34" stroke="#0004" stroke-width="3" />
        </g>
      );
    case 6: // луна
      return <path d="M60 24 A26 26 0 1 0 74 66 A21 21 0 1 1 60 24 Z" fill={color} />;
    case 7: // круассан
      return <path d="M22 60 Q26 34 50 32 Q74 34 78 60 Q66 52 62 58 Q56 48 50 50 Q44 48 38 58 Q34 52 22 60 Z" fill={color} />;
    default:
      return null;
  }
}

export function LogoView({ logo, size = 40 }: { logo: Logo; size?: number }) {
  const l = cleanLogo(logo);
  const bg = LOGO_COLORS[l.bg];
  const fg = LOGO_COLORS[l.fg];
  const shape = SHAPES[l.shape];
  const hasIcon = l.icon !== LOGO_NO_ICON;
  const deco = l.deco ? LOGO_DECOS[l.deco] : undefined;
  const textY = hasIcon ? 86 : 62;
  const textSize = hasIcon ? 16 : l.text.length > 1 ? 36 : 44;
  return (
    <svg viewBox="0 0 100 100" width={size} height={size} class="logo" aria-hidden="true">
      {deco?.art && <MaskIcon src={`logo/${deco.art}`} color={bg} box={[0, 0, 100, 100]} />}
      <g transform={deco?.art ? 'translate(50 50) scale(0.66) translate(-50 -50)' : undefined}>
      <path d={shape} fill={bg} />
      {l.frame > 0 && (
        <g transform="translate(50 50) scale(0.86) translate(-50 -50)">
          <path d={shape} fill="none" stroke={fg} stroke-width={l.frame === 2 ? 2.5 : l.frame === 5 ? 5.5 : l.frame === 4 ? 3.5 : 3} stroke-linecap="round" stroke-linejoin="round" stroke-dasharray={l.frame === 3 ? '6 5' : l.frame === 4 ? '0.1 6' : undefined} />
          {l.frame === 2 && (
            <g transform="translate(50 50) scale(0.9) translate(-50 -50)">
              <path d={shape} fill="none" stroke={fg} stroke-width="2" />
            </g>
          )}
        </g>
      )}
      {hasIcon && (
        <g transform={l.text ? 'translate(50 44) scale(0.72) translate(-50 -50)' : undefined}>
          <Icon i={l.icon} color={fg} />
        </g>
      )}
      {l.text && (
        <text x="50" y={textY} text-anchor="middle" font-size={textSize} font-weight="800" fill={fg} font-family={FONTS[l.font ?? 0]}>
          {l.text}
        </text>
      )}
      </g>
    </svg>
  );
}

/** Конструктор: название + логотип. Используется при открытии кофейни (бесплатно) и для предложения новой вывески. */
export function BrandEditor({ name, logo, onChange }: { name: string; logo: Logo; onChange: (name: string, logo: Logo) => void }) {
  const [part, setPart] = useState<'shape' | 'icon' | 'colors' | 'text' | 'deco'>('icon');
  const set = (p: Partial<Logo>) => onChange(name, cleanLogo({ ...logo, ...p }));
  return (
    <div class="brand-editor">
      <div class="brand-preview">
        <LogoView logo={logo} size={88} />
        <input class="input grow" value={name} maxLength={24} placeholder={t('cafeNameLabel')} onInput={(e) => onChange((e.target as HTMLInputElement).value, logo)} />
      </div>
      <div class="segmented">
        {(
          [
            ['icon', t('logoIcon')],
            ['shape', t('logoShape')],
            ['deco', t('logoDeco')],
            ['colors', t('logoColors')],
            ['text', t('logoText')],
          ] as const
        ).map(([id, label]) => (
          <button type="button" class={`seg ${part === id ? 'on' : ''}`} onClick={() => setPart(id)}>
            {label}
          </button>
        ))}
      </div>
      {part === 'icon' && (
        <div class="logo-groups">
          {ICON_GROUPS.filter((g) => LOGO_ICONS.some((n) => n.group === g)).map((g) => (
            <div class="logo-group">
              <div class="muted small">{t(`logoGroup_${g}`)}</div>
              <div class="logo-grid">
                {LOGO_ICONS.map((n, i) =>
                  n.group !== g ? null : (
                    <button type="button" class={`logo-opt ${logo.icon === i ? 'on' : ''}`} onClick={() => set({ icon: i })} aria-label={L(n)}>
                      <LogoView logo={{ ...logo, icon: i, text: '' }} size={44} />
                    </button>
                  ),
                )}
              </div>
            </div>
          ))}
        </div>
      )}
      {part === 'shape' && (
        <>
          <div class="logo-grid">
            {LOGO_SHAPES.map((n, i) => (
              <button type="button" class={`logo-opt ${logo.shape === i ? 'on' : ''}`} onClick={() => set({ shape: i })} aria-label={L(n)}>
                <LogoView logo={{ ...logo, shape: i }} size={44} />
              </button>
            ))}
          </div>
          <div class="chips">
            {LOGO_FRAMES.map((n, i) => (
              <button type="button" class={`chip ${logo.frame === i ? 'on' : ''}`} onClick={() => set({ frame: i })}>
                {L(n)}
              </button>
            ))}
          </div>
        </>
      )}
      {part === 'deco' && (
        <div class="logo-grid">
          {LOGO_DECOS.map((n, i) => (
            <button type="button" class={`logo-opt ${(logo.deco ?? 0) === i ? 'on' : ''}`} onClick={() => set({ deco: i })} aria-label={L(n)}>
              <LogoView logo={{ ...logo, deco: i }} size={44} />
            </button>
          ))}
        </div>
      )}
      {part === 'colors' && (
        <>
          <div class="muted small">{t('logoBg')}</div>
          <div class="swatches">
            {LOGO_COLORS.map((c, i) => (
              <button type="button" class={`swatch ${logo.bg === i ? 'on' : ''}`} style={{ background: c }} onClick={() => set({ bg: i })} aria-label={c} />
            ))}
          </div>
          <div class="muted small">{t('logoFg')}</div>
          <div class="swatches">
            {LOGO_COLORS.map((c, i) => (
              <button type="button" class={`swatch ${logo.fg === i ? 'on' : ''}`} style={{ background: c }} onClick={() => set({ fg: i })} aria-label={c} />
            ))}
          </div>
        </>
      )}
      {part === 'text' && (
        <div class="row gap">
          <input class="input grow" value={logo.text} maxLength={LOGO_TEXT_MAX} placeholder={t('logoTextHint')} onInput={(e) => set({ text: (e.target as HTMLInputElement).value })} />
        </div>
      )}
      {part === 'text' && (
        <div class="chips">
          {LOGO_FONTS.map((n, i) => (
            <button type="button" class={`chip ${(logo.font ?? 0) === i ? 'on' : ''}`} onClick={() => set({ font: i })} style={{ fontFamily: FONTS[i] }}>
              {L(n)}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
