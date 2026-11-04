// Весь игровой контент и баланс в одном месте. Цифры — стартовые, для плейтеста.

export type L10n = { ru: string; en: string };

export type ComponentId = 'shot' | 'water' | 'milk' | 'foam' | 'cream' | 'syrup' | 'caramel' | 'cocoa' | 'cinnamon' | 'ice';
export type StockId = 'beans' | 'milk' | 'syrup' | 'cocoa' | 'cups' | 'catFood';
export type DrinkId =
  | 'espresso'
  | 'americano'
  | 'cappuccino'
  | 'latte'
  | 'raf'
  | 'cocoa'
  | 'flatWhite'
  | 'icedLatte'
  | 'cinnamonCap'
  | 'caramelLatte'
  | 'mocha';
/** Станция за стойкой: кофемашина, молочная станция, полка добавок. */
export type StationId = 'machine' | 'milk' | 'extras';
/** Отдельные улучшения без уровней (старые machinePro/cozyHall/terrace переехали в уровни кофейни). */
export type UpgradeId = 'fridge';
/** Слоты кофейни, которые растут по уровням и видны на иллюстрации. */
export type CafeSlot = 'machine' | 'vitrine' | 'tables' | 'decor';
export type Role = 'barista' | 'manager';
export type MarketingId = 'flyers' | 'blogger';
export type DecorSlot = 'wall' | 'window' | 'rug' | 'sofa' | 'table' | 'lamp' | 'plant' | 'shelf';
export type RegularId = 'mark' | 'vera' | 'tolik';

