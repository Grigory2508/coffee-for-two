// Весь игровой контент и баланс в одном месте. Цифры — стартовые, для плейтеста.

import type { DrinkId, L10n, StockId } from './menu.ts';
import { emptyStock } from './menu.ts';
export * from './menu.ts';

/** Слоты кофейни, которые растут по уровням. */
export type CafeSlot = 'machine' | 'fridge' | 'storage' | 'vitrine';
export type Role = 'barista' | 'manager';
export type MarketingId = 'flyers' | 'blogger';
export type DecorSlot =
  | 'wall'
  | 'window'
  | 'rug'
  | 'sofa'
  | 'table'
  | 'lamp'
  | 'plant'
  | 'shelf'
  | 'stove'
  | 'fridge'
  | 'dining'
  | 'coffeemaker'
  | 'bed'
  | 'desk'
  | 'wardrobe';
/** Комнаты квартиры: зал и кухня общие, спальня у каждого своя. */
export type RoomKind = 'hall' | 'kitchen' | 'bedroom';
export type RegularId = 'mark' | 'vera' | 'tolik';

export const CONFIG = {
  // премиум-валюта
  gemsStart: 20,
  brandCost: 60,
  dailyGoalActions: 3,
  dailyGoalGems: 3,
  brandMaxProposals: 5,
  cafeNameMax: 24,
  maxPlayers: 2,
  // Бодрость 0..100: тратится на дела, восстанавливается понемногу каждую минуту
  energyMax: 100,
  energyRegenPerMin: 0.12, // база: полная шкала примерно за 14 часов
  shiftEnergy: 30,
  shiftEnergyMin: 15, // ниже этого кухня цену смены не снизит
  managerTaskEnergy: 20,
  noteEnergy: 5,
  stickerEnergy: 2,
  postcardEnergy: 8,
  giftEnergy: 12,
  // Счастье 0..100: падает от работы, тянется к «потолку уюта», влияет на оценки гостей
  happyMax: 100,
  happyStart: 70,
  happyBaseCap: 70,
  happyRegenPerMin: 0.05, // +3 в час к потолку
  happyJoyRatePerPoint: 0.002, // каждый пункт уюта ускоряет восстановление
  shiftHappyCost: 10,
  managerHappyCost: 4,
  happyRatingSpan: 0.18, // счастье 100 → оценки гостей +18%, 0 → −18%
  // Записки и подарки радуют получателя, но не больше лимита в день
  joyFromSticker: 1,
  joyFromNote: 3,
  joyFromPostcard: 7,
  joyFromGift: 12,
  socialJoyDailyCap: 20,
  petJoy: 5,
  postcardCost: 30,
  giftCost: 120,
  // Деньги: половина выручки — зарплата поровну всем сотрудникам, остальное — бюджет кофейни
  salaryShare: 0.5,
  walletStart: 100,
  catFoodPackCost: 120,
  catFoodPackAmount: 10,
  // Квартира: зал открыт сразу, кухня и спальни открываются взносами
  kitchenCost: 1500,
  bedroomCost: 800,
  // Смена: гостей столько, сколько аудиторий покрывает меню; ~7 с на гостя, не дольше 120 с
  shiftBaseGuests: 5,
  shiftGuestCap: 15,
  shiftMsPerGuest: 7_000,
  shiftMaxMs: 120_000,
  shiftMinMs: 40_000,
  /** Последний гость приходит не позже этой доли смены. */
  shiftLastArrival: 0.83,
  /** Сколько гостей стоит у стойки (у них тикает терпение), остальные ждут в очереди без таймера. */
  counterSlots: 3,
  /** Гость не нашёл свой напиток в меню дня: эта доля берёт другой, остальные уходят. */
  substituteShare: 0.7,
  altMilkShare: 0.15,
  altMilkPrice: 40,
  /** Нет нужного молока: гость берёт на обычном, но эта доля уходит. */
  noMilkLeave: 1 / 3,
  dessertWant: 0.4,
  dessertWantEvening: 0.6,
  /** Нет любимого десерта: эта доля берёт другой. */
  dessertSubstitute: 0.3,
  pairTipBonus: 0.2,
  // NPC подхватывает роль напарника, если тот не действовал столько времени
  npcCoverAfterMs: 24 * 3600_000,
  // …но только пока хоть один живой игрок заходил недавно
  npcCoverActiveWindowMs: 48 * 3600_000,
  npcRestockBelow: 12,
  npcMarkup: 1.2,
  swapExpiresMs: 48 * 3600_000,
  // Команда
  // Меню дня: сколько напитков бариста готовит на смене (из открытых управляющим)
  menuSlots: 6,
  maxStaff: 5,
  roleMax: { barista: 4, manager: 2 } as Record<Role, number>,
  applicationExpiresMs: 48 * 3600_000,
  maxPendingApplications: 3,
  officeHoldMs: 3 * 60_000,
  basePatienceMs: 16_000,
  startMoney: 300,
  startStock: { ...emptyStock(), beans: 20, milk_regular: 20, cream_regular: 0, cups: 20 } as Record<StockId, number>,
  // Доля гостей, которые берут кофе с собой (им нужен бумажный стакан со склада)
  takeawayShare: 0.4,
  /** Вместимость склада на каждый продукт по уровню склада. */
  storageCapacity: [40, 80, 120],
  ratingWindow: 30,
  ratingMinGuests: 5,
  npcShiftEveryMs: 6 * 3600_000,
  npcEfficiency: 0.6,
  catHungerPerHour: 100 / 24,
  catMoodPerHour: 100 / 48,
  catPetCooldownMs: 3600_000,
  boardMax: 30,
  noteMaxLen: 140,
  logMax: 80,
  managerDiscountPerLevel: 0.02,
  managerDiscountMax: 0.1,
};

export interface SlotLevel {
  name: L10n;
  desc: L10n;
  cost: number; // цена перехода на этот уровень (у первого — 0)
}

/**
 * Уровни кофейни: 1 — с самого начала, 2 и 3 покупает управляющий (по 1⚡).
 * Каждый уровень меняет картинку кофейни (или столики на смене) и даёт эффект — см. slotEffects в engine.
 */
