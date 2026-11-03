import { describe, expect, it } from 'vitest';
import { CONFIG, DRINKS, type Role } from './content';
import { apply, createCafe, digestFor, energyNow, getPlayer, matchesRecipe, migrate, NPC_ID, npcCoveredRoles, rating, weekId } from './engine';
import type { CafeState, Command, GuestResult } from './types';

const T0 = Date.UTC(2026, 10, 2, 9, 0, 0); // понедельник
const H = 3600_000;

function fresh(role: Role = 'barista'): CafeState {
  return createCafe({ code: 'TEST1', owner: { id: 'a', name: 'Аня' }, role, npcName: 'Артур', cafeName: 'Тест', now: T0 });
}

function run(s: CafeState, actor: string, cmd: Command, at: number) {
  return apply(s, { actor, cmd, at });
}

function join(s: CafeState, id = 'b', at = T0) {
  return run(s, id, { type: 'join', player: { id, name: id.toUpperCase() }, key: s.inviteKey }, at).state;
}

function perfectShift(s: CafeState, actor: string, at: number) {
  const started = run(s, actor, { type: 'startShift' }, at);
  const plan = started.shiftPlan!;
  const results: GuestResult[] = plan.guests.map((_, i) => ({ i, outcome: 'served', waitMs: 1000 }));
  return run(started.state, actor, { type: 'finishShift', results, cleanliness: 1 }, at + 60_000);
}

describe('создание и вступление', () => {
  it('создатель выбирает роль, NPC получает вторую', () => {
    const s = fresh('manager');
    expect(getPlayer(s, 'a')!.role).toBe('manager');
    expect(getPlayer(s, NPC_ID)!.role).toBe('barista');
    expect(s.ownerId).toBe('a');
  });

  it('напарник по приглашению получает свободную роль; третий не войдёт', () => {
    const s = join(fresh('barista'));
    expect(getPlayer(s, 'b')!.role).toBe('manager');
    expect(() => run(s, 'c', { type: 'join', player: { id: 'c', name: 'C' }, key: s.inviteKey }, T0)).toThrow('cafe_full');
  });

  it('без верного ключа приглашения войти нельзя', () => {
    expect(() => run(fresh(), 'b', { type: 'join', player: { id: 'b', name: 'B' }, key: 'WRONG' }, T0)).toThrow('invite_expired');
  });

  it('посторонний не может отдавать команды', () => {
    expect(() => run(fresh(), 'x', { type: 'startShift' }, T0)).toThrow('not_member');
  });
});

describe('роли', () => {
  it('бариста не может закупаться, управляющий не может работать за стойкой', () => {
    const s = join(fresh('barista'));
    expect(() => run(s, 'a', { type: 'supplyRun', items: { beans: 1 } }, T0)).toThrow('wrong_role');
    expect(() => run(s, 'a', { type: 'unlockDrink', id: 'latte' }, T0)).toThrow('wrong_role');
    expect(() => run(s, 'b', { type: 'startShift' }, T0)).toThrow('wrong_role');
    expect(() => run(s, 'a', { type: 'launchMarketing', id: 'flyers' }, T0)).toThrow('wrong_role');
  });

  it('обмен ролями только по согласию обоих', () => {
    let s = join(fresh('barista'));
    s = run(s, 'a', { type: 'proposeSwap' }, T0).state;
    expect(getPlayer(s, 'a')!.role).toBe('barista'); // ещё не поменялись
    expect(() => run(s, 'a', { type: 'acceptSwap' }, T0)).toThrow('no_swap'); // сам себе не подтвердит
    s = run(s, 'b', { type: 'acceptSwap' }, T0 + 1000).state;
    expect(getPlayer(s, 'a')!.role).toBe('manager');
    expect(getPlayer(s, 'b')!.role).toBe('barista');
    expect(s.swap).toBeNull();
  });

  it('предложение можно отклонить', () => {
    let s = join(fresh('barista'));
    s = run(s, 'a', { type: 'proposeSwap' }, T0).state;
    s = run(s, 'b', { type: 'declineSwap' }, T0).state;
    expect(s.swap).toBeNull();
    expect(getPlayer(s, 'a')!.role).toBe('barista');
  });

  it('с соседом-NPC роли меняются сразу', () => {
    const s = run(fresh('barista'), 'a', { type: 'proposeSwap' }, T0).state;
    expect(getPlayer(s, 'a')!.role).toBe('manager');
    expect(getPlayer(s, NPC_ID)!.role).toBe('barista');
  });

  it('нельзя меняться посреди смены', () => {
    let s = join(fresh('barista'));
    s = run(s, 'a', { type: 'startShift' }, T0).state;
    expect(() => run(s, 'b', { type: 'proposeSwap' }, T0)).toThrow('shift_in_progress');
  });
});

