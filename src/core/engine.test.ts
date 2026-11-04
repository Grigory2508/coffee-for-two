import { describe, expect, it } from 'vitest';
import { CONFIG, DECOR_BY_ID, DRINKS, type Role } from './content';
import { apply, createCafe, digestFor, energyNow, happyRatingMult, vitalsNow, freeRoles, getPlayer, matchesRecipe, migrate, NPC_ID, npcCoveredRoles, rating, roleCount, todayMenu, weekId } from './engine';
import type { CafeState, Command, GuestResult } from './types';

const T0 = Date.UTC(2026, 10, 2, 9, 0, 0); // понедельник
const H = 3600_000;

function fresh(role: Role = 'barista'): CafeState {
  return createCafe({ code: 'TEST1', owner: { id: 'a', name: 'Аня' }, role, npcName: 'Артур', cafeName: 'Тест', now: T0 });
}

function run(s: CafeState, actor: string, cmd: Command, at: number) {
  return apply(s, { actor, cmd, at });
}

/** Заявка + одобрение всеми текущими сотрудниками. */
function join(s: CafeState, id = 'b', at = T0, role?: Role) {
  const free = freeRoles(s);
  const r: Role = role ?? (free.includes('manager') && roleCount(s, 'manager') === 0 ? 'manager' : free.includes('barista') && roleCount(s, 'barista') === 0 ? 'barista' : free[0]);
  s = run(s, id, { type: 'apply', player: { id, name: id.toUpperCase() }, key: s.inviteKey, role: r }, at).state;
  for (const h of s.players.filter((p) => !p.isNpc)) s = run(s, h.id, { type: 'approveApplication', id }, at).state;
  return s;
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

  it('новичок попадает в команду, только когда одобрили все', () => {
    let s = join(fresh('barista'), 'b'); // b — менеджер, сосед ушёл
    expect(getPlayer(s, 'b')!.role).toBe('manager');
    expect(s.players.some((p) => p.isNpc)).toBe(false);
    s = run(s, 'c', { type: 'apply', player: { id: 'c', name: 'C' }, key: s.inviteKey, role: 'barista' }, T0).state;
    expect(getPlayer(s, 'c')).toBeUndefined();
    s = run(s, 'a', { type: 'approveApplication', id: 'c' }, T0).state;
    expect(getPlayer(s, 'c')).toBeUndefined(); // b ещё не одобрил
    s = run(s, 'b', { type: 'approveApplication', id: 'c' }, T0).state;
    expect(getPlayer(s, 'c')!.role).toBe('barista');
  });

  it('один отказ снимает заявку; заявка сгорает через 48 ч', () => {
    let s = join(fresh('barista'));
    s = run(s, 'c', { type: 'apply', player: { id: 'c', name: 'C' }, key: s.inviteKey, role: 'barista' }, T0).state;
    s = run(s, 'b', { type: 'rejectApplication', id: 'c' }, T0).state;
    expect(s.applications).toHaveLength(0);
    s = run(s, 'd', { type: 'apply', player: { id: 'd', name: 'D' }, key: s.inviteKey, role: 'barista' }, T0).state;
    s = run(s, 'a', { type: 'seen' }, T0 + 49 * H).state;
    expect(s.applications).toHaveLength(0);
  });

  it('лимиты: до 5 человек, до 4 барист, до 2 менеджеров', () => {
    let s = join(fresh('barista'), 'b', T0, 'manager');
    s = join(s, 'c', T0, 'manager');
    expect(() => run(s, 'd', { type: 'apply', player: { id: 'd', name: 'D' }, key: s.inviteKey, role: 'manager' }, T0)).toThrow('role_full');
    s = join(s, 'd', T0, 'barista');
    s = join(s, 'e', T0, 'barista');
    expect(s.players.filter((p) => !p.isNpc)).toHaveLength(5);
    expect(() => run(s, 'f', { type: 'apply', player: { id: 'f', name: 'F' }, key: s.inviteKey, role: 'barista' }, T0)).toThrow('cafe_full');
    expect(freeRoles(s)).toEqual([]);
  });

  it('без верного ключа приглашения заявку не подать', () => {
    expect(() => run(fresh(), 'b', { type: 'apply', player: { id: 'b', name: 'B' }, key: 'WRONG', role: 'manager' }, T0)).toThrow('invite_expired');
  });

  it('посторонний не может отдавать команды', () => {
    expect(() => run(fresh(), 'x', { type: 'startShift' }, T0)).toThrow('not_member');
  });
});