export const CAFE_SLOTS: Record<CafeSlot, { name: L10n; icon: string; levels: SlotLevel[] }> = {
  machine: {
    name: { ru: 'Кофемашина', en: 'Espresso machine' },
    icon: '☕',
    levels: [
      { name: { ru: 'Однорожковая', en: 'One group' }, desc: { ru: '1 группа, слабый пар, вода из чайника', en: '1 group, weak steam, water from a kettle' }, cost: 0 },
      { name: { ru: 'Двухрожковая', en: 'Two-group' }, desc: { ru: 'Двойной эспрессо за один пролив, пар сильнее', en: 'Double shot in one pull, stronger steam' }, cost: 800 },
      { name: { ru: 'Профессиональная', en: 'Professional' }, desc: { ru: 'Мощный пар, кран горячей воды, эспрессо быстрее', en: 'Powerful steam, hot water tap, faster shots' }, cost: 1800 },
    ],
  },
  fridge: {
    name: { ru: 'Холодильник', en: 'Fridge' },
    icon: '🧊',
    levels: [
      { name: { ru: 'Маленький', en: 'Small' }, desc: { ru: 'Обычное молоко и сливки', en: 'Whole milk and cream' }, cost: 0 },
      { name: { ru: 'Средний', en: 'Medium' }, desc: { ru: '+ овсяное молоко и сливки', en: '+ oat milk and cream' }, cost: 700 },
      { name: { ru: 'Большой', en: 'Large' }, desc: { ru: '+ безлактозное и кокосовое', en: '+ lactose-free and coconut' }, cost: 1500 },
    ],
  },
  storage: {
    name: { ru: 'Склад', en: 'Storage' },
    icon: '📦',
    levels: [
      { name: { ru: 'Кладовка', en: 'Closet' }, desc: { ru: '40 единиц каждого продукта', en: '40 of each product' }, cost: 0 },
      { name: { ru: 'Стеллажи', en: 'Racks' }, desc: { ru: '80 единиц каждого продукта', en: '80 of each product' }, cost: 600 },
      { name: { ru: 'Склад', en: 'Storeroom' }, desc: { ru: '120 единиц каждого продукта', en: '120 of each product' }, cost: 1400 },
    ],
  },
  vitrine: {
    name: { ru: 'Витрина', en: 'Pastry display' },
    icon: '🥐',
    levels: [
      { name: { ru: 'Подставка', en: 'Cake stand' }, desc: { ru: '4 вида десертов', en: '4 kinds of desserts' }, cost: 0 },
      { name: { ru: 'Витрина', en: 'Pastry case' }, desc: { ru: '8 видов десертов', en: '8 kinds of desserts' }, cost: 600 },
      { name: { ru: 'Большая витрина', en: 'Large display' }, desc: { ru: '16 видов десертов', en: '16 kinds of desserts' }, cost: 1400 },
    ],
  },
};

export const CAFE_SLOT_ORDER: CafeSlot[] = ['machine', 'fridge', 'storage', 'vitrine'];
export const SLOT_MAX = 3;

export const ROLES: Record<Role, { name: L10n; icon: string; desc: L10n }> = {
  barista: {
    name: { ru: 'Бариста', en: 'Barista' },
    icon: '☕',
    desc: { ru: 'Обслуживает гостей и собирает напитки', en: 'Serves guests and makes drinks' },
  },
  manager: {
    name: { ru: 'Управляющий', en: 'Manager' },
    icon: '📋',
    desc: { ru: 'Закупает продукты, ведёт меню, расширяет кофейню и занимается рекламой', en: 'Buys supplies, runs the menu, expands the café and does marketing' },
  },
};

export const otherRole = (r: Role): Role => (r === 'barista' ? 'manager' : 'barista');

export const MARKETING: Record<MarketingId, { name: L10n; desc: L10n; cost: number; icon: string; guests: number; tipBonus: number; shifts: number }> = {
  flyers: {
    name: { ru: 'Листовки у метро', en: 'Flyers at the metro' },
    desc: { ru: '+1 гость в следующих 3 сменах', en: '+1 guest in the next 3 shifts' },
    cost: 150,
    icon: '📰',
    guests: 1,
    tipBonus: 0,
    shifts: 3,
  },
  blogger: {
    name: { ru: 'Пост у местного блогера', en: 'Local blogger post' },
    desc: { ru: '+2 гостя и +10% чаевых в следующих 3 сменах', en: '+2 guests and +10% tips in the next 3 shifts' },
    cost: 450,
    icon: '📱',
    guests: 2,
    tipBonus: 0.1,
    shifts: 3,
  },
};

export const MARKETING_ORDER: MarketingId[] = ['flyers', 'blogger'];


export interface DecorItem {
  id: string;
  slot: DecorSlot;
  variant: number; // 0..2 — простой, уютный, дизайнерский
  name: L10n;
  cost: number;
  /** +бодрости в минуту (мебель для отдыха). */
  rest: number;
  /** +пунктов к потолку счастья (декор). */
  joy: number;
  /** −бодрости за смену (кухня: кофеварка). */
  shiftCut: number;
}

const SLOT_NAMES: Record<DecorSlot, L10n> = {
  wall: { ru: 'Картина', en: 'Painting' },
  window: { ru: 'Шторы', en: 'Curtains' },
  rug: { ru: 'Ковёр', en: 'Rug' },
  sofa: { ru: 'Диван', en: 'Sofa' },
  table: { ru: 'Журнальный столик', en: 'Coffee table' },
  lamp: { ru: 'Лампа', en: 'Lamp' },
  plant: { ru: 'Растение', en: 'Plant' },
  shelf: { ru: 'Полка', en: 'Shelf' },
  stove: { ru: 'Плита', en: 'Stove' },
  fridge: { ru: 'Холодильник', en: 'Fridge' },
  dining: { ru: 'Обеденный стол', en: 'Dining table' },
  coffeemaker: { ru: 'Кофеварка', en: 'Coffee maker' },
  bed: { ru: 'Кровать', en: 'Bed' },
  desk: { ru: 'Письменный стол', en: 'Desk' },
  wardrobe: { ru: 'Шкаф', en: 'Wardrobe' },
};

/** Какие места есть в каждой комнате (порядок — как в интерфейсе). */
export const ROOM_SLOTS: Record<RoomKind, DecorSlot[]> = {
  hall: ['sofa', 'table', 'lamp', 'wall', 'window', 'rug', 'plant', 'shelf'],
  kitchen: ['stove', 'fridge', 'dining', 'coffeemaker', 'shelf', 'plant', 'window'],
  bedroom: ['bed', 'desk', 'wardrobe', 'lamp', 'wall', 'window', 'rug', 'plant'],
};

export const ROOMS: Record<RoomKind, { name: L10n; icon: string }> = {
  hall: { name: { ru: 'Зал', en: 'Living room' }, icon: '🛋️' },
  kitchen: { name: { ru: 'Кухня', en: 'Kitchen' }, icon: '🍳' },
  bedroom: { name: { ru: 'Комната', en: 'Room' }, icon: '🛏️' },
};

export const SLOT_ORDER: DecorSlot[] = ['wall', 'window', 'sofa', 'rug', 'table', 'lamp', 'plant', 'shelf'];
export const SLOT_LABEL = SLOT_NAMES;

const VARIANT_NAMES: L10n[] = [
  { ru: 'простой', en: 'simple' },
  { ru: 'уютный', en: 'cozy' },
  { ru: 'дизайнерский', en: 'designer' },
];

const SLOT_BASE_COST: Record<DecorSlot, number> = {
  wall: 150, window: 120, rug: 180, sofa: 400, table: 200, lamp: 140, plant: 100, shelf: 160,
  stove: 300, fridge: 350, dining: 250, coffeemaker: 200, bed: 450, desk: 220, wardrobe: 260,
};