describe('силы', () => {
  it('смена баристы тратит силу, силы восстанавливаются', () => {
    let s = fresh('barista');
    for (let i = 0; i < 3; i++) s = perfectShift(s, 'a', T0 + i * 120_000).state;
    const p = getPlayer(s, 'a')!;
    expect(energyNow(p, T0 + 400_000).energy).toBe(0);
    expect(() => run(s, 'a', { type: 'startShift' }, T0 + 400_000)).toThrow('no_energy');
    expect(energyNow(p, T0 + CONFIG.energyRegenMs + 1000).energy).toBe(1);
  });

  it('у управляющего свои силы: поездка, расширение, реклама — по 1, меню бесплатно', () => {
    let s: CafeState = { ...fresh('manager'), money: 5000 };
    s = run(s, 'a', { type: 'supplyRun', items: { beans: 1, syrup: 1 } }, T0).state;
    expect(s.stock.beans).toBe(40);
    expect(s.stock.syrup).toBe(10);
    s = run(s, 'a', { type: 'unlockDrink', id: 'latte' }, T0).state;
    expect(getPlayer(s, 'a')!.energy).toBe(2);
    s = run(s, 'a', { type: 'buyUpgrade', id: 'terrace' }, T0).state;
    s = run(s, 'a', { type: 'launchMarketing', id: 'flyers' }, T0).state;
    expect(getPlayer(s, 'a')!.energy).toBe(0);
    expect(() => run(s, 'a', { type: 'supplyRun', items: { milk: 1 } }, T0)).toThrow('no_energy');
  });

  it('поездка упирается во вместимость склада и деньги', () => {
    const s = fresh('manager');
    expect(() => run(s, 'a', { type: 'supplyRun', items: { beans: 2 } }, T0)).toThrow('capacity');
    expect(() => run(s, 'a', { type: 'supplyRun', items: { cocoa: 3 } }, T0)).toThrow('no_money');
    expect(() => run(s, 'a', { type: 'supplyRun', items: {} }, T0)).toThrow('empty_order');
  });
});

describe('смена', () => {
  it('идеальная смена приносит деньги, тратит склад и даёт рейтинг', () => {
    const before = fresh();
    const { state, summary } = perfectShift(before, 'a', T0);
    expect(summary!.served).toBeGreaterThan(0);
    expect(state.money).toBeGreaterThan(before.money);
    expect(state.stock.beans).toBeLessThan(before.stock.beans);
    expect(rating(state)).toBeGreaterThan(3.5);
  });

  it('грязные столики снижают рейтинг', () => {
    const clean = perfectShift(fresh(), 'a', T0).state;
    const r = run(fresh(), 'a', { type: 'startShift' }, T0);
    const results = r.shiftPlan!.guests.map((_, i) => ({ i, outcome: 'served' as const, waitMs: 1000 }));
    const dirty = run(r.state, 'a', { type: 'finishShift', results, cleanliness: 0 }, T0 + 60_000).state;
    expect(rating(dirty)!).toBeLessThan(rating(clean)!);
  });

  it('веранда и реклама добавляют гостей; реклама кончается через 3 смены', () => {
    let s = join(fresh('barista'));
    s = { ...run(s, 'b', { type: 'debugRefill' }, T0).state, money: 5000 };
    s = run(s, 'b', { type: 'buyUpgrade', id: 'terrace' }, T0).state;
    s = run(s, 'b', { type: 'launchMarketing', id: 'flyers' }, T0).state;
    const r = run(s, 'a', { type: 'startShift' }, T0);
    expect(r.shiftPlan!.guests).toHaveLength(CONFIG.shiftGuests + 2);
    expect(r.shiftPlan!.tables).toBe(CONFIG.tablesBase + CONFIG.terraceTables);
    expect(r.state.marketing!.shiftsLeft).toBe(2);
  });

  it('гость уходит, если не хватает продуктов', () => {
    let s = fresh();
    s = { ...s, stock: { ...s.stock, beans: 0, milk: 0 } };
    const { summary } = perfectShift(s, 'a', T0);
    expect(summary!.served).toBe(0);
  });

  it('рецепты сравниваются без учёта порядка', () => {
    expect(matchesRecipe(['foam', 'shot', 'milk'], 'cappuccino')).toBe(true);
    expect(matchesRecipe(['shot', 'milk'], 'cappuccino')).toBe(false);
    expect(DRINKS.latte.recipe).toHaveLength(4);
  });
});

