import type { CafeSlot, ComponentId, StockId } from '../core/content';

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

/**
 * Сцена кофейни из слоёв: пустой зал + декор, витрина и машина по уровням кофейни.
 * Числа — в процентах от базовой картинки (1024×434): x — центр, w — ширина, bottom/top — опора.
 * Без levels (онбординг, приглашение) — цельная «витринная» сцена.
 */
const COUNTER = 81; // % высоты: поверхность стойки
const EQUIP: Record<'machine' | 'vitrine', { x: number; w: number }[]> = {
  machine: [
    { x: 77, w: 9 },
    { x: 76, w: 16 },
    { x: 76, w: 20 },
  ],
  vitrine: [
    { x: 93, w: 7.5 },
    { x: 92.5, w: 12.5 },
    { x: 92.5, w: 15 },
  ],
};
const DECOR: { name: string; level: number; x: number; w: number; bottom?: number; top?: number }[] = [
  { name: 'decor-floorplant', level: 2, x: 58, w: 9, bottom: 101 },
  { name: 'decor-sillplant', level: 2, x: 6, w: 6, bottom: COUNTER },
  { name: 'decor-hanging', level: 2, x: 2.5, w: 6, top: 11 },
  { name: 'decor-garland', level: 3, x: 24, w: 30, top: 12 },
  { name: 'decor-lamp', level: 2, x: 46, w: 4.5, top: 11 },
  { name: 'decor-lamp', level: 2, x: 61, w: 4.5, top: 11 },
  { name: 'decor-pic-cup', level: 3, x: 37.5, w: 4.5, top: 32 },
  { name: 'decor-shelf', level: 3, x: 25, w: 12, bottom: COUNTER },
  { name: 'decor-succulent', level: 3, x: 46, w: 4, bottom: COUNTER },
];

const pos = (x: number, w: number, bottom?: number, top?: number) => ({
  left: `${x - w / 2}%`,
  width: `${w}%`,
  ...(bottom !== undefined ? { bottom: `${100 - bottom}%` } : { top: `${top}%` }),
});

export function CafeArt({ levels }: { levels?: Partial<Record<CafeSlot, number>> }) {
  if (!levels) return <img class="scene scene-art" src={art('scene-cafe')} alt="" draggable={false} />;
  const lv = (k: CafeSlot) => Math.min(3, Math.max(1, levels[k] ?? 1));
  return (
    <div class="scene scene-art scene-layers">
      <img class="layer-base" src={art('scene-empty')} alt="" draggable={false} />
      {DECOR.filter((d) => lv('decor') >= d.level).map((d) => (
        <img class="layer" src={art(d.name)} style={pos(d.x, d.w, d.bottom, d.top)} alt="" draggable={false} />
      ))}
      {(['vitrine', 'machine'] as const).map((k) => {
        const e = EQUIP[k][lv(k) - 1];
        return <img class="layer" key={`${k}-${lv(k)}`} src={art(`${k}-${lv(k)}`)} style={pos(e.x, e.w, COUNTER)} alt="" draggable={false} />;
      })}
    </div>
  );
}

/** Столик на смене: картинка по уровню столиков, гость с чашкой или грязная посуда поверх. */
export function TableArt({ level, status, face }: { level: number; status: 'free' | 'busy' | 'dirty'; face?: string }) {
  return (
    <span class="table-art">
      <img class="table-img" src={art(`table-${Math.min(3, Math.max(1, level))}`)} alt="" draggable={false} />
      {status === 'busy' && <img class="table-over" src={art('table-cup')} alt="" draggable={false} />}
      {status === 'dirty' && <img class="table-over dishes" src={art('table-dishes')} alt="" draggable={false} />}
      {status === 'busy' && face && <span class="sitter">{face}</span>}
    </span>
  );
}