// Мебель для отдыха ускоряет бодрость (в минуту), декор поднимает потолок счастья
const SLOT_REST: Partial<Record<DecorSlot, number>> = {
  bed: 0.05, sofa: 0.02, stove: 0.02, fridge: 0.015, dining: 0.015, coffeemaker: 0.01, desk: 0.01, wardrobe: 0.01, table: 0.01, lamp: 0.008,
};
const SLOT_JOY: Partial<Record<DecorSlot, number>> = { wall: 4, window: 3, rug: 4, plant: 3, shelf: 3 };
const SLOT_SHIFT_CUT: Partial<Record<DecorSlot, number>> = { coffeemaker: 2 };
const VARIANT_MULT = [1, 1.6, 2.4];

const ALL_SLOTS = Object.keys(SLOT_NAMES) as DecorSlot[];

export const DECOR: DecorItem[] = ALL_SLOTS.flatMap((slot) =>
  [0, 1, 2].map((variant) => ({
    id: `${slot}-${variant}`,
    slot,
    variant,
    name: {
      ru: `${SLOT_NAMES[slot].ru} (${VARIANT_NAMES[variant].ru})`,
      en: `${VARIANT_NAMES[variant].en[0].toUpperCase()}${VARIANT_NAMES[variant].en.slice(1)} ${SLOT_NAMES[slot].en.toLowerCase()}`,
    },
    cost: Math.round(SLOT_BASE_COST[slot] * [1, 2, 4][variant]),
    rest: Math.round((SLOT_REST[slot] ?? 0) * VARIANT_MULT[variant] * 1000) / 1000,
    joy: Math.round((SLOT_JOY[slot] ?? 0) * VARIANT_MULT[variant]),
    shiftCut: (SLOT_SHIFT_CUT[slot] ?? 0) * (variant + 1),
  })),
);

// Комод — низкая альтернатива шкафу на том же месте спальни
DECOR.push(
  ...[0, 1, 2].map((variant) => ({
    id: `dresser-${variant}`,
    slot: 'wardrobe' as DecorSlot,
    variant,
    name: { ru: `Комод (${VARIANT_NAMES[variant].ru})`, en: `${VARIANT_NAMES[variant].en[0].toUpperCase()}${VARIANT_NAMES[variant].en.slice(1)} chest of drawers` },
    cost: Math.round(200 * [1, 2, 4][variant]),
    rest: Math.round(0.01 * VARIANT_MULT[variant] * 1000) / 1000,
    joy: Math.round(2 * VARIANT_MULT[variant]),
    shiftCut: 0,
  })),
);

export const DECOR_BY_ID: Record<string, DecorItem> = Object.fromEntries(DECOR.map((d) => [d.id, d]));

// ---------- обои ----------

export type WallPattern = 'plain' | 'stripes' | 'dots' | 'flowers' | 'diamonds' | 'herringbone' | 'panel' | 'check' | 'tiles' | 'brick';

export interface Wallpaper {
  id: string;
  name: L10n;
  tier: 0 | 1 | 2;
  cost: number;
  /** +к потолку счастья, пока наклеены. */
  joy: number;
  pattern: WallPattern;
  /** Основной цвет стены и цвет рисунка. */
  base: string;
  ink: string;
  /** Нижняя панель (для pattern 'panel') или второй цвет. */
  accent?: string;
  rooms: RoomKind[];
  /** Обои, с которыми комната открывается. */
  def?: true;
}

const WP = (id: string, ru: string, en: string, tier: 0 | 1 | 2, pattern: WallPattern, base: string, ink: string, rooms: RoomKind[], accent?: string, def?: true): Wallpaper => ({
  id, name: { ru, en }, tier, cost: def ? 0 : [80, 180, 350][tier], joy: def ? 0 : [1, 3, 5][tier], pattern, base, ink, accent, rooms, def,
});

export const WALLPAPERS: Wallpaper[] = [];
export const WALLPAPER_BY_ID: Record<string, Wallpaper> = {};
export function setWallpapers(list: Wallpaper[]) {
  WALLPAPERS.splice(0, WALLPAPERS.length, ...list);
  for (const k of Object.keys(WALLPAPER_BY_ID)) delete WALLPAPER_BY_ID[k];
  for (const w of list) WALLPAPER_BY_ID[w.id] = w;
}
setWallpapers([
  // Зал — медовый пол; мебель белая/серая, дерево с кремом, терракота с мятой
  WP('wp-cream-stripe', 'Кремовая полоска', 'Cream stripes', 0, 'stripes', '#fbeed2', '#f3dfb8', ['hall'], undefined, true),
  WP('wp-milk', 'Молочная', 'Milk', 0, 'plain', '#f6efe2', '#ece2cf', ['hall']),
  WP('wp-peach-dots', 'Персиковый горошек', 'Peach dots', 1, 'dots', '#f6e0d2', '#ecc9b2', ['hall']),
  WP('wp-blue-diamond', 'Голубые ромбы', 'Blue diamonds', 1, 'diamonds', '#dde8ec', '#c6d8df', ['hall']),
  WP('wp-honey-herring', 'Медовая ёлочка', 'Honey herringbone', 2, 'herringbone', '#f7e6c4', '#e9cf9f', ['hall']),
  WP('wp-sage-panel', 'Шалфейные панели', 'Sage panels', 2, 'panel', '#f3eedf', '#9fb38f', ['hall'], '#d3dec4'),
  // Кухня — плитка фартука уже даёт сетку: спокойные узоры, без мятного (холодильник)
  WP('wp-sage', 'Светлый шалфей', 'Light sage', 0, 'plain', '#dce5d0', '#cddabe', ['kitchen'], undefined, true),
  WP('wp-cream-plain', 'Сливочная', 'Cream', 0, 'plain', '#f5ebd6', '#ecddbf', ['kitchen']),
  WP('wp-butter-stripe', 'Масляная полоска', 'Butter stripes', 1, 'stripes', '#f4e6be', '#eadaab', ['kitchen']),
  WP('wp-peach-dots-k', 'Персиковый горошек', 'Peach dots', 1, 'dots', '#f5ddcc', '#ebcab4', ['kitchen']),
  WP('wp-bistro-check', 'Клетка «бистро»', 'Bistro check', 2, 'check', '#f6ead8', '#e3b9a0', ['kitchen']),
  WP('wp-olive-flowers', 'Оливковые цветочки', 'Olive flowers', 2, 'flowers', '#e3e8d0', '#bcc8a0', ['kitchen'], '#f3e0a8'),
  // Спальня — светлая лаванда вместо насыщенной, пудра, голубой, крем
  WP('wp-lavender-dots', 'Лавандовый горошек', 'Lavender dots', 0, 'dots', '#e0daf0', '#d0c8e6', ['bedroom'], undefined, true),
  WP('wp-linen', 'Серый лён', 'Grey linen', 0, 'plain', '#ebe6dd', '#ddd6ca', ['bedroom']),
  WP('wp-lilac-stripe', 'Сиреневая полоска', 'Lilac stripes', 1, 'stripes', '#e3dcef', '#d4cbe6', ['bedroom']),
  WP('wp-powder-flowers', 'Пудровые цветочки', 'Powder flowers', 1, 'flowers', '#f1dedc', '#e2c2c0', ['bedroom'], '#fbf3e6'),
  WP('wp-sky-diamond', 'Голубые ромбы', 'Sky diamonds', 2, 'diamonds', '#dce6f0', '#c6d5e6', ['bedroom']),
  WP('wp-cream-panel', 'Кремовые панели', 'Cream panels', 2, 'panel', '#f6ebd8', '#c9a27e', ['bedroom'], '#ead8bf'),
]);
/** Обои по умолчанию — то, что было в комнате с самого начала. */
export function defaultWallpaper(kind: RoomKind): string {
  return WALLPAPERS.find((w) => w.rooms.includes(kind) && w.def)?.id ?? WALLPAPERS[0].id;
}