describe('напарник: NPC, замена, выход', () => {
  it('пока места свободно, сосед работает в свободной роли', () => {
    const s = run(fresh('barista'), 'a', { type: 'seen' }, T0 + 13 * H).state; // сосед — управляющий
    expect(s.log.some((e) => e.kind === 'npc_shift')).toBe(false);
    const s2 = run(fresh('manager'), 'a', { type: 'seen' }, T0 + 13 * H).state; // сосед — бариста
    expect(s2.log.filter((e) => e.kind === 'npc_shift')).toHaveLength(2);
  });

  it('сосед подхватывает роль пропавшего на сутки напарника', () => {
    let s = join(fresh('barista'));
    expect(npcCoveredRoles(s, T0 + H)).toEqual([]);
    // Аня (бариста) действует, Боря (управляющий) пропал
    s = { ...s, money: 2000, stock: { ...s.stock, beans: 5, milk: 5 } };
    for (let t = T0 + 6 * H; t <= T0 + 30 * H; t += 6 * H) s = run(s, 'a', { type: 'postNote', text: '.' }, t).state;
    expect(npcCoveredRoles(s, T0 + 30 * H)).toEqual(['manager']);
    expect(s.log.some((e) => e.kind === 'npc_cover')).toBe(true);
    expect(s.stock.beans).toBeGreaterThan(5);
  });

  it('создатель меняет напарника — старое приглашение сгорает', () => {
    let s = join(fresh('barista'));
    const oldKey = s.inviteKey;
    expect(() => run(s, 'b', { type: 'replacePartner' }, T0)).toThrow('owner_only');
    s = run(s, 'a', { type: 'replacePartner' }, T0).state;
    expect(getPlayer(s, 'b')).toBeUndefined();
    expect(getPlayer(s, NPC_ID)!.role).toBe('manager');
    expect(s.inviteKey).not.toBe(oldKey);
    expect(() => run(s, 'b', { type: 'join', player: { id: 'b', name: 'B' }, key: oldKey }, T0)).toThrow('invite_expired');
    s = join(s, 'c');
    expect(getPlayer(s, 'c')!.role).toBe('manager');
  });

  it('напарник может выйти, создатель — нет', () => {
    let s = join(fresh('barista'));
    expect(() => run(s, 'a', { type: 'leaveCafe' }, T0)).toThrow('owner_cannot_leave');
    s = run(s, 'b', { type: 'leaveCafe' }, T0).state;
    expect(getPlayer(s, 'b')).toBeUndefined();
    expect(s.players.some((p) => p.isNpc)).toBe(true);
  });
});

describe('ворота, квартира, кот', () => {
  it('квартира открывается после 3★ и 8 смен; быт доступен обоим', () => {
    let s = join(fresh('barista'));
    let t = T0;
    for (let i = 0; i < 8; i++) {
      s = run(s, 'a', { type: 'debugRefill' }, t).state;
      s = { ...s, stock: { ...s.stock, milk: 20, beans: 20 } };
      s = perfectShift(s, 'a', t).state;
      t += 10 * 60_000;
    }
    expect(s.room.unlocked).toBe(true);
    s = run(s, 'b', { type: 'adoptCat', name: 'Барсик' }, t).state; // управляющий тоже может
    s = run(s, 'a', { type: 'feedCat' }, t).state;
    s = run(s, 'b', { type: 'buyDecor', id: 'plant-0' }, t).state;
    expect(s.room.placed.plant).toBe('plant-0');
  });
});

describe('сводка, неделя, миграция', () => {
  it('сводка показывает только чужие действия после последнего визита', () => {
    let s = join(fresh('barista'));
    s = run(s, 'a', { type: 'seen' }, T0 + 1000).state;
    s = run(s, 'b', { type: 'supplyRun', items: { syrup: 1 } }, T0 + 2000).state;
    s = run(s, 'a', { type: 'postNote', text: 'привет' }, T0 + 3000).state;
    expect(digestFor(s, 'a').map((e) => e.kind)).toEqual(['supply_run']);
  });

  it('новая неделя обнуляет очки', () => {
    let s = perfectShift(fresh(), 'a', T0).state;
    s = run(s, 'a', { type: 'seen' }, T0 + 8 * 24 * H).state;
    expect(s.week.points).toBe(0);
    expect(s.week.id).toBe(weekId(T0 + 8 * 24 * H));
  });

  it('старое сохранение без ролей получает роли', () => {
    const old = fresh() as unknown as Record<string, unknown>;
    delete old.ownerId;
    delete old.inviteKey;
    delete old.swap;
    (old.players as Record<string, unknown>[]).forEach((p) => {
      delete p.role;
      delete p.lastActionAt;
    });
    const m = migrate(old as unknown as CafeState);
    expect(m.players.map((p) => p.role)).toEqual(['barista', 'manager']);
    expect(m.ownerId).toBe('a');
    expect(m.inviteKey).toHaveLength(5);
  });
});
