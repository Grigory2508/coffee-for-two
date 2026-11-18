// Каждый рецепт должен собираться шагами смены: шаг доступен (stepApplies) и после него сборка совпадает с заказом.
import { describe, expect, it } from 'vitest';
import { cupDiff, cupUsage, expectedCup, nextStep, stepApplies, type Cup } from './assembly.ts';
import { ALL_STOCK, BASE_ORDER, BASES, DESSERT_ORDER, DESSERTS, DRINK_LIST, DRINKS, FLAVOR_ORDER, FLAVORS, MILK_ORDER, TEXTURE_ORDER, TEXTURES, TOPPING_ORDER, TOPPINGS, VESSEL_ORDER, VESSELS, type StepId } from './menu.ts';

/** Собираем чашку так, как это делает игрок: идём по доступным шагам и выбираем то, что в заказе. */
function assemble(exp: Cup): Cup {
  const cup: Cup = {};
  let step: StepId | null = nextStep(cup, null);
  let guard = 0;
  while (step && guard++ < 20) {
    if (!stepApplies(step, cup)) throw new Error(`шаг ${step} недоступен`);
    switch (step) {
      case 'vessel': cup.vessel = exp.vessel; break;
      case 'ice': if (exp.ice) cup.ice = true; break;
      case 'base': cup.base = exp.base; break;
      case 'flavor': if (exp.flavor) cup.flavor = exp.flavor; break;
      case 'dairy': if (exp.dairy) cup.dairy = exp.dairy; break;
      case 'texture': if (exp.texture) cup.texture = exp.texture; break;
      case 'whip': if (exp.whip) cup.whip = true; break;
      case 'water': if (exp.water) cup.water = true; break;
      case 'topping': if (exp.topping) cup.topping = exp.topping; break;
    }
    step = nextStep(cup, step);
  }
  return cup;
}

describe('все рецепты собираются по шагам смены', () => {
  for (const d of DRINK_LIST) {
    const milks = d.recipe.dairy ? MILK_ORDER : (['regular'] as const);
    for (const milk of milks) {
      for (const takeaway of [false, true]) {
        it(`${d.id} · ${milk} · ${takeaway ? 'с собой' : 'здесь'}`, () => {
          const exp = expectedCup({ order: d.id, milk, takeaway });
          const cup = assemble(exp);
          expect(cupDiff(cup, exp)).toEqual([]);
          // лёд только в бумажном/высоком (не в керамике)
          if (exp.ice) expect(VESSELS[exp.vessel!].ceramic).toBe(false);
          // всё, что уходит со склада, есть в каталоге склада
          for (const k of Object.keys(cupUsage(cup))) expect(ALL_STOCK).toContain(k);
        });
      }
    }
  }
});

describe('справочники рецептов', () => {
  it('в панели смены есть кнопка для каждого значения', () => {
    expect([...FLAVOR_ORDER].sort()).toEqual(Object.keys(FLAVORS).sort());
    expect([...TOPPING_ORDER].sort()).toEqual(Object.keys(TOPPINGS).sort());
    expect([...VESSEL_ORDER].sort()).toEqual(Object.keys(VESSELS).sort());
    expect([...BASE_ORDER].sort()).toEqual(Object.keys(BASES).sort());
    expect([...TEXTURE_ORDER].sort()).toEqual(Object.keys(TEXTURES).sort());
    expect([...DESSERT_ORDER].sort()).toEqual(Object.keys(DESSERTS).sort());
  });
  it('у каждого напитка есть основа, цена и известные добавки', () => {
    for (const d of DRINK_LIST) {
      expect(BASES[d.recipe.base], d.id).toBeTruthy();
      expect(d.price, d.id).toBeGreaterThan(0);
      if (d.recipe.flavor) expect(FLAVORS[d.recipe.flavor], d.id).toBeTruthy();
      if (d.recipe.topping) expect(TOPPINGS[d.recipe.topping], d.id).toBeTruthy();
    }
  });
  it('десерты ссылаются на существующие напитки и есть на складе', () => {
    for (const [id, ds] of Object.entries(DESSERTS)) {
      expect(DRINKS[ds.pair], id).toBeTruthy();
      expect(ALL_STOCK).toContain(`ds_${id}`);
    }
  });
  it('разные напитки различимы сборкой (иначе гость не поймёт заказ)', () => {
    const seen = new Map<string, string>();
    for (const d of DRINK_LIST) {
      const key = JSON.stringify(expectedCup({ order: d.id, milk: 'regular' }));
      expect(seen.get(key), `${d.id} = ${seen.get(key)}`).toBeUndefined();
      seen.set(key, d.id);
    }
  });
});
