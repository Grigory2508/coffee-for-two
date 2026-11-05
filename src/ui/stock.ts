import { CONFIG, STOCK_ORDER, type StockId } from '../core/content';
import { availableMilks, capacity, guestsPerShift, packPrice, todayMenu } from '../core/engine';
import { recipeUsage } from '../core/content';
import type { CafeState } from '../core/types';
import { STOCK_PACKS } from '../core/content';

/** Сколько единиц продукта уходит за одну смену по меню дня (в среднем). */
export function perShift(s: CafeState, item: StockId): number {
  if (item === 'cups') return guestsPerShift(s) * CONFIG.takeawayShare;
  const menu = todayMenu(s);
  if (!menu.length) return 0;
  let sum = 0;
  if (item.startsWith('ds_')) return 0; // десерты — по витрине, не по меню
  for (const d of menu) sum += recipeUsage(d)[item] ?? 0;
  // ~15% гостей просят альтернативное молоко — его тоже нужно немного
  if (item.startsWith('milk_') || item.startsWith('cream_')) {
    const kind = item.split('_')[1];
    if (!availableMilks(s).includes(kind as never)) return 0; // холодильник такой вид не держит
    const type = item.startsWith('milk_') ? 'milk' : 'cream';
    const dairyShare = menu.filter((d) => recipeUsage(d)[`${type}_regular` as StockId]).length / menu.length;
    if (kind !== 'regular') return s.levels && dairyShare ? CONFIG.altMilkShare * 0.4 * dairyShare * guestsPerShift(s) : 0;
  }
  return (sum / menu.length) * guestsPerShift(s);
}

/** На сколько смен хватит запаса (Infinity — продукт меню дня не нужен). */
export function shiftsLeft(s: CafeState, item: StockId): number {
  const use = perShift(s, item);
  return use > 0 ? s.stock[item] / use : Infinity;
}

/** Продукты меню дня, которых не хватит на следующую смену. */
export function lowStock(s: CafeState): StockId[] {
  return STOCK_ORDER.filter((k) => shiftsLeft(s, k) < 1);
}

/** Склад по срочности: сначала то, что кончится раньше. */
export function stockByUrgency(s: CafeState): StockId[] {
  return [...STOCK_ORDER].sort((a, b) => shiftsLeft(s, a) - shiftsLeft(s, b));
}

/** Корзина «до нормы»: сначала каждому продукту меню — запас на FILL_SHIFTS смен по срочности,
 *  потом, если остались деньги, — до полного склада. Иначе дорогой первый продукт съедал весь бюджет. */
const FILL_SHIFTS = 3;
export function fillBasket(s: CafeState, actor: string): Partial<Record<StockId, number>> {
  const basket: Partial<Record<StockId, number>> = {};
  let money = s.money;
  const order = stockByUrgency(s).filter((k) => perShift(s, k) > 0);
  const have = (k: StockId) => s.stock[k] + STOCK_PACKS[k].amount * (basket[k] ?? 0);
  for (const pass of [0, 1] as const) {
    for (const k of order) {
      const pack = STOCK_PACKS[k];
      const price = packPrice(s, actor, k);
      const target = pass === 0 ? Math.min(capacity(s, k), perShift(s, k) * FILL_SHIFTS) : capacity(s, k);
      while (have(k) < target && have(k) + pack.amount <= capacity(s, k) && money >= price) {
        basket[k] = (basket[k] ?? 0) + 1;
        money -= price;
      }
    }
  }
  return basket;
}
