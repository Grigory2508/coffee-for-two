// Обход всех экранов для разбора интерфейса: скриншоты в размере экрана телефона.
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const BASE = process.env.BASE ?? 'http://localhost:4173/';
const OUT = process.env.OUT ?? 'tour2';
mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, locale: 'ru-RU' });
await ctx.route('https://telegram.org/**', (r) => r.fulfill({ status: 200, body: '' }));
const errors = [];
async function open(as, q = '') {
  const p = await ctx.newPage();
  p.on('pageerror', (e) => errors.push(`${as}: ${e.message}`));
  p.on('console', (m) => m.type() === 'error' && errors.push(`${as} console: ${m.text()}`));
  await p.goto(`${BASE}?as=${as}${q}`);
  return p;
}
const shot = (p, n, full = false) => p.screenshot({ path: `${OUT}/${n}.png`, fullPage: full });
const tab = async (p, re) => {
  const ok = p.getByRole('button', { name: 'Понятно' });
  if (await ok.count()) await ok.click();
  await p.locator('.tab-btn', { hasText: re }).click();
};
const mutate = (p, src) =>
  p.evaluate((src) => {
    const k = Object.keys(localStorage).find((x) => x.startsWith('cft:cafe:'));
    const s = JSON.parse(localStorage.getItem(k));
    new Function('s', src)(s);
    s.version += 1;
    localStorage.setItem(k, JSON.stringify(s));
  }, src);

const ICON = { '☕': 'Эспрессо', '💧': 'Кипяток', '🥛': 'Молоко', '☁️': 'Пенка', '🍦': 'Сливки', '🍯': 'Ваниль', '🍮': 'Карамель', '🍫': 'Какао', '🪵': 'Корица', '🧊': 'Лёд' };

async function playShift(page, label, shots = true) {
  await page.waitForSelector('.shift');
  let n = 0;
  for (let tick = 0; tick < 700; tick++) {
    if (await page.locator('.result').count()) break;
    const dirty = page.locator('.table-spot.dirty');
    if (await dirty.count()) await dirty.first().click({ timeout: 300 }).catch(() => {});
    const ready = page.locator('.serve-btn:not([disabled])');
    if (await ready.count()) {
      await ready.first().click({ timeout: 300 }).catch(() => {});
      if (shots && n === 1) await shot(page, `${label}-ready`);
      n++;
      continue;
    }
    const card = page.locator('.guest-card:not(.empty)').first();
    if (await card.count()) {
      if (await page.locator('.vessel-pick').count()) {
        const away = await card.locator('.to-go.away').count();
        await page.locator('.vessel', { hasText: away ? /Стакан/ : /Чашка/ }).click({ timeout: 300 }).catch(() => {});
      } else {
        const src = await card.locator('.ri:not(.done) img').first().getAttribute('src', { timeout: 300 }).catch(() => null);
        if (src) await page.locator(`.station:has(img[src="${src}"])`).first().click({ timeout: 300 }).catch(() => {});
      }
      if (shots && n === 0 && tick === 14) await shot(page, `${label}-building`);
    }
    await page.waitForTimeout(110);
  }
  await page.waitForSelector('.result', { timeout: 90_000 });
  await page.waitForTimeout(900);
  if (shots) await shot(page, `${label}-result`);
}

const a = await open('anya');
await a.getByText('Кем будешь в кофейне?').waitFor();
await shot(a, '00-onboarding', true);
await a.locator('.role-card', { hasText: 'Бариста' }).click();
await a.getByRole('button', { name: 'Открыть кофейню' }).click();
await a.waitForSelector('.hud');
await shot(a, '01-barista-counter');
const { code, key } = await a.evaluate(() => {
  const k = Object.keys(localStorage).find((x) => x.startsWith('cft:cafe:'));
  const s = JSON.parse(localStorage.getItem(k));
  return { code: s.code, key: s.inviteKey };
});
await a.getByRole('button', { name: /Встать за стойку/ }).click();
await a.waitForTimeout(3000);
await shot(a, '02-shift-start');
await playShift(a, '03-shift');
await a.getByRole('button', { name: 'Назад' }).click();

// богатое меню для проверки масштаба
await mutate(a, "s.money = 9000; s.menu = ['espresso','americano','cappuccino','latte','icedLatte','cocoa','raf','cinnamonCap','flatWhite','caramelLatte','mocha']; s.featured = ['latte','icedLatte','raf','cinnamonCap','caramelLatte','mocha']; s.stock = { beans: 40, milk: 40, syrup: 30, cocoa: 20, cups: 40, catFood: 0 }; s.levels = { machine: 3, vitrine: 3 }; s.cafeDecor = { owned: ['c-lamps','c-pic-cup','c-shelf','c-sillplant','c-hanging','c-floorplant','c-succulent'], placed: { light: 'c-lamps', wall: 'c-pic-cup', shelf: 'c-shelf', window: 'c-sillplant', hanging: 'c-hanging', floor: 'c-floorplant', counter: 'c-succulent' } }; for (const p of s.players) { p.energy = 100; p.vitalsAt = Date.now(); }");
await a.reload();
await a.waitForSelector('.hud');
await shot(a, '04-barista-counter-rich');
await a.getByRole('button', { name: /Встать за стойку/ }).click();
await a.waitForTimeout(6000);
// поставить посуду, собрать часть заказа и снять разрез
{
  const card = a.locator('.guest-card:not(.empty)').first();
  await card.waitFor();
  const away = await card.locator('.to-go.away').count();
  await a.locator('.vessel', { hasText: away ? /Стакан/ : /Чашка/ }).click();
  for (let k = 0; k < 2; k++) {
    const src = await card.locator('.ri:not(.done) img').first().getAttribute('src');
    if (src) await a.locator(`.station:has(img[src="${src}"])`).first().click();
  }
  await a.waitForTimeout(700);
}
await shot(a, '05-shift-rich');
await playShift(a, '06-shift-rich', false);
await shot(a, '06-result-rich');
await a.getByRole('button', { name: 'Назад' }).click();
await tab(a, 'Кофейня');
await shot(a, '07-cafe');
await shot(a, '07-cafe-full', true);

