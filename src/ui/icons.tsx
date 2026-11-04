import type { ComponentId, StockId } from '../core/content';

// Арт из Gemini (Nano Banana): иконки и сцены лежат в public/art как WebP.
// Ключи — контрактные имена файлов; эмодзи остаются в content.ts как запасной текст (aria, логи бота).

const BASE = import.meta.env.BASE_URL;

export const art = (name: string) => `${BASE}art/${name}.webp`;

const COMPONENT_ART: Record<ComponentId, string> = {
  shot: 'ing-shot',
  water: 'ing-water',
  milk: 'ing-milk',
  foam: 'ing-foam',
  cream: 'ing-cream',
  syrup: 'ing-syrup',
  caramel: 'ing-caramel',
  cocoa: 'ing-cocoa',
  cinnamon: 'ing-cinnamon',
  ice: 'ing-ice',
};

const STOCK_ART: Record<StockId, string> = {
  beans: 'stock-beans',
  milk: 'ing-milk',
  syrup: 'ing-syrup',
  cocoa: 'ing-cocoa',
  cups: 'stock-cups',
  catFood: 'stock-catfood',
};

export function Img({ name, size = 24, alt = '', class: cls = '' }: { name: string; size?: number; alt?: string; class?: string }) {
  return <img class={`art-icon ${cls}`} src={art(name)} width={size} height={size} alt={alt} draggable={false} />;
}

export const CompIcon = ({ c, size = 24 }: { c: ComponentId; size?: number }) => <Img name={COMPONENT_ART[c]} size={size} />;
export const StockIcon = ({ k, size = 24 }: { k: StockId; size?: number }) => <Img name={STOCK_ART[k]} size={size} />;
export const Coin = ({ size = 16 }: { size?: number }) => <Img name="ui-coin" size={size} class="inline" />;
export const Bolt = ({ size = 16 }: { size?: number }) => <Img name="ui-energy" size={size} class="inline" />;
export const StarIcon = ({ size = 16 }: { size?: number }) => <Img name="ui-star" size={size} class="inline" />;

/** Сцена кофейни (сгенерирована; старая SVG-версия в art.tsx больше не используется в интерфейсе). */
export function CafeArt() {
  return <img class="scene scene-art" src={art('scene-cafe')} alt="" draggable={false} />;
}