export const CONFIG = {
  maxPlayers: 2,
  energyMax: 3,
  energyRegenMs: 4 * 3600_000,
  shiftGuests: 5,
  tablesBase: 4,
  terraceTables: 2,
  // Управляющий: силы тратятся на «рабочие дела»
  managerTaskCost: 1,
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
  shiftDurationMs: 75_000,
  basePatienceMs: 16_000,
  startMoney: 300,
  startStock: { beans: 20, milk: 20, syrup: 0, cocoa: 0, cups: 20, catFood: 0 } as Record<StockId, number>,
  // Доля гостей, которые берут кофе с собой (им нужен бумажный стакан со склада)
  takeawayShare: 0.4,
  baseCapacity: 40,
  fridgeMilkCapacity: 80,
  ratingWindow: 30,
  ratingMinGuests: 5,
  // Ворота 1 (Акт 1 → комната над кофейней)
  roomGateStars: 3,
  roomGateShifts: 8,
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

/**
 * Компоненты напитков. station — где берётся за стойкой; brewMs — сколько готовится
 * (пока идёт, станция занята, но можно работать с другой чашкой); uses — что тратится со склада.
 */
export const COMPONENTS: Record<
  ComponentId,
  { name: L10n; icon: string; station: StationId; uses?: StockId; brewMs?: number; vol: number; color: string; layer: number; kind?: 'foam' | 'cream' | 'sprinkle' | 'ice' }
> = {
  // vol — доля в чашке, layer — порядок снизу вверх, kind — как рисовать слой в разрезе чашки
  shot: { name: { ru: 'Эспрессо', en: 'Shot' }, icon: '☕', station: 'machine', uses: 'beans', brewMs: 1400, vol: 1, color: '#3b2314', layer: 3 },
  water: { name: { ru: 'Кипяток', en: 'Hot water' }, icon: '💧', station: 'machine', vol: 2, color: '#a87b52', layer: 4 },
  milk: { name: { ru: 'Молоко', en: 'Milk' }, icon: '🥛', station: 'milk', uses: 'milk', vol: 1.5, color: '#e9d3ad', layer: 5 },
  foam: { name: { ru: 'Пенка', en: 'Foam' }, icon: '☁️', station: 'milk', uses: 'milk', brewMs: 1000, vol: 1, color: '#fffaf0', layer: 6, kind: 'foam' },
  cream: { name: { ru: 'Сливки', en: 'Whipped cream' }, icon: '🍦', station: 'milk', uses: 'milk', vol: 1, color: '#ffffff', layer: 7, kind: 'cream' },
  syrup: { name: { ru: 'Ваниль', en: 'Vanilla' }, icon: '🍯', station: 'extras', uses: 'syrup', vol: 0.5, color: '#e8b04a', layer: 1 },
  caramel: { name: { ru: 'Карамель', en: 'Caramel' }, icon: '🍮', station: 'extras', uses: 'syrup', vol: 0.5, color: '#c46f24', layer: 0 },
  cocoa: { name: { ru: 'Какао', en: 'Cocoa' }, icon: '🍫', station: 'extras', uses: 'cocoa', vol: 1, color: '#5a3524', layer: 2 },
  cinnamon: { name: { ru: 'Корица', en: 'Cinnamon' }, icon: '🪵', station: 'extras', vol: 0, color: '#8b4a22', layer: 8, kind: 'sprinkle' },
  ice: { name: { ru: 'Лёд', en: 'Ice' }, icon: '🧊', station: 'extras', vol: 0, color: '#e6f5ff', layer: 9, kind: 'ice' },
};

export const COMPONENT_ORDER: ComponentId[] = ['shot', 'water', 'milk', 'foam', 'cream', 'syrup', 'caramel', 'cocoa', 'cinnamon', 'ice'];

export const STATIONS: Record<StationId, { name: L10n; icon: string }> = {
  machine: { name: { ru: 'Кофемашина', en: 'Espresso machine' }, icon: '☕' },
  milk: { name: { ru: 'Молочная станция', en: 'Milk station' }, icon: '🥛' },
  extras: { name: { ru: 'Добавки', en: 'Extras' }, icon: '🧂' },
};
export const STATION_ORDER: StationId[] = ['machine', 'milk', 'extras'];

export interface Drink {
  id: DrinkId;
  name: L10n;
  recipe: ComponentId[]; // мультимножество, порядок не важен
  price: number;
  unlockCost: number; // 0 — доступен с начала
}

export const DRINKS: Record<DrinkId, Drink> = {
  espresso: { id: 'espresso', name: { ru: 'Эспрессо', en: 'Espresso' }, recipe: ['shot'], price: 80, unlockCost: 0 },
  americano: { id: 'americano', name: { ru: 'Американо', en: 'Americano' }, recipe: ['shot', 'water'], price: 100, unlockCost: 0 },
  cappuccino: { id: 'cappuccino', name: { ru: 'Капучино', en: 'Cappuccino' }, recipe: ['shot', 'milk', 'foam'], price: 150, unlockCost: 0 },
  latte: { id: 'latte', name: { ru: 'Латте', en: 'Latte' }, recipe: ['shot', 'milk', 'milk', 'foam'], price: 170, unlockCost: 300 },
  cocoa: { id: 'cocoa', name: { ru: 'Какао', en: 'Hot cocoa' }, recipe: ['cocoa', 'milk', 'foam'], price: 130, unlockCost: 400 },
  raf: { id: 'raf', name: { ru: 'Раф', en: 'Raf' }, recipe: ['shot', 'milk', 'syrup'], price: 190, unlockCost: 500 },
  flatWhite: { id: 'flatWhite', name: { ru: 'Флэт уайт', en: 'Flat white' }, recipe: ['shot', 'shot', 'milk'], price: 180, unlockCost: 600 },
  icedLatte: { id: 'icedLatte', name: { ru: 'Айс-латте', en: 'Iced latte' }, recipe: ['shot', 'milk', 'ice'], price: 170, unlockCost: 450 },
  cinnamonCap: { id: 'cinnamonCap', name: { ru: 'Капучино с корицей', en: 'Cinnamon cappuccino' }, recipe: ['shot', 'milk', 'foam', 'cinnamon'], price: 185, unlockCost: 550 },
  caramelLatte: { id: 'caramelLatte', name: { ru: 'Карамельный латте', en: 'Caramel latte' }, recipe: ['shot', 'milk', 'foam', 'caramel'], price: 200, unlockCost: 700 },
  mocha: { id: 'mocha', name: { ru: 'Мокко', en: 'Mocha' }, recipe: ['shot', 'cocoa', 'milk', 'cream'], price: 210, unlockCost: 800 },
};

export const DRINK_ORDER: DrinkId[] = ['espresso', 'americano', 'cappuccino', 'latte', 'icedLatte', 'cocoa', 'raf', 'cinnamonCap', 'flatWhite', 'caramelLatte', 'mocha'];
export const START_MENU: DrinkId[] = ['espresso', 'americano', 'cappuccino'];

export const STOCK_PACKS: Record<StockId, { name: L10n; icon: string; amount: number; cost: number }> = {
  beans: { name: { ru: 'Зёрна', en: 'Beans' }, icon: '🫘', amount: 20, cost: 300 },
  milk: { name: { ru: 'Молоко', en: 'Milk' }, icon: '🥛', amount: 20, cost: 240 },
  syrup: { name: { ru: 'Сиропы', en: 'Syrups' }, icon: '🍯', amount: 10, cost: 180 },
  cocoa: { name: { ru: 'Какао', en: 'Cocoa' }, icon: '🍫', amount: 10, cost: 160 },
  cups: { name: { ru: 'Стаканы с собой', en: 'Takeaway cups' }, icon: '🥤', amount: 20, cost: 80 },
  catFood: { name: { ru: 'Корм для кота', en: 'Cat food' }, icon: '🐟', amount: 10, cost: 120 },
};

export const STOCK_ORDER: StockId[] = ['beans', 'milk', 'syrup', 'cocoa', 'cups', 'catFood'];

export const UPGRADES: Record<UpgradeId, { name: L10n; desc: L10n; cost: number; icon: string }> = {
  fridge: {
    name: { ru: 'Второй холодильник', en: 'Second fridge' },
    desc: { ru: 'Молока помещается 80 вместо 40', en: 'Milk capacity 80 instead of 40' },
    cost: 600,
    icon: '🧊',
  },
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
      { name: { ru: 'Домашняя', en: 'Home machine' }, desc: { ru: 'Один рожок', en: 'One group head' }, cost: 0 },
      { name: { ru: 'Двухрожковая', en: 'Two-group' }, desc: { ru: 'Два эспрессо одновременно, +15% чаевых', en: 'Two shots at once, +15% tips' }, cost: 800 },
      { name: { ru: 'Профессиональная', en: 'Professional' }, desc: { ru: 'Два рожка, эспрессо вдвое быстрее, +25% чаевых', en: 'Two heads, shots twice as fast, +25% tips' }, cost: 1800 },
    ],
  },
  vitrine: {
    name: { ru: 'Витрина', en: 'Pastry display' },
    icon: '🥐',
    levels: [
      { name: { ru: 'Подставка для торта', en: 'Cake stand' }, desc: { ru: 'Выпечки почти нет', en: 'Hardly any pastry' }, cost: 0 },
      { name: { ru: 'Витрина с выпечкой', en: 'Pastry case' }, desc: { ru: 'Гость за столиком берёт выпечку: +12 🪙', en: 'Dine-in guests buy pastry: +12 🪙' }, cost: 600 },
      { name: { ru: 'Большая витрина', en: 'Large display' }, desc: { ru: 'Гость за столиком берёт выпечку: +25 🪙', en: 'Dine-in guests buy pastry: +25 🪙' }, cost: 1400 },
    ],
  },
  tables: {
    name: { ru: 'Столики', en: 'Tables' },
    icon: '🪑',
    levels: [
      { name: { ru: 'Простые столики', en: 'Simple tables' }, desc: { ru: '4 столика', en: '4 tables' }, cost: 0 },
      { name: { ru: 'Уютные столики', en: 'Cozy tables' }, desc: { ru: '5 столиков, гости довольнее (+5%)', en: '5 tables, happier guests (+5%)' }, cost: 700 },
      { name: { ru: 'Веранда', en: 'Terrace' }, desc: { ru: '6 столиков, +1 гость за смену, гости довольнее (+10%)', en: '6 tables, +1 guest per shift, happier guests (+10%)' }, cost: 1500 },
    ],
  },
  decor: {
    name: { ru: 'Декор зала', en: 'Hall decor' },
    icon: '🪴',
    levels: [
      { name: { ru: 'Голые стены', en: 'Bare walls' }, desc: { ru: 'Пока пусто', en: 'Empty for now' }, cost: 0 },
      { name: { ru: 'Растения и лампы', en: 'Plants and lamps' }, desc: { ru: 'Гости ждут на 3 с дольше', en: 'Guests wait 3s longer' }, cost: 1000 },
      { name: { ru: 'Уютный зал', en: 'Cozy hall' }, desc: { ru: 'Гости ждут на 6 с дольше и довольнее (+5%)', en: 'Guests wait 6s longer and are happier (+5%)' }, cost: 2000 },
    ],
  },
};