export const STICKERS = ['☕', '❤️', '🐈', '👍', '🙏', '🥐', '😴', '🎉'];

export interface Regular {
  id: RegularId;
  name: L10n;
  avatar: string;
  favorite: DrinkId;
  beats: L10n[];
}

// Постоянные гости: история из 5 визитов. Часть сцен видит один партнёр, часть — другой.
export const REGULARS: Record<RegularId, Regular> = {
  mark: {
    id: 'mark',
    name: { ru: 'Марк', en: 'Mark' },
    avatar: '🧑‍💻',
    favorite: 'americano',
    beats: [
      { ru: 'Марк ставит ноутбук и вздыхает: «Третий месяц пишу игру. Никто, кроме мамы, не играл».', en: 'Mark opens his laptop and sighs: "Three months on my game. Nobody but my mom has played it."' },
      { ru: '«Сегодня отправил билд другу. Он сказал: “норм”. Это хорошо или плохо?»', en: '"Sent a build to a friend today. He said: \'fine\'. Is that good or bad?"' },
      { ru: 'Марк не открывает ноутбук. «Думаю бросить. Может, это не моё».', en: 'Mark doesn\'t open the laptop. "Thinking of quitting. Maybe it\'s not for me."' },
      { ru: '«Вы же вдвоём это место держите? Как вы не бросили в первый месяц?» — и что-то записывает.', en: '"You two run this place together, right? How didn\'t you quit in the first month?" He writes something down.' },
      { ru: 'Марк сияет: «Выложил игру! Сто человек сыграли. Первый отзыв — “как будто кофе с друзьями”». Он оставляет на стойке наклейку со своей игрой.', en: 'Mark beams: "Released it! A hundred people played. First review: \'like coffee with friends\'." He leaves a sticker of his game on the counter.' },
    ],
  },
  vera: {
    id: 'vera',
    name: { ru: 'Вера Павловна', en: 'Vera Pavlovna' },
    avatar: '👵',
    favorite: 'cappuccino',
    beats: [
      { ru: 'Пожилая дама долго разглядывает меню: «В моё время тут была булочная. Капучино — это с пенкой?»', en: 'An elderly lady studies the menu: "In my day this was a bakery. Cappuccino — that\'s the foamy one?"' },
      { ru: '«Муж всегда брал мне кофе с пенкой. Сорок лет. Теперь беру сама».', en: '"My husband always got me the foamy coffee. Forty years. Now I get it myself."' },
      { ru: 'Вера Павловна приносит старую фотографию булочной: «Повесьте, если не жалко места».', en: 'Vera Pavlovna brings an old photo of the bakery: "Hang it, if you can spare the space."' },
      { ru: '«Вы с напарником так друг на друга смотрите. Мы тоже так смотрели. Берегите это».', en: '"The way you two look at each other. We looked like that too. Take care of it."' },
      { ru: 'Она приводит внучку: «Вот, показываю тебе лучший кофе в районе. И лучших хозяев».', en: 'She brings her granddaughter: "Here — the best coffee in the area. And the best owners."' },
    ],
  },
  tolik: {
    id: 'tolik',
    name: { ru: 'Толик-курьер', en: 'Tolik the courier' },
    avatar: '🚴',
    favorite: 'espresso',
    beats: [
      { ru: 'Курьер влетает: «Эспрессо, быстро, у меня семь заказов!» Выпивает залпом у стойки.', en: 'A courier bursts in: "Espresso, fast, I have seven orders!" Downs it at the counter.' },
      { ru: '«Я тут всех в районе знаю. Хотите, расскажу, кто у вас за углом открывается?»', en: '"I know everyone around here. Want to know who\'s opening around the corner?"' },
      { ru: 'Толик хромает: «Упал с велика. Ничего, завтра опять в седло». Оставляет щедрые чаевые.', en: 'Tolik limps in: "Fell off the bike. It\'s fine, back in the saddle tomorrow." Leaves a big tip.' },
      { ru: '«Слушайте, а вам курьер не нужен? Я бы возил ваш кофе в офисы рядом».', en: '"Hey, do you need a courier? I could take your coffee to the offices nearby."' },
      { ru: 'Толик в новой куртке с вашим логотипом: «Первая доставка — от “нашей” кофейни!»', en: 'Tolik in a new jacket with your logo: "First delivery — from \'our\' café!"' },
    ],
  },
};

export const REGULAR_ORDER: RegularId[] = ['vera', 'tolik', 'mark'];

// Названия соседних кофеен для рейтинга-заглушки (в проде — настоящие пары).
export const FAKE_CAFES = [
  'Бобы и Бублики', 'Пенка', 'Две чашки', 'Кофе с собой', 'Утро', 'Зерно', 'Тёплый угол',
  'Латте-арт', 'Сахар', 'Корица', 'Мокко', 'Сквер', 'Ваниль', 'Кофейный кот',
];


// ---------- премиум-валюта ----------

export const GEMS = { icon: '💎', name: { ru: 'Самоцветы', en: 'Gems' } as L10n };

/** Пачки самоцветов за Telegram Stars (цифровые товары в Mini App продаются только за Stars). */
export const GEM_PACKS: { id: string; gems: number; stars: number; bonus?: number }[] = [
  { id: 'g60', gems: 60, stars: 50 },
  { id: 'g150', gems: 150, stars: 110, bonus: 15 },
  { id: 'g400', gems: 400, stars: 250, bonus: 35 },
];

// ---------- логотип: только из элементов конструктора ----------

export interface Logo {
  shape: number;
  bg: number;
  fg: number;
  icon: number;
  text: string;
  frame: number;
  /** Шрифт букв (LOGO_FONTS); нет у старых логотипов. */
  font?: number;
  /** Украшение вокруг формы (LOGO_DECOS), 0 — без украшения. */
  deco?: number;
}

