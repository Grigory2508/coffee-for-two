import { describe, expect, it } from 'vitest';
import { apply, createCafe } from '../core/engine';
import type { CafeState } from '../core/types';
import { fillBasket, perShift } from './stock';

const T0 = Date.UTC(2026, 10, 2, 9, 0, 0);
const cafe = (): CafeState => createCafe({ code: 'T', owner: { id: 'm', name: 'М' }, role: 'manager', npcName: 'Н', cafeName: 'Т', now: T0 });

describe('склад: «пополнить до нормы» и холодильник', () => {
  it('без холодильника под овсяное альтернативное молоко не считается нужным', () => {
    const s = cafe();
    expect(s.levels.fridge).toBe(1);
    expect(perShift(s, 'milk_oat')).toBe(0);
    expect(perShift(s, 'milk_lactoFree')).toBe(0);
  });

  it('корзина сначала закрывает нужное меню, а не набивает самое пустое до потолка', () => {
    const s = cafe();
    s.stock.beans = 0;
    s.stock.milk_regular = 6;
    s.money = 900; // хватит на зёрна до нормы, но не на всё до потолка
    const b = fillBasket(s, 'm');
    expect(b.milk_oat).toBeUndefined();
    expect(b.beans).toBeGreaterThan(0);
    expect(b.milk_regular).toBeGreaterThan(0);
  });

  it('сервер не продаёт молоко, которое холодильник не держит', () => {
    const s = cafe();
    s.money = 5000;
    expect(() => apply(s, { actor: 'm', cmd: { type: 'supplyRun', items: { milk_oat: 1 } }, at: T0 })).toThrow('no_fridge');
    s.levels.fridge = 2;
    expect(() => apply(s, { actor: 'm', cmd: { type: 'supplyRun', items: { milk_oat: 1 } }, at: T0 })).not.toThrow();
  });
});