export const CAFE_SLOT_ORDER: CafeSlot[] = ['machine', 'vitrine', 'tables', 'decor'];
export const SLOT_MAX = 3;

export const ROLES: Record<Role, { name: L10n; icon: string; desc: L10n }> = {
  barista: {
    name: { ru: 'Бариста', en: 'Barista' },
    icon: '☕',
    desc: { ru: 'Обслуживает гостей, варит кофе, убирает столики', en: 'Serves guests, makes coffee, cleans tables' },
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

export const UPGRADE_ORDER: UpgradeId[] = ['fridge'];

export interface DecorItem {
  id: string;
  slot: DecorSlot;
  variant: number; // 0..2 — влияет на цвет/форму заглушки
  name: L10n;
  cost: number;
  comfort: number;
}

const SLOT_NAMES: Record<DecorSlot, L10n> = {
  wall: { ru: 'Картина', en: 'Painting' },
  window: { ru: 'Шторы', en: 'Curtains' },
  rug: { ru: 'Ковёр', en: 'Rug' },
  sofa: { ru: 'Диван', en: 'Sofa' },
  table: { ru: 'Столик', en: 'Table' },
  lamp: { ru: 'Лампа', en: 'Lamp' },
  plant: { ru: 'Растение', en: 'Plant' },
  shelf: { ru: 'Полка', en: 'Shelf' },
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
};

export const DECOR: DecorItem[] = SLOT_ORDER.flatMap((slot) =>
  [0, 1, 2].map((variant) => ({
    id: `${slot}-${variant}`,
    slot,
    variant,
    name: {
      ru: `${SLOT_NAMES[slot].ru} (${VARIANT_NAMES[variant].ru})`,
      en: `${VARIANT_NAMES[variant].en[0].toUpperCase()}${VARIANT_NAMES[variant].en.slice(1)} ${SLOT_NAMES[slot].en.toLowerCase()}`,
    },
    cost: Math.round(SLOT_BASE_COST[slot] * [1, 2, 4][variant]),
    comfort: [1, 2, 3][variant],
  })),
);

export const DECOR_BY_ID: Record<string, DecorItem> = Object.fromEntries(DECOR.map((d) => [d.id, d]));

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