export const LOGO_SHAPES: L10n[] = [
  { ru: 'Круг', en: 'Circle' },
  { ru: 'Щит', en: 'Shield' },
  { ru: 'Ромб', en: 'Diamond' },
  { ru: 'Вывеска', en: 'Sign' },
  { ru: 'Арка', en: 'Arch' },
  { ru: 'Шестиугольник', en: 'Hexagon' },
  { ru: 'Восьмиугольник', en: 'Octagon' },
  { ru: 'Печать', en: 'Seal' },
  { ru: 'Билет', en: 'Ticket' },
  { ru: 'Облако', en: 'Cloud' },
  { ru: 'Флажок', en: 'Pennant' },
  { ru: 'Овал', en: 'Oval' },
];
/** Индексы не меняются (сохранённые логотипы): новые цвета — только в конец. */
export const LOGO_COLORS = ['#6b4226', '#c8873a', '#e8a598', '#6f9e88', '#3f6b8a', '#2e2420', '#f6efe6', '#b8695a', '#8a6fb0', '#e0b43a', '#d9cbb8', '#a33b3b', '#2f5d50', '#f0d9a8', '#1f3550', '#d98c5f'];
export interface LogoIcon extends L10n {
  /** Маска-силуэт из public/art/logo (перекрашивается в цвет рисунка). Без art — значок нарисован в SVG. */
  art?: string;
  group: 'base' | 'coffee' | 'bakery' | 'animals' | 'nature' | 'funny' | 'fantasy' | 'street';
}
const LI = (art: string, group: LogoIcon['group'], ru: string, en: string): LogoIcon => ({ art, group, ru, en });
/** Индексы 0–8 не меняются (сохранённые логотипы); 8 — «без значка». Новые значки — только в конец. */
export const LOGO_ICONS: LogoIcon[] = [
  { ru: 'Чашка', en: 'Cup', group: 'base' },
  { ru: 'Зерно', en: 'Bean', group: 'base' },
  { ru: 'Кот', en: 'Cat', group: 'base' },
  { ru: 'Сердце', en: 'Heart', group: 'base' },
  { ru: 'Звезда', en: 'Star', group: 'base' },
  { ru: 'Лист', en: 'Leaf', group: 'base' },
  { ru: 'Луна', en: 'Moon', group: 'base' },
  { ru: 'Круассан', en: 'Croissant', group: 'base' },
  { ru: 'Без значка', en: 'No icon', group: 'base' },
  LI('li-cup', 'coffee', 'Чашка с паром', 'Steaming cup'),
  LI('li-togo', 'coffee', 'Стакан с собой', 'To-go cup'),
  LI('li-bean', 'coffee', 'Кофейное зерно', 'Coffee bean'),
  LI('li-cezve', 'coffee', 'Турка', 'Cezve'),
  LI('li-moka', 'coffee', 'Гейзерная кофеварка', 'Moka pot'),
  LI('li-press', 'coffee', 'Френч-пресс', 'French press'),
  LI('li-latte', 'coffee', 'Латте-арт', 'Latte art'),
  LI('li-grinder', 'coffee', 'Кофемолка', 'Grinder'),
  LI('li-croissant', 'bakery', 'Круассан', 'Croissant'),
  LI('li-cupcake', 'bakery', 'Капкейк', 'Cupcake'),
  LI('li-donut', 'bakery', 'Пончик', 'Donut'),
  LI('li-cookie', 'bakery', 'Печенье', 'Cookie'),
  LI('li-pretzel', 'bakery', 'Крендель', 'Pretzel'),
  LI('li-cake', 'bakery', 'Торт', 'Cake'),
  LI('li-macaron', 'bakery', 'Макарон', 'Macaron'),
  LI('li-cinnabon', 'bakery', 'Булочка с корицей', 'Cinnamon roll'),
  LI('li-cat-sit', 'animals', 'Кот сидит', 'Sitting cat'),
  LI('li-cat-face', 'animals', 'Мордочка кота', 'Cat face'),
  LI('li-cat-sleep', 'animals', 'Кот спит', 'Sleeping cat'),
  LI('li-paw', 'animals', 'Лапка', 'Paw'),
  LI('li-dog', 'animals', 'Собака', 'Dog'),
  LI('li-bird', 'animals', 'Птичка', 'Bird'),
  LI('li-fox', 'animals', 'Лиса', 'Fox'),
  LI('li-bear', 'animals', 'Медведь', 'Bear'),
  LI('li-leaf', 'nature', 'Лист', 'Leaf'),
  LI('li-flower', 'nature', 'Цветок', 'Flower'),
  LI('li-sun', 'nature', 'Солнце', 'Sun'),
  LI('li-moon', 'nature', 'Луна и звезда', 'Moon and star'),
  LI('li-cloud', 'nature', 'Облако', 'Cloud'),
  LI('li-mountains', 'nature', 'Горы', 'Mountains'),
  LI('li-book', 'nature', 'Книга', 'Book'),
  LI('li-bulb', 'nature', 'Лампочка', 'Light bulb'),
  LI('lw-crazy-cup', 'funny', 'Безумная чашка', 'Crazy cup'),
  LI('lw-sleepy-bean', 'funny', 'Сонное зерно', 'Sleepy bean'),
  LI('lw-cool-croissant', 'funny', 'Круассан в очках', 'Cool croissant'),
  LI('lw-grin-donut', 'funny', 'Пончик-улыбака', 'Grinning donut'),
  LI('lw-cat-in-cup', 'funny', 'Кот в чашке', 'Cat in a cup'),
  LI('lw-raccoon', 'funny', 'Енот с кофе', 'Raccoon with coffee'),
  LI('lw-capybara', 'funny', 'Капибара', 'Capybara'),
  LI('lw-frog-cup', 'funny', 'Лягушка в чашке', 'Frog in a cup'),
  LI('lw-ghost', 'funny', 'Призрак с кофе', 'Coffee ghost'),
  LI('lw-toast', 'funny', 'Тост', 'Toast'),
  LI('lw-sloth', 'funny', 'Ленивец', 'Sloth'),
  LI('lw-duck', 'funny', 'Утка-бариста', 'Barista duck'),
  LI('lw-cat-tongue', 'funny', 'Кот с языком', 'Cheeky cat'),
  LI('lw-dizzy-cup', 'funny', 'Взбодрённая чашка', 'Dizzy cup'),
  LI('lw-mustache', 'funny', 'Усы с моноклем', 'Mustache & monocle'),
  LI('lw-cat-push', 'funny', 'Кот роняет чашку', 'Cat pushing a cup'),
  LI('lw-dragon', 'fantasy', 'Дракон с чашкой', 'Coffee dragon'),
  LI('lw-unicorn', 'fantasy', 'Единорог', 'Unicorn'),
  LI('lw-wizard-hat', 'fantasy', 'Шляпа волшебника', 'Wizard hat'),
  LI('lw-potion', 'fantasy', 'Зелье', 'Potion'),
  LI('lw-crystal-ball', 'fantasy', 'Хрустальный шар', 'Crystal ball'),
  LI('lw-mushroom-house', 'fantasy', 'Домик-гриб', 'Mushroom house'),
  LI('lw-wand', 'fantasy', 'Волшебная палочка', 'Magic wand'),
  LI('lw-crown', 'fantasy', 'Корона', 'Crown'),
  LI('lw-phoenix', 'fantasy', 'Феникс', 'Phoenix'),
  LI('lw-tower', 'fantasy', 'Башня', 'Tower'),
  LI('lw-flying-teapot', 'fantasy', 'Крылатый чайник', 'Flying teapot'),
  LI('lw-witch-cat', 'fantasy', 'Кот-ведьма', 'Witch cat'),
  LI('lw-moon-face', 'fantasy', 'Сонная луна', 'Sleepy moon'),
  LI('lw-owl', 'fantasy', 'Сова', 'Owl'),
  LI('lw-d20', 'fantasy', 'Кубик d20', 'D20'),
  LI('lw-sword-cup', 'fantasy', 'Меч в чашке', 'Sword in a cup'),
  LI('lw-skull-cup', 'street', 'Череп с паром', 'Steaming skull'),
  LI('lw-flame-cup', 'street', 'Огненная чашка', 'Flaming cup'),
  LI('lw-bolt', 'street', 'Молния', 'Lightning'),
  LI('lw-spray', 'street', 'Баллончик', 'Spray can'),
  LI('lw-skate', 'street', 'Скейт', 'Skateboard'),
  LI('lw-boombox', 'street', 'Бумбокс', 'Boombox'),
  LI('lw-cassette', 'street', 'Кассета', 'Cassette'),
  LI('lw-graffiti-crown', 'street', 'Граффити-корона', 'Graffiti crown'),
  LI('lw-sneaker', 'street', 'Кроссовок', 'Sneaker'),
  LI('lw-peace', 'street', 'Мир', 'Peace'),
  LI('lw-fist-cup', 'street', 'Кулак с кофе', 'Coffee fist'),
  LI('lw-eye', 'street', 'Всевидящее око', 'All-seeing eye'),
  LI('lw-rocket', 'street', 'Ракета', 'Rocket'),
  LI('lw-dagger-heart', 'street', 'Кинжал в сердце', 'Dagger heart'),
  LI('lw-anchor', 'street', 'Якорь', 'Anchor'),
  LI('lw-winged-cup', 'street', 'Крылатая чашка', 'Winged cup'),
  LI('lw-halo-bean', 'funny', 'Зерно-ангел', 'Angel bean'),
  LI('lw-bolt-cat', 'street', 'Кот-молния', 'Lightning cat'),
  LI('lw-love-cup', 'funny', 'Влюблённая чашка', 'Love-struck cup'),
  LI('lw-cool-star', 'funny', 'Звезда в очках', 'Cool star'),
];
export const LOGO_NO_ICON = 8;
export const LOGO_FRAMES: L10n[] = [
  { ru: 'Без рамки', en: 'No frame' },
  { ru: 'Тонкая', en: 'Thin' },
  { ru: 'Двойная', en: 'Double' },
  { ru: 'Пунктир', en: 'Dashed' },
  { ru: 'Точки', en: 'Dotted' },
  { ru: 'Жирная', en: 'Bold' },
];
export interface LogoDeco extends L10n {
  art?: string;
  /** Доля, которую занимает форма логотипа внутри украшения (по кольцу на рисунке). По умолчанию 0.66. */
  inner?: number;
}
/** Украшения вокруг формы: маски из public/art/logo, красятся в цвет фона. Индекс 0 — без украшения. */
export const LOGO_DECOS: LogoDeco[] = [
  { ru: 'Без украшения', en: 'None' },
  { art: 'ld-laurel', ru: 'Лавровый венок', en: 'Laurel' },
  { art: 'ld-coffee', ru: 'Кофейные ветви', en: 'Coffee branches' },
  { art: 'ld-ribbon', ru: 'Лента', en: 'Ribbon' },
  { art: 'ld-rays', ru: 'Лучи', en: 'Rays' },
  { art: 'ld-stars', ru: 'Звёзды', en: 'Stars' },
  { art: 'ld-steam', ru: 'Пар', en: 'Steam' },
  { art: 'ld-wheat', ru: 'Колосья', en: 'Wheat' },
  { art: 'ld-hearts', ru: 'Сердечки', en: 'Hearts' },
  { art: 'ld-seal', ru: 'Печать', en: 'Seal' },
  { art: 'ld-flourish', ru: 'Завитки', en: 'Flourishes' },
  { art: 'ld-holly', ru: 'Остролист', en: 'Holly' },
  { art: 'ld-maple', ru: 'Клён', en: 'Maple' },
  { art: 'ld-flames', inner: 0.49, ru: 'Пламя', en: 'Flames' },
  { art: 'ld-bolts', inner: 0.5, ru: 'Молнии', en: 'Lightning' },
  { art: 'ld-drips', inner: 0.4, ru: 'Потёки краски', en: 'Paint drips' },
  { art: 'ld-wings', inner: 0.37, ru: 'Крылья', en: 'Wings' },
  { art: 'ld-horns', inner: 0.59, ru: 'Рожки', en: 'Devil horns' },
  { art: 'ld-cat-ears', inner: 0.59, ru: 'Кошачьи уши', en: 'Cat ears' },
  { art: 'ld-crown-top', inner: 0.5, ru: 'Корона сверху', en: 'Crown on top' },
  { art: 'ld-splat', inner: 0.46, ru: 'Клякса', en: 'Paint splat' },
  { art: 'ld-thorns', inner: 0.53, ru: 'Терновник', en: 'Thorns' },
  { art: 'ld-tentacles', inner: 0.47, ru: 'Щупальца', en: 'Tentacles' },
  { art: 'ld-dragon', inner: 0.48, ru: 'Дракон', en: 'Dragon' },
  { art: 'ld-chain', inner: 0.72, ru: 'Цепь', en: 'Chain' },
];
export const LOGO_FONTS: L10n[] = [
  { ru: 'Округлый', en: 'Rounded' },
  { ru: 'С засечками', en: 'Serif' },
  { ru: 'Рукописный', en: 'Script' },
];
export const LOGO_TEXT_MAX = 2;
export const DEFAULT_LOGO: Logo = { shape: 0, bg: 0, fg: 6, icon: 0, text: '', frame: 1 };

