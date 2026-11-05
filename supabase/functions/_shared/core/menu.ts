// Меню первой очереди: классика и рафы, сборка по шагам, вкусы, молоко и сливки, десерты.
// Всё по-честному: порядок шагов и состав — как в настоящей кофейне (см. документ «Меню „Нашего места“»).

export type L10n = { ru: string; en: string };

// ---------- шаги сборки ----------

export type Vessel = 'small' | 'capCup' | 'tall' | 'paper';
export type Base = 'espresso' | 'double' | 'ristretto' | 'lungo';
export type FlavorId =
  | 'vanilla' | 'caramel' | 'saltedCaramel' | 'chocolate'
  | 'hazelnut' | 'pistachio' | 'halva' | 'popcorn'
  | 'orange' | 'raspberry' | 'coconut' | 'lavender'
  | 'honey' | 'pumpkin' | 'gingerbread' | 'mandarin';
export type MilkKind = 'regular' | 'lactoFree' | 'oat' | 'coconut';
export type DairyType = 'milk' | 'cream';
export type Temp = 'hot' | 'cold';
export type Texture = 'none' | 'thin' | 'thick';
export type ToppingId = 'lemon' | 'halvaCrumb' | 'whipped' | 'cinnamon';
export type DessertId =
  | 'croissant' | 'almondCroissant' | 'painChoc' | 'cinnamonBun'
  | 'medovik' | 'napoleon' | 'carrotCake' | 'redVelvet'
  | 'cheesecake' | 'tiramisu' | 'eclair' | 'kartoshka'
  | 'muffin' | 'brownie' | 'cookie' | 'macaron';

export type StepId = 'vessel' | 'ice' | 'base' | 'flavor' | 'dairy' | 'texture' | 'whip' | 'water' | 'topping';
/** Порядок шагов на смене. 6а (текстура) и 6б (взбить) — взаимоисключающие. */
export const STEP_ORDER: StepId[] = ['vessel', 'ice', 'base', 'flavor', 'dairy', 'texture', 'whip', 'water', 'topping'];
export const STEP_NAMES: Record<StepId, L10n> = {
  vessel: { ru: 'Посуда', en: 'Vessel' },
  ice: { ru: 'Лёд', en: 'Ice' },
  base: { ru: 'Основа', en: 'Coffee' },
  flavor: { ru: 'Вкус', en: 'Flavor' },
  dairy: { ru: 'Молоко или сливки', en: 'Milk or cream' },
  texture: { ru: 'Текстура', en: 'Texture' },
  whip: { ru: 'Взбить', en: 'Whip' },
  water: { ru: 'Долив', en: 'Top up' },
  topping: { ru: 'Топпинг', en: 'Topping' },
};
export const STEP_NUM: Record<StepId, string> = { vessel: '1', ice: '2', base: '3', flavor: '4', dairy: '5', texture: '6', whip: '6', water: '7', topping: '8' };

export const VESSELS: Record<Vessel, { name: L10n; ceramic: boolean }> = {
  small: { name: { ru: 'Маленькая чашка', en: 'Small cup' }, ceramic: true },
  capCup: { name: { ru: 'Чашка для капучино', en: 'Cappuccino cup' }, ceramic: true },
  tall: { name: { ru: 'Высокий стакан', en: 'Tall glass' }, ceramic: false },
  paper: { name: { ru: 'Бумажный стакан', en: 'Paper cup' }, ceramic: false },
};
export const VESSEL_ORDER: Vessel[] = ['small', 'capCup', 'tall', 'paper'];

export const BASES: Record<Base, { name: L10n; beans: number }> = {
  espresso: { name: { ru: 'Эспрессо', en: 'Espresso' }, beans: 1 },
  double: { name: { ru: 'Двойной', en: 'Double' }, beans: 2 },
  ristretto: { name: { ru: 'Ристретто', en: 'Ristretto' }, beans: 1 },
  lungo: { name: { ru: 'Лунго', en: 'Lungo' }, beans: 1 },
};
export const BASE_ORDER: Base[] = ['espresso', 'double', 'ristretto', 'lungo'];

