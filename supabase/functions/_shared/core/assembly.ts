// Сборка напитка по шагам — общая логика для смены (клиент) и тестов.
// Конец сборки решает игрок («Подать»); игра сама пропускает только логически невозможные шаги.
import {
  BASES,
  DRINKS,
  STEP_ORDER,
  VESSELS,
  dairyStock,
  expectedVessel,
  type Base,
  type DairyPick,
  type DessertId,
  type DrinkId,
  type FlavorId,
  type MilkKind,
  type StepId,
  type StockId,
  type Texture,
  type ToppingId,
  type Vessel,
} from './menu.ts';

export interface Cup {
  vessel?: Vessel;
  ice?: boolean;
  base?: Base;
  flavor?: FlavorId;
  dairy?: DairyPick;
  texture?: Texture;
  whip?: boolean;
  water?: boolean;
  topping?: ToppingId;
}

export interface OrderLike {
  order: DrinkId;
  milk: MilkKind;
  takeaway?: boolean;
  dessert?: DessertId;
}

/** Можно ли вообще делать этот шаг при том, что уже в чашке (а не по заказу — иначе шаги подсказывали бы рецепт). */
export function stepApplies(step: StepId, cup: Cup): boolean {
  switch (step) {
    case 'ice':
      return !!cup.vessel && !VESSELS[cup.vessel].ceramic;
    case 'texture':
      return cup.dairy?.type === 'milk' && cup.dairy.temp === 'hot';
    case 'whip':
      return cup.dairy?.type === 'cream';
    default:
      return true;
  }
}

/** Следующий доступный шаг после from (null — шагов больше нет). */
export function nextStep(cup: Cup, from: StepId | null): StepId | null {
  let i = from ? STEP_ORDER.indexOf(from) + 1 : 0;
  for (; i < STEP_ORDER.length; i++) if (stepApplies(STEP_ORDER[i], cup)) return STEP_ORDER[i];
  return null;
}

/** Каким должен быть напиток для этого гостя. */
export function expectedCup(o: OrderLike): Cup {
  const r = DRINKS[o.order].recipe;
  return {
    vessel: expectedVessel(o.order, !!o.takeaway),
    ice: !!r.ice,
    base: r.base,
    flavor: r.flavor,
    dairy: r.dairy ? { kind: o.milk, type: r.dairy.type, temp: r.dairy.temp } : undefined,
    texture: r.texture,
    whip: !!r.whip,
    water: !!r.water,
    topping: r.topping,
  };
}

/** На каких шагах собранное расходится с заказом (пусто — всё верно). */
export function cupDiff(cup: Cup, exp: Cup): StepId[] {
  const out: StepId[] = [];
  if (cup.vessel !== exp.vessel) out.push('vessel');
  if (!!cup.ice !== !!exp.ice) out.push('ice');
  if (cup.base !== exp.base) out.push('base');
  if (cup.flavor !== exp.flavor) out.push('flavor');
  const a = cup.dairy;
  const b = exp.dairy;
  if (!!a !== !!b || (a && b && (a.kind !== b.kind || a.type !== b.type || a.temp !== b.temp))) out.push('dairy');
  if (cup.texture !== exp.texture) out.push('texture');
  if (!!cup.whip !== !!exp.whip) out.push('whip');
  if (!!cup.water !== !!exp.water) out.push('water');
  if (cup.topping !== exp.topping) out.push('topping');
  return out;
}

/** Что уйдёт со склада на эту чашку. */
export function cupUsage(cup: Cup): Partial<Record<StockId, number>> {
  const use: Partial<Record<StockId, number>> = {};
  if (cup.base) use.beans = BASES[cup.base].beans;
  if (cup.flavor) use[`syr_${cup.flavor}`] = 1;
  if (cup.dairy) use[dairyStock(cup.dairy.kind, cup.dairy.type)] = 1;
  if (cup.vessel === 'paper') use.cups = 1;
  return use;
}