/** Привести логотип к допустимым значениям (данные приходят от клиента). */
export function cleanLogo(l: Partial<Logo> | undefined): Logo {
  const n = (v: unknown, max: number, d: number) => (Number.isInteger(v) && (v as number) >= 0 && (v as number) < max ? (v as number) : d);
  const text = String(l?.text ?? '')
    .replace(/[^\p{L}\p{N}&]/gu, '')
    .toUpperCase()
    .slice(0, LOGO_TEXT_MAX);
  return {
    shape: n(l?.shape, LOGO_SHAPES.length, 0),
    bg: n(l?.bg, LOGO_COLORS.length, 0),
    fg: n(l?.fg, LOGO_COLORS.length, 6),
    icon: n(l?.icon, LOGO_ICONS.length, 0),
    text: BAD_WORDS.test(text) ? '' : text,
    frame: n(l?.frame, LOGO_FRAMES.length, 1),
    font: n(l?.font, LOGO_FONTS.length, 0),
    deco: n(l?.deco, LOGO_DECOS.length, 0),
  };
}

/** Простейший фильтр брани в названиях (видны всем в рейтингах). Дальше — жалобы и ручная модерация. */
export const BAD_WORDS = /(ху[йяеёи]|пизд|п[иі]дор|[её]б[аеиу]н|[её]бат|бля[дт]|муда[кч]|шлюх|fuck|shit|cunt|nigg|fag+ot|whore|bitch)/i;