/** Сетка вкусов 4×4: ряды — сладкие, ореховые, фрукты и цветы, тёплые и сезонные. */
export const FLAVORS: Record<FlavorId, { name: L10n; color: string }> = {
  vanilla: { name: { ru: 'Ваниль', en: 'Vanilla' }, color: '#f3dc8e' },
  caramel: { name: { ru: 'Карамель', en: 'Caramel' }, color: '#c97a2a' },
  saltedCaramel: { name: { ru: 'Солёная карамель', en: 'Salted caramel' }, color: '#b8702c' },
  chocolate: { name: { ru: 'Шоколад', en: 'Chocolate' }, color: '#5a3524' },
  hazelnut: { name: { ru: 'Фундук', en: 'Hazelnut' }, color: '#a8805a' },
  pistachio: { name: { ru: 'Фисташка', en: 'Pistachio' }, color: '#9bbf6a' },
  halva: { name: { ru: 'Халва', en: 'Halva' }, color: '#d8c3a0' },
  popcorn: { name: { ru: 'Попкорн', en: 'Popcorn' }, color: '#e2b84a' },
  orange: { name: { ru: 'Апельсин', en: 'Orange' }, color: '#f29a3a' },
  raspberry: { name: { ru: 'Малина', en: 'Raspberry' }, color: '#d9536a' },
  coconut: { name: { ru: 'Кокос', en: 'Coconut' }, color: '#f2efe6' },
  lavender: { name: { ru: 'Лаванда', en: 'Lavender' }, color: '#a991cf' },
  honey: { name: { ru: 'Мёд', en: 'Honey' }, color: '#e8b13a' },
  pumpkin: { name: { ru: 'Тыква', en: 'Pumpkin' }, color: '#e07a2e' },
  gingerbread: { name: { ru: 'Пряник', en: 'Gingerbread' }, color: '#8a5530' },
  mandarin: { name: { ru: 'Мандарин', en: 'Mandarin' }, color: '#f08a24' },
};
export const FLAVOR_ORDER: FlavorId[] = [
  'vanilla', 'caramel', 'saltedCaramel', 'chocolate',
  'hazelnut', 'pistachio', 'halva', 'popcorn',
  'orange', 'raspberry', 'coconut', 'lavender',
  'honey', 'pumpkin', 'gingerbread', 'mandarin',
];

export const MILKS: Record<MilkKind, { name: L10n; cream: L10n; short: L10n; color: string }> = {
  regular: { name: { ru: 'Обычное молоко', en: 'Whole milk' }, cream: { ru: 'Обычные сливки', en: 'Cream' }, short: { ru: 'обычное', en: 'whole' }, color: '#f4ead8' },
  lactoFree: { name: { ru: 'Безлактозное молоко', en: 'Lactose-free milk' }, cream: { ru: 'Безлактозные сливки', en: 'Lactose-free cream' }, short: { ru: 'безлактозное', en: 'lactose-free' }, color: '#f1ecdf' },
  oat: { name: { ru: 'Овсяное молоко', en: 'Oat milk' }, cream: { ru: 'Овсяные сливки', en: 'Oat cream' }, short: { ru: 'овсяное', en: 'oat' }, color: '#e8d9b8' },
  coconut: { name: { ru: 'Кокосовое молоко', en: 'Coconut milk' }, cream: { ru: 'Кокосовые сливки', en: 'Coconut cream' }, short: { ru: 'кокосовое', en: 'coconut' }, color: '#f7f4ee' },
};
/** Порядок открытия холодильником: уровень 1 — обычное, 2 — +овсяное, 3 — +безлактозное и кокосовое. */
export const FRIDGE_KINDS: MilkKind[][] = [['regular'], ['regular', 'oat'], ['regular', 'oat', 'lactoFree', 'coconut']];
/** Клетки сетки молока 4×4: слева молоко, справа сливки; сверху горячие, снизу холодные. */
export interface DairyPick {
  kind: MilkKind;
  type: DairyType;
  temp: Temp;
}
export const DAIRY_GRID: DairyPick[] = (['hot', 'cold'] as Temp[]).flatMap((temp) =>
  [
    ['regular', 'lactoFree'],
    ['oat', 'coconut'],
  ].flatMap((pair) => [
    ...pair.map((kind) => ({ kind: kind as MilkKind, type: 'milk' as DairyType, temp })),
    ...pair.map((kind) => ({ kind: kind as MilkKind, type: 'cream' as DairyType, temp })),
  ]),
);

