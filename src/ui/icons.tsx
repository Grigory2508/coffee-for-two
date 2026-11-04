import { CAFE_DECOR_BY_ID, type CafeDecorSlot, type CafeSlot, type ComponentId, type StockId } from '../core/content';

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
const pos = (x: number, w: number, bottom?: number, top?: number) => ({
  left: `${x - w / 2}%`,
  width: `${w}%`,
  ...(bottom !== undefined ? { bottom: `${100 - bottom}%` } : { top: `${top}%` }),
});

export function CafeArt({ levels, decor, onSlot, active }: { levels?: Partial<Record<CafeSlot, number>>; decor?: Partial<Record<CafeDecorSlot, string>>; onSlot?: (s: CafeDecorSlot) => void; active?: CafeDecorSlot }) {
  if (!levels) return <img class="scene scene-art" src={art('scene-cafe')} alt="" draggable={false} />;
  const lv = (k: CafeSlot) => Math.min(3, Math.max(1, levels[k] ?? 1));
  const items = Object.values(decor ?? {})
    .map((id) => (id ? CAFE_DECOR_BY_ID[id] : undefined))
    .filter((d): d is NonNullable<typeof d> => !!d);
  return (
    <div class="scene scene-art scene-layers">
      <img class="layer-base" src={art('scene-empty')} alt="" draggable={false} />
      {items.flatMap((d) =>
        d.art.map((a) => (
          <img
            class={`layer ${onSlot ? 'tappable' : ''} ${active === d.slot ? 'active' : ''}`}
            src={art(a.name)}
            style={pos(a.x, a.w, a.bottom, a.top)}
            alt=""
            draggable={false}
            onClick={onSlot ? () => onSlot(d.slot) : undefined}
          />
        )),
      )}
      {(['vitrine', 'machine'] as const).map((k) => {
        const e = EQUIP[k][lv(k) - 1];
        return <img class="layer" key={`${k}-${lv(k)}`} src={art(`${k}-${lv(k)}`)} style={pos(e.x, e.w, COUNTER)} alt="" draggable={false} />;
      })}
    </div>
  );
}