export function cleanCafeName(name: string): string | null {
  const v = String(name ?? '').replace(/\s+/g, ' ').trim().slice(0, 24);
  if (!v || BAD_WORDS.test(v)) return null;
  return v;
}

// ---------- декор кофейни: как в комнатах, но из бюджета и с эффектом на гостей ----------

export type CafeDecorSlot = 'light' | 'wall' | 'shelf' | 'window' | 'hanging' | 'floor' | 'counter';

/** Положение слоя на сцене кофейни (% от картинки 1024×434): x — центр, w — ширина, bottom/top — опора. */
export interface ArtPlace {
  name: string;
  x: number;
  w: number;
  bottom?: number;
  top?: number;
}

export interface CafeDecorItem {
  id: string;
  slot: CafeDecorSlot;
  name: L10n;
  cost: number;
  /** +мс терпения гостей. */
  patienceMs: number;
  /** +к удовлетворённости гостей (0.03 = +3%). */
  sat: number;
  art: ArtPlace[];
}

const COUNTER_Y = 81;

export const CAFE_DECOR_SLOTS: Record<CafeDecorSlot, L10n> = {
  light: { ru: 'Свет', en: 'Lights' },
  wall: { ru: 'Стена', en: 'Wall' },
  shelf: { ru: 'Полка', en: 'Shelf' },
  window: { ru: 'Подоконник', en: 'Window sill' },
  hanging: { ru: 'Подвес', en: 'Hanging' },
  floor: { ru: 'Пол', en: 'Floor' },
  counter: { ru: 'Стойка', en: 'Counter' },
};
export const CAFE_DECOR_ORDER: CafeDecorSlot[] = ['light', 'wall', 'shelf', 'window', 'hanging', 'floor', 'counter'];

export const CAFE_DECOR: CafeDecorItem[] = [
  { id: 'c-lamps', slot: 'light', name: { ru: 'Две лампы', en: 'Two lamps' }, cost: 400, patienceMs: 1500, sat: 0, art: [{ name: 'decor-lamp', x: 46, w: 4.5, top: 11 }, { name: 'decor-lamp', x: 61, w: 4.5, top: 11 }] },
  { id: 'c-garland', slot: 'light', name: { ru: 'Гирлянда', en: 'Garland' }, cost: 700, patienceMs: 1500, sat: 0.03, art: [{ name: 'decor-garland', x: 24, w: 30, top: 12 }] },
  { id: 'c-pic-cup', slot: 'wall', name: { ru: 'Картина с чашкой', en: 'Cup painting' }, cost: 300, patienceMs: 0, sat: 0.02, art: [{ name: 'decor-pic-cup', x: 37.5, w: 4.5, top: 32 }] },
  { id: 'c-pic-hills', slot: 'wall', name: { ru: 'Пейзаж', en: 'Landscape' }, cost: 500, patienceMs: 0, sat: 0.03, art: [{ name: 'decor-pic-hills', x: 37.5, w: 6, top: 30 }] },
  { id: 'c-shelf', slot: 'shelf', name: { ru: 'Полка с банками', en: 'Jar shelf' }, cost: 500, patienceMs: 1000, sat: 0.01, art: [{ name: 'decor-shelf', x: 25, w: 12, bottom: COUNTER_Y }] },
  { id: 'c-sillplant', slot: 'window', name: { ru: 'Цветок на окне', en: 'Window plant' }, cost: 250, patienceMs: 1000, sat: 0, art: [{ name: 'decor-sillplant', x: 6, w: 6, bottom: COUNTER_Y }] },
  { id: 'c-hanging', slot: 'hanging', name: { ru: 'Подвесное растение', en: 'Hanging plant' }, cost: 350, patienceMs: 1500, sat: 0, art: [{ name: 'decor-hanging', x: 2.5, w: 6, top: 11 }] },
  { id: 'c-floorplant', slot: 'floor', name: { ru: 'Пальма в кадке', en: 'Potted palm' }, cost: 500, patienceMs: 2000, sat: 0, art: [{ name: 'decor-floorplant', x: 58, w: 9, bottom: 101 }] },
  { id: 'c-succulent', slot: 'counter', name: { ru: 'Суккулент', en: 'Succulent' }, cost: 200, patienceMs: 500, sat: 0.01, art: [{ name: 'decor-succulent', x: 46, w: 4, bottom: COUNTER_Y }] },
];
export const CAFE_DECOR_BY_ID: Record<string, CafeDecorItem> = Object.fromEntries(CAFE_DECOR.map((d) => [d.id, d]));

// ---------- гостевой зал: обставляется как комнаты, из бюджета кофейни ----------
// Старый декор (CAFE_DECOR) остаётся только для миграции сохранений.

export type HallSlot = 'window1' | 'window2' | 'table1' | 'table2' | 'table3' | 'chandelier' | 'picture' | 'sconces' | 'poster' | 'shelf' | 'plant';
export const HALL_SLOTS: Record<HallSlot, L10n> = {
  window1: { ru: 'Окно у двери', en: 'Window by the door' },
  window2: { ru: 'Второе окно', en: 'Second window' },
  table1: { ru: 'Столик у окна', en: 'Window table' },
  table2: { ru: 'Столик в центре', en: 'Centre table' },
  table3: { ru: 'Столик в углу', en: 'Corner table' },
  chandelier: { ru: 'Люстра', en: 'Chandelier' },
  picture: { ru: 'Картина', en: 'Painting' },
  sconces: { ru: 'Бра', en: 'Sconces' },
  poster: { ru: 'Постер', en: 'Poster' },
  shelf: { ru: 'Полка', en: 'Shelf' },
  plant: { ru: 'Растение', en: 'Plant' },
};
export const HALL_ORDER: HallSlot[] = ['table1', 'table2', 'table3', 'window1', 'window2', 'chandelier', 'sconces', 'picture', 'poster', 'shelf', 'plant'];