export const TEXTURES: Record<Texture, L10n> = {
  none: { ru: 'Без пены', en: 'No foam' },
  thin: { ru: 'Тонкая пена', en: 'Thin foam' },
  thick: { ru: 'Густая пена', en: 'Thick foam' },
};
export const TEXTURE_ORDER: Texture[] = ['none', 'thin', 'thick'];

export const TOPPINGS: Record<ToppingId, { name: L10n; color: string }> = {
  cinnamon: { name: { ru: 'Корица', en: 'Cinnamon' }, color: '#8b4a22' },
  whipped: { name: { ru: 'Взбитые сливки', en: 'Whipped cream' }, color: '#ffffff' },
  lemon: { name: { ru: 'Лимонная цедра', en: 'Lemon zest' }, color: '#f2d64b' },
  halvaCrumb: { name: { ru: 'Крошка халвы', en: 'Halva crumbs' }, color: '#d8c3a0' },
};
export const TOPPING_ORDER: ToppingId[] = ['cinnamon', 'whipped', 'lemon', 'halvaCrumb'];

// ---------- напитки ----------

export type DrinkId =
  | 'espresso' | 'doppio' | 'ristretto' | 'lungo' | 'romano' | 'conPanna'
  | 'macchiato' | 'cortado' | 'piccolo' | 'americano' | 'flatWhite' | 'cappuccino' | 'cinnamonCap'
  | 'latte' | 'caramelLatte' | 'mocha'
  | 'rafClassic' | 'rafCaramel' | 'rafSalted' | 'rafHalva' | 'rafHazelnut' | 'rafPistachio' | 'rafPopcorn'
  | 'rafCitrus' | 'rafLavender' | 'rafHoney' | 'rafCoconut' | 'rafRaspberry'
  | 'rafPumpkin' | 'rafGingerbread' | 'rafMandarin';

/** Рецепт по шагам. Вид молока не входит в рецепт — его выбирает гость. */
export interface Recipe {
  vessel: Vessel;
  ice?: true;
  base: Base;
  flavor?: FlavorId;
  dairy?: { type: DairyType; temp: Temp };
  texture?: Texture;
  whip?: true;
  water?: true;
  topping?: ToppingId;
}

export type Audience = 'black' | 'milky' | 'sweet';

export interface Drink {
  id: DrinkId;
  name: L10n;
  recipe: Recipe;
  price: number;
  unlockCost: number;
  /** Вес в желаниях гостей (популярность). */
  pop: number;
  audience: Audience;
  /** Месяцы (1..12), когда напиток можно поставить в меню дня. Без поля — всегда. */
  season?: number[];
}

const hotMilk = { type: 'milk' as const, temp: 'hot' as const };
const hotCream = { type: 'cream' as const, temp: 'hot' as const };
const coldCream = { type: 'cream' as const, temp: 'cold' as const };

const D = (id: DrinkId, ru: string, en: string, recipe: Recipe, price: number, unlockCost: number, pop: number, audience: Audience, season?: number[]): Drink => ({
  id, name: { ru, en }, recipe, price, unlockCost, pop, audience, season,
});
const raf = (id: DrinkId, ru: string, en: string, flavor: FlavorId, price: number, unlockCost: number, pop: number, extra: Partial<Recipe> = {}, season?: number[]) =>
  D(id, ru, en, { vessel: 'tall', base: 'espresso', flavor, dairy: extra.ice ? coldCream : hotCream, whip: true, ...extra }, price, unlockCost, pop, 'sweet', season);

