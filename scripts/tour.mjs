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
const tab = (p, re) => p.locator('.tab-btn', { hasText: re }).click();
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
      if (shots && n === 1) await shot(page, `${label}-ready`);
      await ready.first().click({ timeout: 300 }).catch(() => {});
      n++;
      continue;
    }
    const seat = page.locator('.guest.target').first();
    if (await seat.count()) {
      const todo = await seat.locator('.ri:not(.done)').allInnerTexts().catch(() => []);
      if (todo.length) await page.locator('.station', { hasText: ICON[todo[0].trim()] }).first().click({ timeout: 300 }).catch(() => {});
      if (shots && n === 0 && tick === 12) await shot(page, `${label}-building`);
    }
    await page.waitForTimeout(110);
  }
  await page.waitForSelector('.result', { timeout: 90_000 });
  await page.waitForTimeout(900);
  if (shots) await shot(page, `${label}-result`);
}

const a = await open('anya');
await a.getByText('Кем будешь в кофейне?').waitFor();
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
await mutate(a, "s.money = 9000; s.menu = ['espresso','americano','cappuccino','latte','icedLatte','cocoa','raf','cinnamonCap','flatWhite','caramelLatte','mocha']; s.featured = ['latte','icedLatte','raf','cinnamonCap','caramelLatte','mocha']; s.stock = { beans: 40, milk: 40, syrup: 30, cocoa: 20, catFood: 0 }; s.upgrades.machinePro = true; s.upgrades.terrace = true; for (const p of s.players) { p.energy = 3; p.energyAt = Date.now(); }");
await a.reload();
await a.waitForSelector('.hud');
await shot(a, '04-barista-counter-rich');
await a.getByRole('button', { name: /Встать за стойку/ }).click();
await a.waitForTimeout(6000);
// собрать часть заказа и снять разрез чашки
for (let k = 0; k < 2; k++) {
  const todo = await a.locator('.guest.target').first().locator('.ri:not(.done)').allInnerTexts();
  if (todo.length) await a.locator('.station', { hasText: ICON[todo[0].trim()] }).first().click();
}
await a.waitForTimeout(700);
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
await mutate(b, "s.room.unlocked = true; s.cat = { name: 'Пломбир', hunger: 40, mood: 70, updatedAt: Date.now() };");
await b.reload();
await b.waitForSelector('.hud');
await tab(b, 'Квартира');
await shot(b, '17-room');
console.log('errors', errors);
await browser.close();
