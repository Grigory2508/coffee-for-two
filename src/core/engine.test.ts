import { describe, expect, it } from 'vitest';
import { CONFIG, DRINKS } from './content';
import { apply, createCafe, digestFor, energyNow, getPlayer, matchesRecipe, NPC_ID, rating, weekId } from './engine';
import type { CafeState, Command, GuestResult } from './types';

const T0 = Date.UTC(2026, 10, 2, 9, 0, 0); // понедельник
const H = 3600_000;

function fresh(): CafeState {
  return createCafe({ code: 'TEST1', owner: { id: 'a', name: 'Аня' }, npcName: 'Артур', cafeName: 'Тест', now: T0 });
}

function run(s: CafeState, actor: string, cmd: Command, at: number) {
  return apply(s, { actor, cmd, at });
}

function perfectShift(s: CafeState, actor: string, at: number) {
  const started = run(s, actor, { type: 'startShift' }, at);
  const plan = started.shiftPlan!;
  const results: GuestResult[] = plan.guests.map((_, i) => ({ i, outcome: 'served', waitMs: 1000 }));
  return run(started.state, actor, { type: 'finishShift', results }, at + 60_000);
}

describe('создание и вступление', () => {
  it('кофейня стартует с владельцем и NPC-партнёром', () => {
    const s = fresh();
    expect(s.players.map((p) => p.id)).toEqual(['a', NPC_ID]);
    expect(s.money).toBe(CONFIG.startMoney);
  });

  it('партнёр занимает место NPC, третий не может войти', () => {
    let s = run(fresh(), 'b', { type: 'join', player: { id: 'b', name: 'Боря' } }, T0 + 1000).state;
    expect(s.players.map((p) => p.id)).toEqual(['a', 'b']);
    expect(() => run(s, 'c', { type: 'join', player: { id: 'c', name: 'Чужой' } }, T0 + 2000)).toThrow('cafe_full');
    // повторный вход своего — не ошибка
    s = run(s, 'b', { type: 'join', player: { id: 'b', name: 'Борис' } }, T0 + 3000).state;
    expect(getPlayer(s, 'b')!.name).toBe('Борис');
  });

  it('посторонний не может отдавать команды', () => {
    expect(() => run(fresh(), 'x', { type: 'buyStock', item: 'beans' }, T0)).toThrow('not_member');
  });
});

describe('энергия', () => {
  it('смена тратит энергию, она восстанавливается со временем', () => {
    let s = fresh();
    for (let i = 0; i < 3; i++) s = perfectShift(s, 'a', T0 + i * 120_000).state;
    const p = getPlayer(s, 'a')!;
    expect(energyNow(p, T0 + 400_000).energy).toBe(0);
    expect(() => run(s, 'a', { type: 'startShift' }, T0 + 400_000)).toThrow('no_energy');
    expect(energyNow(p, T0 + CONFIG.energyRegenMs + 1000).energy).toBe(1);
  });

  it('повторный startShift возобновляет смену без траты энергии', () => {
    const r1 = run(fresh(), 'a', { type: 'startShift' }, T0);
    const r2 = run(r1.state, 'a', { type: 'startShift' }, T0 + 5000);
    expect(r2.shiftPlan!.seed).toBe(r1.shiftPlan!.seed);
    expect(getPlayer(r2.state, 'a')!.energy).toBe(CONFIG.energyMax - 1);
  });
});

describe('смена', () => {
  it('идеальная смена приносит деньги, тратит склад и даёт рейтинг', () => {
    const before = fresh();
    const { state, summary } = perfectShift(before, 'a', T0);
    expect(summary!.served).toBeGreaterThan(0);
    expect(state.money).toBeGreaterThan(before.money);
    expect(state.stock.beans).toBeLessThan(before.stock.beans);
    expect(state.stats.shifts).toBe(1);
    expect(rating(state)).toBeGreaterThan(3.5);
  });

  it('гость уходит, если не хватает продуктов', () => {
    let s = fresh();
    s = { ...s, stock: { ...s.stock, beans: 0, milk: 0 } };
    const { summary } = perfectShift(s, 'a', T0);
    expect(summary!.served).toBe(0);
    expect(summary!.noStock).toBe(CONFIG.shiftGuests);
  });

  it('ушедшие гости роняют рейтинг', () => {
    const r = run(fresh(), 'a', { type: 'startShift' }, T0);
    const s = run(r.state, 'a', { type: 'finishShift', results: [] }, T0 + 80_000).state;
    expect(s.stats.guestsLost).toBe(CONFIG.shiftGuests);
    expect(rating(s)).toBe(0);
  });

  it('результаты с мусорными индексами игнорируются', () => {
    const r = run(fresh(), 'a', { type: 'startShift' }, T0);
    const results: GuestResult[] = [
      { i: 0, outcome: 'served', waitMs: 0 },
      { i: 0, outcome: 'served', waitMs: 0 },
      { i: 99, outcome: 'served', waitMs: 0 },
      { i: -1, outcome: 'served', waitMs: 0 },
    ];
    const { summary } = run(r.state, 'a', { type: 'finishShift', results }, T0 + 60_000);
    expect(summary!.served).toBeLessThanOrEqual(1);
  });

  it('рецепты сравниваются без учёта порядка', () => {
    expect(matchesRecipe(['foam', 'shot', 'milk'], 'cappuccino')).toBe(true);
    expect(matchesRecipe(['shot', 'milk'], 'cappuccino')).toBe(false);
    expect(DRINKS.latte.recipe).toHaveLength(4);
  });
});

