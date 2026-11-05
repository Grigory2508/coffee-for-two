import { expectedCup } from '../core/assembly';
import { BASES, FLAVORS, MILKS, TEXTURES, TOPPINGS, VESSELS, type DrinkId } from '../core/content';
import { L } from '../i18n';
import { Img } from './icons';

/** Рецепт иконками по шагам — шпаргалка в меню дня и в каталоге. */
export function RecipeIcons({ drink, size = 18 }: { drink: DrinkId; size?: number }) {
  const c = expectedCup({ order: drink, milk: 'regular' });
  const items: { name: string; title: string; mark?: string }[] = [];
  if (c.vessel) items.push({ name: `vessel-${c.vessel}`, title: L(VESSELS[c.vessel].name) });
  if (c.ice) items.push({ name: 'act-ice', title: '❄' });
  if (c.base) items.push({ name: `base-${c.base}`, title: L(BASES[c.base].name) });
  if (c.flavor) items.push({ name: `syr-${c.flavor}`, title: L(FLAVORS[c.flavor].name) });
  if (c.dairy) items.push({ name: `${c.dairy.type}-regular`, title: c.dairy.type === 'milk' ? L(MILKS.regular.name) : L(MILKS.regular.cream), mark: c.dairy.temp === 'hot' ? '♨' : '❄' });
  if (c.texture) items.push({ name: `tex-${c.texture}`, title: L(TEXTURES[c.texture]) });
  if (c.whip) items.push({ name: 'act-whip', title: '↻' });
  if (c.water) items.push({ name: 'act-water', title: '💧' });
  if (c.topping) items.push({ name: `top-${c.topping}`, title: L(TOPPINGS[c.topping].name) });
  return (
    <span class="recipe-icons">
      {items.map((x) => (
        <span class="ri" title={x.title}>
          <Img name={x.name} size={size} alt={x.title} />
          {x.mark && <i>{x.mark}</i>}
        </span>
      ))}
    </span>
  );
}