const b = await open('borya', `&startapp=cafe_${code}_${key}`);
await b.locator('.role-card', { hasText: 'Управляющий' }).click();
await b.getByRole('button', { name: 'Подать заявку' }).click();
await b.getByText('Заявка отправлена').waitFor();
await a.bringToFront();
await a.waitForTimeout(500);
await shot(a, '08-team-badge');
await tab(a, 'Команда');
await shot(a, '09-team');
await a.getByRole('button', { name: 'Одобрить' }).click();
await b.bringToFront();
await b.waitForSelector('.hud', { timeout: 10000 });
await shot(b, '10-manager-digest');
const got = b.getByRole('button', { name: 'Понятно' });
if (await got.count()) await got.click();
await shot(b, '11-manager-stock');
await mutate(b, "s.stock.milk = 6; s.stock.syrup = 2;");
await b.reload();
await b.waitForSelector('.hud');
await shot(b, '12-manager-stock-low');
await b.getByRole('button', { name: /Пополнить до нормы/ }).click();
await shot(b, '13-manager-basket');
await shot(b, '13-manager-basket-full', true);
await b.locator('.seg', { hasText: 'Меню' }).click();
await shot(b, '14-manager-menu');
await shot(b, '14-manager-menu-full', true);
await b.locator('.seg', { hasText: 'Развитие' }).click();
await shot(b, '15-manager-growth');
await tab(b, 'Команда');
await shot(b, '16-team-manager-full', true);
await tab(b, 'Кофейня');
await shot(b, '16c-cafe-manager', true);
await b.getByRole('button', { name: /Предложить новую вывеску/ }).click();
await b.locator('.brand-editor input').first().fill('Тёплый угол');
await b.locator('.logo-opt').nth(2).click();
await shot(b, '16d-brand-editor', true);
await b.getByRole('button', { name: 'Предложить', exact: true }).click();
await b.waitForTimeout(300);
await b.getByRole('button', { name: /Выставить/ }).click();
await b.waitForTimeout(400);
await shot(b, '16e-shop');
await b.locator('.gem-pack').first().click();
await b.waitForTimeout(500);
await b.getByRole('button', { name: /Выставить/ }).click();
await b.waitForTimeout(400);
await shot(b, '16f-brand-voting', true);
await a.bringToFront();
await a.reload();
await a.waitForSelector('.hud');
{
  const ok = a.getByRole('button', { name: 'Понятно' });
  if (await ok.count()) await ok.click();
}
await tab(a, 'Кофейня');
await a.getByRole('button', { name: '👍 За' }).click();
await a.waitForTimeout(400);
await shot(a, '16g-brand-changed');
await tab(a, 'Рейтинг');
await a.waitForTimeout(500);
await shot(a, '16h-ratings');
await a.locator('.seg', { hasText: 'Команда' }).click();
await shot(a, '16i-ratings-team');
await b.bringToFront();
await b.locator('.vitals-chip').click();
await shot(b, '16b-vitals');
await b.locator('.vitals-chip').click();
await mutate(b, "s.cat = { name: 'Пломбир', hunger: 40, mood: 70, updatedAt: Date.now() }; s.home.rooms.hall.owned = ['sofa-1','plant-0','rug-2']; s.home.rooms.hall.placed = { sofa: 'sofa-1', plant: 'plant-0', rug: 'rug-2' }; s.home.rooms.kitchen.fund = 600; for (const p of s.players) p.wallet = 3000;");
await b.reload();
await b.waitForSelector('.hud');
await tab(b, 'Квартира');
await shot(b, '17-room');
await shot(b, '17-room-full', true);
await b.locator('.room-dot', { hasText: 'Кухня' }).click();
await b.waitForTimeout(600);
await shot(b, '18-kitchen-locked');
await b.getByRole('button', { name: /Вложить 900/ }).click();
await b.waitForTimeout(600);
await shot(b, '19-kitchen-open');
await b.locator('.room-dot', { hasText: 'Моя комната' }).click();
await b.waitForTimeout(600);
await shot(b, '20-my-room-locked');
await b.locator('.room-page').nth(2).getByRole('button', { name: /Вложить 800/ }).click();
await b.waitForTimeout(600);
await b.locator('.room-page').nth(2).locator('.decor', { hasText: 'Кровать' }).first().getByRole('button').click();
await b.waitForTimeout(400);
await shot(b, '21-my-room');
await b.locator('.room-dot', { hasText: /Комната ·/ }).click();
await b.waitForTimeout(600);
await shot(b, '22-other-room');
await tab(b, 'Команда');
await b.locator('.card', { hasText: 'Порадовать' }).getByRole('button', { name: /Подарок/ }).click();
await b.waitForTimeout(400);
await shot(b, '23-team-gift', true);
console.log('errors', errors);
await browser.close();
