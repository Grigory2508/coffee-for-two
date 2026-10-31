// Весь игровой контент и баланс в одном месте. Цифры — стартовые, для плейтеста.

export type L10n = { ru: string; en: string };

export type ComponentId = 'shot' | 'water' | 'milk' | 'foam' | 'syrup' | 'cocoa';
export type StockId = 'beans' | 'milk' | 'syrup' | 'cocoa' | 'catFood';
export type DrinkId = 'espresso' | 'americano' | 'cappuccino' | 'latte' | 'raf' | 'cocoa';
export type UpgradeId = 'machinePro' | 'fridge' | 'cozyHall';
export type DecorSlot = 'wall' | 'window' | 'rug' | 'sofa' | 'table' | 'lamp' | 'plant' | 'shelf';
export type RegularId = 'mark' | 'vera' | 'tolik';

export const CONFIG = {
  maxPlayers: 2,
  energyMax: 3,
  energyRegenMs: 4 * 3600_000,
  shiftGuests: 5,
  shiftDurationMs: 75_000,
  basePatienceMs: 16_000,
  startMoney: 300,
  startStock: { beans: 20, milk: 20, syrup: 0, cocoa: 0, catFood: 0 } as Record<StockId, number>,
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

export const COMPONENTS: Record<ComponentId, { name: L10n; icon: string; uses?: StockId }> = {
  shot: { name: { ru: 'Эспрессо', en: 'Shot' }, icon: '☕', uses: 'beans' },
  water: { name: { ru: 'Вода', en: 'Water' }, icon: '💧' },
  milk: { name: { ru: 'Молоко', en: 'Milk' }, icon: '🥛', uses: 'milk' },
  foam: { name: { ru: 'Пенка', en: 'Foam' }, icon: '☁️', uses: 'milk' },
  syrup: { name: { ru: 'Сироп', en: 'Syrup' }, icon: '🍯', uses: 'syrup' },
  cocoa: { name: { ru: 'Какао', en: 'Cocoa' }, icon: '🍫', uses: 'cocoa' },
};

export const COMPONENT_ORDER: ComponentId[] = ['shot', 'water', 'milk', 'foam', 'syrup', 'cocoa'];

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
};

export const DRINK_ORDER: DrinkId[] = ['espresso', 'americano', 'cappuccino', 'latte', 'cocoa', 'raf'];
export const START_MENU: DrinkId[] = ['espresso', 'americano', 'cappuccino'];

export const STOCK_PACKS: Record<StockId, { name: L10n; icon: string; amount: number; cost: number }> = {
  beans: { name: { ru: 'Зёрна', en: 'Beans' }, icon: '🫘', amount: 20, cost: 300 },
  milk: { name: { ru: 'Молоко', en: 'Milk' }, icon: '🥛', amount: 20, cost: 240 },
  syrup: { name: { ru: 'Сироп', en: 'Syrup' }, icon: '🍯', amount: 10, cost: 180 },
  cocoa: { name: { ru: 'Какао', en: 'Cocoa' }, icon: '🍫', amount: 10, cost: 160 },
  catFood: { name: { ru: 'Корм для кота', en: 'Cat food' }, icon: '🐟', amount: 10, cost: 120 },
};

export const STOCK_ORDER: StockId[] = ['beans', 'milk', 'syrup', 'cocoa', 'catFood'];

export const UPGRADES: Record<UpgradeId, { name: L10n; desc: L10n; cost: number; icon: string }> = {
  machinePro: {
    name: { ru: 'Кофемашина Pro', en: 'Pro espresso machine' },
    desc: { ru: '+15% чаевых за каждый напиток', en: '+15% tips on every drink' },
    cost: 800,
    icon: '⚙️',
  },
  fridge: {
    name: { ru: 'Второй холодильник', en: 'Second fridge' },
    desc: { ru: 'Молока помещается 80 вместо 40', en: 'Milk capacity 80 instead of 40' },
    cost: 600,
    icon: '🧊',
  },
  cozyHall: {
    name: { ru: 'Уютный зал', en: 'Cozy hall' },
    desc: { ru: 'Гости ждут на 3 секунды дольше и довольнее', en: 'Guests wait 3s longer and are happier' },
    cost: 1000,
    icon: '🛋️',
  },
};

export const UPGRADE_ORDER: UpgradeId[] = ['fridge', 'machinePro', 'cozyHall'];

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
