import { type CafeDecorSlot, type CafeSlot, type DairyType, type DessertId, type MilkKind, type StockId } from '../core/content';

// Арт из Gemini (Nano Banana): иконки и сцены лежат в public/art как WebP.
// Ключи — контрактные имена файлов; эмодзи остаются в content.ts как запасной текст (aria, логи бота).

const BASE = import.meta.env.BASE_URL;

export const art = (name: string) => `${BASE}art/${name}.webp`;

/** Иконка продукта на складе: имя файла выводится из id. */
export function stockArt(k: StockId): string {
  if (k === 'beans') return 'stock-beans';
  if (k === 'cups') return 'stock-cups';
  if (k === 'catFood') return 'stock-catfood';
  const [kind, id] = k.split('_');
  return `${kind === 'ds' ? 'ds' : kind === 'syr' ? 'syr' : kind}-${id}`;
}

export function Img({ name, size = 24, alt = '', class: cls = '' }: { name: string; size?: number; alt?: string; class?: string }) {
  return <img class={`art-icon ${cls}`} src={art(name)} width={size} height={size} alt={alt} draggable={false} />;
}

export const StockIcon = ({ k, size = 24 }: { k: StockId; size?: number }) => <Img name={stockArt(k)} size={size} />;
export const DessertIcon = ({ d, size = 24 }: { d: DessertId; size?: number }) => <Img name={`ds-${d}`} size={size} />;
/** Значок вида молока поверх пакета: крупный, чтобы виды различались и на маленьком размере. */
export const MILK_BADGE: Record<MilkKind, { sym: string; bg: string }> = {
  regular: { sym: '🐄', bg: '#e6f0fb' },
  oat: { sym: '🌾', bg: '#f6e3bf' },
  lactoFree: { sym: '🚫', bg: '#dff1dc' },
  coconut: { sym: '🥥', bg: '#efe4da' },
};
export const MilkIcon = ({ kind, type = 'milk', size = 24, badge = true }: { kind: MilkKind; type?: DairyType; size?: number; badge?: boolean }) => (
  <span class="milk-icon" style={{ width: `${size}px`, height: `${size}px` }}>
    <Img name={`${type}-${kind}`} size={size} />
    {badge && (
      <i class="milk-badge" style={{ background: MILK_BADGE[kind].bg, fontSize: `${Math.max(9, Math.round(size * 0.42))}px` }}>
        {MILK_BADGE[kind].sym}
      </i>
    )}
  </span>
);
export const Coin = ({ size = 16 }: { size?: number }) => <Img name="ui-coin" size={size} class="inline" />;
export const Bolt = ({ size = 16 }: { size?: number }) => <Img name="ui-energy" size={size} class="inline" />;
export const StarIcon = ({ size = 16 }: { size?: number }) => <Img name="ui-star" size={size} class="inline" />;

/** Голова гостя (кружок из спрайта guest-*): постоянные — guest-<id>. */
export function GuestHead({ name, size = 32 }: { name: string; size?: number }) {
  return <span class="guest-head" style={{ width: `${size}px`, height: `${size}px`, backgroundImage: `url(${art(name)})` }} />;
}

/** Стойка (стиль cozy): фон scene-counter, кофемашина по уровню на прилавке. decor/onSlot/active — для совместимости, не используются. */
export function CafeArt({ levels }: { levels?: Partial<Record<CafeSlot, number>>; decor?: Partial<Record<CafeDecorSlot, string>>; onSlot?: (s: CafeDecorSlot) => void; active?: CafeDecorSlot }) {
  const m = Math.min(3, Math.max(1, levels?.machine ?? 1));
  return (
    <div class="scene cozy-hero">
      <div class="cozy-hero-inner">
        <img class="cozy-hero-bg" src={art('scene-counter')} alt="" draggable={false} />
        {levels && <img class="cozy-hero-machine" key={m} src={art(`machine-${m}`)} style={{ width: `${[17, 27, 30][m - 1]}%` }} alt="" draggable={false} />}
      </div>
    </div>
  );
}