describe('управление', () => {
  it('закупка тратит деньги и упирается во вместимость', () => {
    let s = fresh();
    s = run(s, 'a', { type: 'buyStock', item: 'beans' }, T0).state;
    expect(s.stock.beans).toBe(40);
    expect(() => run(s, 'a', { type: 'buyStock', item: 'beans' }, T0)).toThrow('capacity');
    expect(() => run(s, 'a', { type: 'buyStock', item: 'milk' }, T0)).toThrow('no_money');
  });

  it('новый напиток добавляется в меню', () => {
    let s = run(fresh(), 'a', { type: 'debugRefill' }, T0).state;
    s = run(s, 'a', { type: 'unlockDrink', id: 'latte' }, T0).state;
    expect(s.menu).toContain('latte');
    expect(() => run(s, 'a', { type: 'unlockDrink', id: 'latte' }, T0)).toThrow('owned');
  });
});

describe('ворота, комната, кот', () => {
  it('комната открывается после 3★ и 8 смен', () => {
    let s = run(fresh(), 'b', { type: 'join', player: { id: 'b', name: 'Боря' } }, T0).state;
    let t = T0;
    for (let i = 0; i < 8; i++) {
      const who = i % 2 ? 'b' : 'a';
      s = run(s, who, { type: 'debugRefill' }, t).state;
      s = run(s, who, { type: 'buyStock', item: 'milk' }, t).state; // молока хватает
      s = { ...s, stock: { ...s.stock, milk: 20, beans: 20 } };
      s = perfectShift(s, who, t).state;
      t += 10 * 60_000;
    }
    expect(s.room.unlocked).toBe(true);
    expect(s.log.some((e) => e.kind === 'room_unlocked')).toBe(true);

    s = run(s, 'a', { type: 'adoptCat', name: 'Барсик' }, t).state;
    expect(s.cat!.name).toBe('Барсик');
    s = run(s, 'b', { type: 'petCat' }, t).state;
    expect(() => run(s, 'b', { type: 'petCat' }, t + 1000)).toThrow('cooldown');
    // кот голодает со временем, но не умирает
    const later = run(s, 'a', { type: 'seen' }, t + 72 * H).state;
    expect(later.cat!.hunger).toBe(0);
    expect(later.log.some((e) => e.kind === 'cat_hungry')).toBe(true);
    const fed = run(later, 'a', { type: 'feedCat' }, t + 72 * H).state;
    expect(fed.cat!.hunger).toBe(50);

    s = run(fed, 'a', { type: 'buyDecor', id: 'plant-0' }, t + 72 * H).state;
    expect(s.room.placed.plant).toBe('plant-0');
  });

  it('декор нельзя купить до открытия комнаты', () => {
    const s = run(fresh(), 'a', { type: 'debugRefill' }, T0).state;
    expect(() => run(s, 'a', { type: 'buyDecor', id: 'plant-0' }, T0)).toThrow('room_locked');
  });
});

describe('NPC и сводка', () => {
  it('NPC работает за отсутствующего партнёра', () => {
    const s = run(fresh(), 'a', { type: 'seen' }, T0 + 13 * H).state;
    expect(s.log.filter((e) => e.kind === 'npc_shift')).toHaveLength(2);
  });

  it('сводка показывает только чужие действия после последнего визита', () => {
    let s = run(fresh(), 'b', { type: 'join', player: { id: 'b', name: 'Боря' } }, T0).state;
    s = run(s, 'a', { type: 'seen' }, T0 + 1000).state;
    s = run(s, 'b', { type: 'buyStock', item: 'beans' }, T0 + 2000).state;
    s = run(s, 'a', { type: 'postNote', text: 'привет' }, T0 + 3000).state;
    const d = digestFor(s, 'a');
    expect(d.map((e) => e.kind)).toEqual(['stock_bought']);
  });

  it('новая неделя обнуляет очки', () => {
    let s = perfectShift(fresh(), 'a', T0).state;
    expect(s.week.points).toBeGreaterThan(0);
    s = run(s, 'a', { type: 'seen' }, T0 + 8 * 24 * H).state;
    expect(s.week.points).toBe(0);
    expect(s.week.id).toBe(weekId(T0 + 8 * 24 * H));
  });
});