export const DRINK_LIST: Drink[] = [
  D('espresso', 'Эспрессо', 'Espresso', { vessel: 'small', base: 'espresso' }, 80, 0, 5, 'black'),
  D('doppio', 'Доппио', 'Doppio', { vessel: 'small', base: 'double' }, 110, 200, 3, 'black'),
  D('ristretto', 'Ристретто', 'Ristretto', { vessel: 'small', base: 'ristretto' }, 90, 250, 1, 'black'),
  D('lungo', 'Лунго', 'Lungo', { vessel: 'small', base: 'lungo' }, 90, 250, 1, 'black'),
  D('romano', 'Романо', 'Romano', { vessel: 'small', base: 'espresso', topping: 'lemon' }, 100, 300, 1, 'black'),
  D('conPanna', 'Кон панна', 'Con panna', { vessel: 'small', base: 'espresso', topping: 'whipped' }, 120, 300, 1, 'sweet'),
  D('macchiato', 'Макиато', 'Macchiato', { vessel: 'small', base: 'espresso', dairy: hotMilk, texture: 'thick' }, 110, 300, 3, 'milky'),
  D('cortado', 'Кортадо', 'Cortado', { vessel: 'small', base: 'espresso', dairy: hotMilk, texture: 'none' }, 130, 350, 3, 'milky'),
  D('piccolo', 'Пикколо латте', 'Piccolo latte', { vessel: 'small', base: 'ristretto', dairy: hotMilk, texture: 'thin' }, 140, 400, 2, 'milky'),
  D('americano', 'Американо', 'Americano', { vessel: 'capCup', base: 'espresso', water: true }, 100, 0, 8, 'black'),
  D('flatWhite', 'Флэт уайт', 'Flat white', { vessel: 'capCup', base: 'double', dairy: hotMilk, texture: 'thin' }, 180, 600, 6, 'milky'),
  D('cappuccino', 'Капучино', 'Cappuccino', { vessel: 'capCup', base: 'espresso', dairy: hotMilk, texture: 'thick' }, 150, 0, 10, 'milky'),
  D('cinnamonCap', 'Капучино с корицей', 'Cinnamon cappuccino', { vessel: 'capCup', base: 'espresso', dairy: hotMilk, texture: 'thick', topping: 'cinnamon' }, 170, 450, 3, 'milky'),
  D('latte', 'Латте', 'Latte', { vessel: 'tall', base: 'espresso', dairy: hotMilk, texture: 'thin' }, 170, 300, 10, 'milky'),
  D('caramelLatte', 'Карамельный латте', 'Caramel latte', { vessel: 'tall', base: 'espresso', flavor: 'caramel', dairy: hotMilk, texture: 'thin' }, 200, 700, 5, 'sweet'),
  D('mocha', 'Мокко', 'Mocha', { vessel: 'tall', base: 'espresso', flavor: 'chocolate', dairy: hotMilk, texture: 'thin', topping: 'whipped' }, 210, 800, 5, 'sweet'),
  raf('rafClassic', 'Классический раф', 'Classic raf', 'vanilla', 190, 500, 6),
  raf('rafCaramel', 'Карамельный раф', 'Caramel raf', 'caramel', 200, 600, 3),
  raf('rafSalted', 'Раф «Солёная карамель»', 'Salted caramel raf', 'saltedCaramel', 210, 650, 3),
  raf('rafHalva', 'Халва-раф', 'Halva raf', 'halva', 220, 700, 2, { topping: 'halvaCrumb' }),
  raf('rafHazelnut', 'Ореховый раф', 'Hazelnut raf', 'hazelnut', 210, 650, 3),
  raf('rafPistachio', 'Фисташковый раф', 'Pistachio raf', 'pistachio', 230, 750, 2),
  raf('rafPopcorn', 'Раф «Попкорн»', 'Popcorn raf', 'popcorn', 210, 650, 2),
  raf('rafCitrus', 'Цитрусовый раф', 'Citrus raf', 'orange', 210, 650, 2),
  raf('rafLavender', 'Лавандовый раф', 'Lavender raf', 'lavender', 220, 700, 2),
  raf('rafHoney', 'Медовый раф', 'Honey raf', 'honey', 210, 650, 2),
  raf('rafCoconut', 'Кокосовый раф', 'Coconut raf', 'coconut', 220, 700, 2, { ice: true }),
  raf('rafRaspberry', 'Малиновый раф', 'Raspberry raf', 'raspberry', 220, 700, 2, { ice: true }),
  raf('rafPumpkin', 'Тыквенный раф', 'Pumpkin raf', 'pumpkin', 240, 600, 6, { topping: 'cinnamon' }, [9, 10, 11]),
  raf('rafGingerbread', 'Пряничный раф', 'Gingerbread raf', 'gingerbread', 240, 600, 6, { topping: 'cinnamon' }, [12]),
  raf('rafMandarin', 'Мандариновый раф', 'Mandarin raf', 'mandarin', 240, 600, 6, {}, [12, 1]),
];
export const DRINKS = Object.fromEntries(DRINK_LIST.map((d) => [d.id, d])) as Record<DrinkId, Drink>;
export const DRINK_ORDER: DrinkId[] = DRINK_LIST.map((d) => d.id);
export const START_MENU: DrinkId[] = ['espresso', 'americano', 'cappuccino'];