/** Вид предмета: art — спрайт без номера уровня (hall-table → hall-table-0..2). */
type HallKind = 'window' | 'table' | 'light' | 'pic' | 'sconce' | 'poster' | 'shelf' | 'plant';
const HALL_KIND: Record<HallSlot, HallKind> = {
  window1: 'window', window2: 'window', table1: 'table', table2: 'table', table3: 'table',
  chandelier: 'light', picture: 'pic', sconces: 'sconce', poster: 'poster', shelf: 'shelf', plant: 'plant',
};
const HALL_NAMES: Record<HallKind, [L10n, L10n, L10n]> = {
  window: [{ ru: 'Обычное окно', en: 'Plain window' }, { ru: 'Арочное окно', en: 'Arched window' }, { ru: 'Витраж', en: 'Stained glass' }],
  table: [{ ru: 'Простой столик', en: 'Simple table' }, { ru: 'Уютный столик', en: 'Cozy table' }, { ru: 'Дизайнерский столик', en: 'Designer table' }],
  light: [{ ru: 'Абажур', en: 'Pendant' }, { ru: 'Плетёная люстра', en: 'Wicker chandelier' }, { ru: 'Латунная люстра', en: 'Brass chandelier' }],
  pic: [{ ru: 'Акварель', en: 'Watercolour' }, { ru: 'Натюрморт', en: 'Still life' }, { ru: 'Картина в золотой раме', en: 'Gilt-framed painting' }],
  sconce: [{ ru: 'Простые бра', en: 'Simple sconces' }, { ru: 'Бра с абажуром', en: 'Shaded sconces' }, { ru: 'Латунные бра', en: 'Brass sconces' }],
  poster: [{ ru: 'Постер с чашкой', en: 'Cup poster' }, { ru: 'Афиша кофейни', en: 'Café poster' }, { ru: 'Винтажная реклама', en: 'Vintage ad' }],
  shelf: [{ ru: 'Полка с банками', en: 'Jar shelf' }, { ru: 'Полка с кофе', en: 'Coffee shelf' }, { ru: 'Витринная полка', en: 'Display shelf' }],
  plant: [{ ru: 'Фикус', en: 'Ficus' }, { ru: 'Монстера', en: 'Monstera' }, { ru: 'Оливковое дерево', en: 'Olive tree' }],
};

export interface HallItem {
  id: string;
  slot: HallSlot;
  tier: 0 | 1 | 2;
  name: L10n;
  cost: number;
  /** +мс терпения гостей. */
  patienceMs: number;
  /** +к удовлетворённости гостей. */
  sat: number;
  /** Спрайт: public/art/<art>.webp */
  art: string;
}

const HALL_COST: Record<HallKind, [number, number, number]> = {
  window: [0, 600, 1500], table: [300, 700, 1400], light: [250, 600, 1200], pic: [150, 400, 900], sconce: [200, 450, 900], poster: [100, 300, 700], shelf: [200, 450, 900], plant: [150, 400, 900],
};
export const HALL_ITEMS: HallItem[] = (Object.keys(HALL_KIND) as HallSlot[]).flatMap((slot) =>
  ([0, 1, 2] as const).map((tier) => {
    const kind = HALL_KIND[slot];
    const table = kind === 'table';
    const win = kind === 'window';
    return {
      id: `${slot}-${tier}`,
      slot,
      tier,
      name: HALL_NAMES[kind][tier],
      cost: HALL_COST[kind][tier],
      patienceMs: win ? [0, 300, 600][tier] : table ? [500, 900, 1400][tier] : [200, 400, 700][tier],
      sat: win ? [0, 0.005, 0.01][tier] : table ? [0.005, 0.01, 0.015][tier] : [0.003, 0.006, 0.009][tier],
      art: `hall-${kind}-${tier}`,
    };
  }),
);
export const HALL_BY_ID: Record<string, HallItem> = Object.fromEntries(HALL_ITEMS.map((d) => [d.id, d]));
/** С чем открывается зал: два обычных окна и один простой столик. */
export const HALL_START: Partial<Record<HallSlot, string>> = { window1: 'window1-0', window2: 'window2-0', table1: 'table1-0' };

/** Обои и пол зала: первая покупка из бюджета, дальше переключать бесплатно; немного довольства гостей. */
export interface HallSurface {
  id: string;
  name: L10n;
  tier: 0 | 1 | 2;
  cost: number;
  sat: number;
  def?: true;
}
const HW = (id: string, ru: string, en: string, tier: 0 | 1 | 2, pattern: WallPattern, base: string, ink: string, accent?: string, def?: true): Wallpaper & HallSurface => ({
  id, name: { ru, en }, tier, cost: def ? 0 : [200, 450, 900][tier], joy: 0, sat: def ? 0 : [0.005, 0.01, 0.015][tier], pattern, base, ink, accent, rooms: [], def,
});
export const HALL_WALLS: (Wallpaper & HallSurface)[] = [
  HW('hw-latte', 'Латте', 'Latte', 0, 'plain', '#efe2cc', '#e3d2b5', undefined, true),
  HW('hw-cream-stripe', 'Кремовая полоска', 'Cream stripes', 0, 'stripes', '#f7ead2', '#ecdab9'),
  HW('hw-terracotta', 'Терракота', 'Terracotta', 1, 'plain', '#e8c4ae', '#dcb096'),
  HW('hw-green-panel', 'Зелёные панели', 'Green panels', 1, 'panel', '#f1ead9', '#6f8f74', '#9fb89a'),
  HW('hw-brick', 'Кирпич', 'Brick', 2, 'brick', '#c98b70', '#e8d6c4'),
  HW('hw-navy-panel', 'Синие панели', 'Navy panels', 2, 'panel', '#efe6d4', '#3f5a73', '#7f97ad'),
];
export const HALL_FLOORS: HallSurface[] = [
  { id: 'hf-oak', name: { ru: 'Дубовый паркет', en: 'Oak parquet' }, tier: 0, cost: 0, sat: 0, def: true },
  { id: 'hf-tile', name: { ru: 'Чёрно-белая плитка', en: 'Checker tiles' }, tier: 1, cost: 450, sat: 0.01 },
  { id: 'hf-terrazzo', name: { ru: 'Терраццо', en: 'Terrazzo' }, tier: 1, cost: 450, sat: 0.01 },
  { id: 'hf-herring', name: { ru: 'Ёлочка', en: 'Herringbone' }, tier: 2, cost: 900, sat: 0.015 },
];
export const HALL_WALL_BY_ID: Record<string, Wallpaper & HallSurface> = Object.fromEntries(HALL_WALLS.map((w) => [w.id, w]));
export const HALL_FLOOR_BY_ID: Record<string, HallSurface> = Object.fromEntries(HALL_FLOORS.map((w) => [w.id, w]));

/** Старый декор зала → новые слоты (миграция). Без пары — деньги в бюджет. */
export const CAFE_DECOR_TO_HALL: Record<string, string> = {
  'c-lamps': 'sconces-0',
  'c-garland': 'chandelier-1',
  'c-pic-cup': 'picture-0',
  'c-pic-hills': 'picture-1',
  'c-shelf': 'shelf-0',
  'c-floorplant': 'plant-1',
  'c-sillplant': 'plant-0',
};