describe('касса, кабинет, смена роли', () => {
  it('касса одна: пока один бариста на смене, второй не может встать', () => {
    let s = join(join(fresh('barista')), 'c', T0, 'barista');
    s = run(s, 'a', { type: 'startShift' }, T0).state;
    expect(() => run(s, 'c', { type: 'startShift' }, T0 + 1000)).toThrow('counter_busy');
    // смена кончилась — касса свободна
    expect(run(s, 'c', { type: 'startShift' }, T0 + CONFIG.shiftDurationMs + 61_000).shiftPlan).toBeTruthy();
  });

  it('кабинет один: второй менеджер ждёт 3 минуты или выхода первого', () => {
    let s = join(join(fresh('barista')), 'c', T0, 'manager'); // b и c — менеджеры
    s = run(s, 'b', { type: 'enterOffice' }, T0).state;
    expect(() => run(s, 'c', { type: 'enterOffice' }, T0 + 1000)).toThrow('office_busy');
    expect(() => run(s, 'c', { type: 'unlockDrink', id: 'latte' }, T0 + 1000)).toThrow('office_busy');
    s = run(s, 'b', { type: 'leaveOffice' }, T0 + 2000).state;
    s = run(s, 'c', { type: 'enterOffice' }, T0 + 3000).state;
    expect(s.office!.by).toBe('c');
    expect(() => run(s, 'b', { type: 'enterOffice' }, T0 + 4000)).toThrow('office_busy');
    expect(run(s, 'b', { type: 'enterOffice' }, T0 + 3000 + CONFIG.officeHoldMs + 1).state.office!.by).toBe('b');
  });

  it('смена роли: можно в свободную, нельзя оставить роль без людей', () => {
    let s = join(fresh('barista')); // a — бариста, b — менеджер
    expect(() => run(s, 'a', { type: 'switchRole', role: 'manager' }, T0)).toThrow('last_in_role');
    s = join(s, 'c', T0, 'barista');
    s = run(s, 'a', { type: 'switchRole', role: 'manager' }, T0).state;
    expect(getPlayer(s, 'a')!.role).toBe('manager');
    s = join(s, 'd', T0, 'barista');
    // менеджеров уже двое (a, b) — третий нельзя
    expect(() => run(s, 'd', { type: 'switchRole', role: 'manager' }, T0)).toThrow('role_full');
  });

  it('один в кофейне меняет роль сам — сосед занимает освободившуюся', () => {
    const s = run(fresh('barista'), 'a', { type: 'switchRole', role: 'manager' }, T0).state;
    expect(getPlayer(s, 'a')!.role).toBe('manager');
    expect(getPlayer(s, NPC_ID)!.role).toBe('barista');
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
    for (let i = 0; i < 3; i++) s = perfectShift(s, 'a', T0 + i * 1000).state;
    const p = getPlayer(s, 'a')!;
    const now = T0 + 3000;
    expect(Math.round(energyNow(s, p, now).energy)).toBe(10);
    expect(() => run(s, 'a', { type: 'startShift' }, now)).toThrow('no_energy');
    // восстанавливается понемногу: N единиц в минуту
    const later = energyNow(s, p, now + 100 * 60_000).energy;
    expect(later).toBeCloseTo(10 + CONFIG.energyRegenPerMin * 100, 0);
  });

  it('у управляющего свои силы: поездка, расширение, реклама — по 1, меню бесплатно', () => {
    let s: CafeState = { ...fresh('manager'), money: 5000 };
    s = run(s, 'a', { type: 'supplyRun', items: { beans: 1, syrup: 1 } }, T0).state;
    expect(s.stock.beans).toBe(40);
    expect(s.stock.syrup).toBe(10);
    s = run(s, 'a', { type: 'unlockDrink', id: 'latte' }, T0).state;
    expect(getPlayer(s, 'a')!.energy).toBe(80);
    s = run(s, 'a', { type: 'upgradeSlot', slot: 'tables' }, T0).state;
    s = run(s, 'a', { type: 'launchMarketing', id: 'flyers' }, T0).state;
    s = run(s, 'a', { type: 'supplyRun', items: { cocoa: 1 } }, T0).state;
    s = run(s, 'a', { type: 'supplyRun', items: { cocoa: 1 } }, T0).state;
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
    s = run(s, 'b', { type: 'upgradeSlot', slot: 'tables' }, T0).state;
    s = run(s, 'b', { type: 'upgradeSlot', slot: 'tables' }, T0).state;
    s = run(s, 'b', { type: 'launchMarketing', id: 'flyers' }, T0).state;
    const r = run(s, 'a', { type: 'startShift' }, T0);
    expect(r.shiftPlan!.guests).toHaveLength(CONFIG.shiftGuests + 2);
    expect(r.shiftPlan!.tables).toBe(CONFIG.tablesBase + 2);
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

  it('создатель может убрать сотрудника; освободившуюся единственную роль занимает сосед', () => {
    let s = join(fresh('barista'));
    expect(() => run(s, 'b', { type: 'removeStaff', id: 'a' }, T0)).toThrow('owner_only');
    s = run(s, 'a', { type: 'removeStaff', id: 'b' }, T0).state;
    expect(getPlayer(s, 'b')).toBeUndefined();
    expect(getPlayer(s, NPC_ID)!.role).toBe('manager');
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
  it('зал открыт сразу, кухня и личные комнаты — общими взносами', () => {
    let s = join(fresh('barista'));
    const t = T0;
    expect(s.home.rooms.hall.open).toBe(true);
    expect(s.home.rooms.kitchen.open).toBe(false);
    expect(s.home.rooms['bed:a'].open).toBe(false);
    s = run(s, 'b', { type: 'adoptCat', name: 'Барсик' }, t).state;
    s = run(s, 'a', { type: 'feedCat' }, t).state;
    s = run(s, 'b', { type: 'buyDecor', id: 'plant-0' }, t).state;
    expect(s.home.rooms.hall.placed.plant).toBe('plant-0');
    expect(getPlayer(s, 'b')!.wallet).toBe(CONFIG.walletStart - DECOR_BY_ID['plant-0'].cost);
    // взносы на кухню от двоих
    getPlayer(s, 'a')!.wallet = 1000;
    getPlayer(s, 'b')!.wallet = 1000;
    s = run(s, 'a', { type: 'contributeRoom', room: 'kitchen', amount: 1000 }, t).state;
    expect(s.home.rooms.kitchen.open).toBe(false);
    s = run(s, 'b', { type: 'contributeRoom', room: 'kitchen', amount: 1000 }, t).state;
    expect(s.home.rooms.kitchen.open).toBe(true);
    expect(getPlayer(s, 'b')!.wallet).toBe(1000 - (CONFIG.kitchenCost - 1000)); // лишнее не списали
    // личную комнату может обставлять только хозяин
    s = run(s, 'a', { type: 'debugUnlockRoom' }, t).state;
    getPlayer(s, 'a')!.wallet = 1000;
    expect(() => run(s, 'b', { type: 'buyDecor', id: 'bed-0', room: 'bed:a' }, t)).toThrow('not_your_room');
    expect(() => run(s, 'a', { type: 'buyDecor', id: 'stove-0', room: 'bed:a' }, t)).toThrow('bad_item');
    s = run(s, 'a', { type: 'buyDecor', id: 'bed-0', room: 'bed:a' }, t).state;
    // бонус кровати — только хозяину
    expect(vitalsNow(s, getPlayer(s, 'a')!, t).restPerMin).toBeGreaterThan(vitalsNow(s, getPlayer(s, 'b')!, t).restPerMin);
  });

  it('зарплата: половина выручки поровну, остальное — в бюджет; перевод в бюджет', () => {
    let s = join(fresh('barista'));
    const before = s.money;
    const r = perfectShift(s, 'a', T0);
    const sum = r.summary!;
    expect(sum.salary).toBe(Math.floor((sum.earned * 0.5) / 2));
    expect(r.state.money - before).toBe(sum.earned - sum.salary * 2);
    expect(getPlayer(r.state, 'b')!.wallet).toBe(CONFIG.walletStart + sum.salary);
    s = run(r.state, 'b', { type: 'transferToBudget', amount: 50 }, T0 + 1).state;
    expect(s.money).toBe(r.state.money + 50);
    expect(() => run(s, 'b', { type: 'transferToBudget', amount: 99999 }, T0 + 1)).toThrow('no_wallet');
    expect(() => run(s, 'a', { type: 'supplyRun', items: { catFood: 1 } }, T0 + 1)).toThrow();
  });

  it('записки и подарки тратят бодрость и радуют получателя', () => {
    let s = join(fresh('barista'));
    getPlayer(s, 'b')!.happy = 40;
    s = run(s, 'a', { type: 'postNote', text: 'Привет!' }, T0).state;
    expect(getPlayer(s, 'a')!.energy).toBe(100 - CONFIG.noteEnergy);
    expect(getPlayer(s, 'b')!.happy).toBeCloseTo(40 + CONFIG.joyFromNote, 0);
    getPlayer(s, 'a')!.wallet = 1000;
    s = run(s, 'a', { type: 'sendGift', to: 'b', kind: 'gift' }, T0).state;
    s = run(s, 'a', { type: 'sendGift', to: 'b', kind: 'gift' }, T0).state;
    // дневной лимит радости
    expect(getPlayer(s, 'b')!.happy).toBeCloseTo(40 + CONFIG.socialJoyDailyCap, 0);
    expect(getPlayer(s, 'a')!.wallet).toBe(1000 - 2 * CONFIG.giftCost);
  });

  it('счастье сдвигает оценку гостей не больше чем на ±18%', () => {
    expect(happyRatingMult(100)).toBeCloseTo(1.18);
    expect(happyRatingMult(0)).toBeCloseTo(0.82);
    expect(happyRatingMult(50)).toBe(1);
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

describe('меню дня', () => {
  it('открытый напиток попадает в меню дня, управляющий может его убрать и вернуть', () => {
    let s = createCafe({ code: 'MENU1', owner: { id: 'm', name: 'M' }, role: 'manager', npcName: 'N', cafeName: 'C', now: T0 });
    s.money = 5000;
    s = apply(s, { actor: 'm', at: T0 + 1, cmd: { type: 'unlockDrink', id: 'latte' } }).state;
    expect(s.featured).toContain('latte');
    s = apply(s, { actor: 'm', at: T0 + 2, cmd: { type: 'toggleFeatured', id: 'latte' } }).state;
    expect(s.featured).not.toContain('latte');
    expect(todayMenu(s)).toEqual(['espresso', 'americano', 'cappuccino']);
    s = apply(s, { actor: 'm', at: T0 + 3, cmd: { type: 'toggleFeatured', id: 'latte' } }).state;
    expect(s.featured).toContain('latte');
  });

  it('гости заказывают только из меню дня', () => {
    let s = createCafe({ code: 'MENU2', owner: { id: 'm', name: 'M' }, role: 'manager', npcName: 'N', cafeName: 'C', now: T0 });
    s = apply(s, { actor: 'm', at: T0 + 1, cmd: { type: 'toggleFeatured', id: 'espresso' } }).state;
    s = apply(s, { actor: 'm', at: T0 + 2, cmd: { type: 'toggleFeatured', id: 'americano' } }).state;
    expect(() => apply(s, { actor: 'm', at: T0 + 3, cmd: { type: 'toggleFeatured', id: 'cappuccino' } })).toThrow();
    expect(todayMenu(s)).toEqual(['cappuccino']);
  });

  it('старое сохранение получает меню дня', () => {
    const s = createCafe({ code: 'MENU3', owner: { id: 'm', name: 'M' }, role: 'manager', npcName: 'N', cafeName: 'C', now: T0 });
    delete (s as Partial<typeof s>).featured;
    expect(migrate(s).featured).toEqual(['espresso', 'americano', 'cappuccino']);
  });
});

describe('с собой', () => {
  it('часть гостей берёт с собой, постоянные — всегда здесь', () => {
    let s = fresh();
    let away = 0;
    let total = 0;
    for (let k = 0; k < 6; k++) {
      const r = run(s, 'a', { type: 'startShift' }, T0 + k * 10);
      const plan = r.shiftPlan!;
      for (const g of plan.guests) {
        total++;
        if (g.takeaway) away++;
        if (g.regular) expect(g.takeaway).toBe(false);
      }
      s = run(r.state, 'a', { type: 'abandonShift' }, T0 + k * 10 + 1).state;
      getPlayer(s, 'a')!.energy = 100;
    }
    expect(away).toBeGreaterThan(0);
    expect(away).toBeLessThan(total);
  });

  it('гость с собой тратит стакан, без стаканов уходит', () => {
    const s = fresh();
    const r = run(s, 'a', { type: 'startShift' }, T0);
    const plan = r.shiftPlan!;
    plan.guests.forEach((g, i) => (g.takeaway = i === 0));
    const before = r.state.stock.cups;
    const done = run(r.state, 'a', { type: 'finishShift', results: plan.guests.map((_, i) => ({ i, outcome: 'served', waitMs: 1000 })), cleanliness: 1 }, T0 + 60_000);
    expect(done.state.stock.cups).toBe(before - 1);

    const s2 = fresh();
    s2.stock.cups = 0;
    const r2 = run(s2, 'a', { type: 'startShift' }, T0);
    r2.shiftPlan!.guests.forEach((g, i) => (g.takeaway = i === 0));
    const d2 = run(r2.state, 'a', { type: 'finishShift', results: r2.shiftPlan!.guests.map((_, i) => ({ i, outcome: 'served', waitMs: 1000 })), cleanliness: 1 }, T0 + 60_000);
    expect(d2.summary!.noStock).toBe(1);
  });
});

describe('отладка', () => {
  it('открывает кухню и личные комнаты без взносов', () => {
    const s = fresh();
    expect(s.home.rooms.kitchen.open).toBe(false);
    const r = run(s, 'a', { type: 'debugUnlockRoom' }, T0);
    expect(r.state.home.rooms.kitchen.open).toBe(true);
    expect(r.state.home.rooms['bed:a'].open).toBe(true);
  });
});

describe('уровни кофейни', () => {
  it('улучшаются по порядку до 3-го уровня, по 1⚡ и за деньги', () => {
    let s: CafeState = { ...fresh('manager'), money: 10000 };
    expect(s.levels.machine).toBe(1);
    s = run(s, 'a', { type: 'upgradeSlot', slot: 'machine' }, T0).state;
    expect(s.levels.machine).toBe(2);
    expect(s.money).toBe(10000 - 800);
    s = run(s, 'a', { type: 'upgradeSlot', slot: 'machine' }, T0).state;
    expect(s.levels.machine).toBe(3);
    getPlayer(s, 'a')!.energy = 100;
    expect(() => run(s, 'a', { type: 'upgradeSlot', slot: 'machine' }, T0)).toThrow('owned');
  });

  it('витрина приносит выпечку с гостей, которые пьют здесь', () => {
    let s = fresh();
    s.levels.vitrine = 3;
    const r = run(s, 'a', { type: 'startShift' }, T0);
    const here = r.shiftPlan!.guests.filter((g) => !g.takeaway).length;
    const results = r.shiftPlan!.guests.map((_, i) => ({ i, outcome: 'served' as const, waitMs: 1000 }));
    const done = run(r.state, 'a', { type: 'finishShift', results, cleanliness: 1 }, T0 + 60_000);
    expect(done.summary!.pastry).toBe(here * 25);
  });

  it('старые улучшения переезжают в уровни', () => {
    const s = fresh();
    delete (s as Partial<CafeState>).levels;
    (s.upgrades as Record<string, boolean>).machinePro = true;
    (s.upgrades as Record<string, boolean>).terrace = true;
    const m = migrate(s);
    expect(m.levels).toEqual({ machine: 2, vitrine: 1, tables: 3, decor: 1 });
    expect((m.upgrades as Record<string, boolean>).machinePro).toBeUndefined();
  });
});