export const isRaf = (id: DrinkId) => id.startsWith('raf');
export function inSeason(id: DrinkId, now: number): boolean {
  const s = DRINKS[id]?.season;
  if (!s) return true;
  return s.includes(new Date(now).getUTCMonth() + 1);
}

/** Какую посуду ждёт гость: с собой — бумажный стакан вместо посуды из рецепта. */
export function expectedVessel(drink: DrinkId, takeaway: boolean): Vessel {
  return takeaway ? 'paper' : DRINKS[drink].recipe.vessel;
}

// ---------- десерты ----------

export const DESSERTS: Record<DessertId, { name: L10n; price: number; pair: DrinkId; pop: number }> = {
  croissant: { name: { ru: 'Круассан', en: 'Croissant' }, price: 120, pair: 'cappuccino', pop: 10 },
  almondCroissant: { name: { ru: 'Миндальный круассан', en: 'Almond croissant' }, price: 160, pair: 'flatWhite', pop: 5 },
  painChoc: { name: { ru: 'Пан-о-шоколя', en: 'Pain au chocolat' }, price: 150, pair: 'latte', pop: 6 },
  cinnamonBun: { name: { ru: 'Булочка с корицей', en: 'Cinnamon bun' }, price: 180, pair: 'cinnamonCap', pop: 8 },
  medovik: { name: { ru: 'Медовик', en: 'Honey cake' }, price: 200, pair: 'rafHoney', pop: 6 },
  napoleon: { name: { ru: 'Наполеон', en: 'Napoleon' }, price: 200, pair: 'americano', pop: 5 },
  carrotCake: { name: { ru: 'Морковный торт', en: 'Carrot cake' }, price: 220, pair: 'rafHazelnut', pop: 4 },
  redVelvet: { name: { ru: 'Красный бархат', en: 'Red velvet' }, price: 220, pair: 'latte', pop: 4 },
  cheesecake: { name: { ru: 'Чизкейк Нью-Йорк', en: 'New York cheesecake' }, price: 230, pair: 'americano', pop: 9 },
  tiramisu: { name: { ru: 'Тирамису', en: 'Tiramisu' }, price: 230, pair: 'espresso', pop: 6 },
  eclair: { name: { ru: 'Эклер', en: 'Éclair' }, price: 140, pair: 'cappuccino', pop: 5 },
  kartoshka: { name: { ru: 'Пирожное «Картошка»', en: 'Kartoshka cake' }, price: 100, pair: 'caramelLatte', pop: 3 },
  muffin: { name: { ru: 'Маффин', en: 'Muffin' }, price: 120, pair: 'americano', pop: 5 },
  brownie: { name: { ru: 'Брауни', en: 'Brownie' }, price: 150, pair: 'mocha', pop: 5 },
  cookie: { name: { ru: 'Печенье с шоколадом', en: 'Chocolate chip cookie' }, price: 90, pair: 'cortado', pop: 5 },
  macaron: { name: { ru: 'Макарон', en: 'Macaron' }, price: 80, pair: 'rafClassic', pop: 3 },
};
export const DESSERT_ORDER: DessertId[] = [
  'croissant', 'almondCroissant', 'painChoc', 'cinnamonBun',
  'medovik', 'napoleon', 'carrotCake', 'redVelvet',
  'cheesecake', 'tiramisu', 'eclair', 'kartoshka',
  'muffin', 'brownie', 'cookie', 'macaron',
];
/** Сколько видов десертов держит витрина по уровням. */
export const VITRINE_KINDS = [4, 8, 16];
/** Десерт лежит сутки, потом списывается. */
export const DESSERT_SHELF_MS = 24 * 3600_000;

// ---------- склад ----------

export type StockId = 'beans' | 'cups' | 'catFood' | `milk_${MilkKind}` | `cream_${MilkKind}` | `syr_${FlavorId}` | `ds_${DessertId}`;
export type StockGroup = 'coffee' | 'dairy' | 'flavors' | 'desserts' | 'cups';
export const MILK_ORDER: MilkKind[] = ['regular', 'oat', 'lactoFree', 'coconut'];

export interface StockPack {
  name: L10n;
  icon: string;
  amount: number;
  cost: number;
  group: StockGroup | 'home';
}

const packs: [StockId, StockPack][] = [
  ['beans', { name: { ru: 'Зёрна', en: 'Beans' }, icon: '🫘', amount: 20, cost: 300, group: 'coffee' }],
  ...MILK_ORDER.flatMap((k): [StockId, StockPack][] => [
    [`milk_${k}`, { name: MILKS[k].name, icon: '🥛', amount: 10, cost: k === 'regular' ? 110 : 150, group: 'dairy' }],
    [`cream_${k}`, { name: MILKS[k].cream, icon: '🥛', amount: 10, cost: k === 'regular' ? 150 : 190, group: 'dairy' }],
  ]),
  ...FLAVOR_ORDER.map((f): [StockId, StockPack] => [`syr_${f}`, { name: FLAVORS[f].name, icon: '🍯', amount: 10, cost: 90, group: 'flavors' }]),
  ...DESSERT_ORDER.map((d): [StockId, StockPack] => [`ds_${d}`, { name: DESSERTS[d].name, icon: '🍰', amount: 4, cost: Math.round(DESSERTS[d].price * 4 * 0.4), group: 'desserts' }]),
  ['cups', { name: { ru: 'Стаканы с собой', en: 'Takeaway cups' }, icon: '🥤', amount: 20, cost: 80, group: 'cups' }],
  ['catFood', { name: { ru: 'Корм для кота', en: 'Cat food' }, icon: '🐟', amount: 10, cost: 120, group: 'home' }],
];
export const STOCK_PACKS = Object.fromEntries(packs) as Record<StockId, StockPack>;
export const ALL_STOCK: StockId[] = packs.map(([k]) => k);
/** Склад кофейни (закупает управляющий из бюджета). Корм кота — из личных денег. */
export const STOCK_ORDER: StockId[] = ALL_STOCK.filter((k) => k !== 'catFood');
export const STOCK_GROUPS: { id: StockGroup; name: L10n }[] = [
  { id: 'coffee', name: { ru: 'Кофе', en: 'Coffee' } },
  { id: 'dairy', name: { ru: 'Молоко и сливки', en: 'Milk and cream' } },
  { id: 'flavors', name: { ru: 'Вкусы', en: 'Flavors' } },
  { id: 'desserts', name: { ru: 'Десерты', en: 'Desserts' } },
  { id: 'cups', name: { ru: 'Стаканы', en: 'Cups' } },
];
export const dairyStock = (kind: MilkKind, type: DairyType): StockId => (type === 'milk' ? `milk_${kind}` : `cream_${kind}`);
export const emptyStock = (): Record<StockId, number> => Object.fromEntries(ALL_STOCK.map((k) => [k, 0])) as Record<StockId, number>;

/** Склад на одну порцию: зёрна, вкус, молоко/сливки нужного вида, стакан с собой. */
export function recipeUsage(drink: DrinkId, milk: MilkKind = 'regular', takeaway = false): Partial<Record<StockId, number>> {
  const r = DRINKS[drink].recipe;
  const use: Partial<Record<StockId, number>> = { beans: BASES[r.base].beans };
  if (r.flavor) use[`syr_${r.flavor}`] = 1;
  if (r.dairy) use[dairyStock(milk, r.dairy.type)] = 1;
  if (takeaway) use.cups = 1;
  return use;
}
