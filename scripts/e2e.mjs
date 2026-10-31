// Сквозной прогон в Playwright: два игрока в двух вкладках одного браузера.
// Запуск: npm run build && npx vite preview --port 4173 & node scripts/e2e.mjs
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const BASE = process.env.BASE ?? 'http://localhost:4173/';
const OUT = process.env.OUT ?? 'screens';
mkdirSync(OUT, { recursive: true });

const ICON_TO_STATION = { '☕': 'Эспрессо', '💧': 'Вода', '🥛': 'Молоко', '☁️': 'Пенка', '🍯': 'Сироп', '🍫': 'Какао' };
const errors = [];

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, locale: 'ru-RU' });
await ctx.route('https://telegram.org/**', (r) => r.fulfill({ status: 200, body: '' }));

async function open(as, query = '') {
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(`${as}: ${e.message}`));
  page.on('console', (m) => m.type() === 'error' && errors.push(`${as} console: ${m.text()}`));
  await page.goto(`${BASE}?as=${as}${query}`);
  return page;
}

async function shot(page, name) {
  await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: true });
}

async function playShift(page, label) {
  await page.getByRole('button', { name: /Встать за стойку|Вернуться за стойку/ }).click();
  await page.waitForSelector('.shift');
  let screenshotTaken = false;
  for (let tick = 0; tick < 400; tick++) {
    if (await page.locator('.result').count()) break;
    const guest = page.locator('.guest.active');
    if (await guest.count()) {
      const recipe = (await guest.locator('.guest-recipe').innerText()).split(/\s+/).filter(Boolean);
      for (const icon of recipe) {
        await page.locator('.station', { hasText: ICON_TO_STATION[icon] }).click();
      }
      if (!screenshotTaken) {
        await shot(page, `${label}-shift`);
        screenshotTaken = true;
      }
      await page.getByRole('button', { name: 'Подать' }).click();
    }
    await page.waitForTimeout(150);
  }
  await page.waitForSelector('.result', { timeout: 90_000 });
  await shot(page, `${label}-result`);
  const earned = await page.locator('.big-number').innerText();
  await page.getByRole('button', { name: 'Назад' }).click();
  return earned;
}

// --- игрок A создаёт кофейню
const a = await open('anya');
await page_wait(a, 'Откройте кофейню вдвоём');
await shot(a, '01-welcome');
await a.getByRole('button', { name: 'Открыть кофейню' }).click();
await a.waitForSelector('.partner-card');
await shot(a, '02-cafe-solo');

const code = await a.evaluate(() => Object.keys(localStorage).find((k) => k.startsWith('cft:cafe:')).slice(9));
console.log('cafe code', code);

console.log('A shift 1:', await playShift(a, '03-a'));

// --- игрок B приходит по приглашению
const b = await open('borya', `&startapp=cafe_${code}`);
await page_wait(b, 'Тебя зовут в кофейню');
await shot(b, '04-invite');
await b.getByRole('button', { name: 'Войти в кофейню' }).click();
await b.waitForSelector('.partner-card');
await shot(b, '05-b-cafe');

// B закупается на складе
await b.getByRole('button', { name: /Склад/ }).click();
await b.locator('.item', { hasText: 'Молоко' }).getByRole('button').click();
await shot(b, '06-b-manage');
await b.getByRole('button', { name: /Кофейня/ }).first().click();
console.log('B shift 1:', await playShift(b, '07-b'));

// A видит сводку о действиях B
await a.bringToFront();
await a.waitForTimeout(500);
await shot(a, '08-a-digest');
const digest = await a.locator('.digest').innerText().catch(() => '');
console.log('A digest:', digest.replace(/\n/g, ' | '));

// Быстро доводим до ворот квартиры: отладка (силы+деньги) и смены
for (let i = 0; i < 3; i++) {
  for (const [p, n] of [[a, 'a'], [b, 'b']]) {
    await p.locator('.debug-fab').click();
    await p.getByRole('button', { name: /Силы и \+1000/ }).click();
    await p.locator('.debug .link').click();
    await p.getByRole('button', { name: /Склад/ }).click();
    for (const item of ['Зёрна', 'Молоко']) {
      const btn = p.locator('.item', { hasText: item }).getByRole('button');
      if (await btn.isEnabled()) await btn.click();
    }
    await p.getByRole('button', { name: /Кофейня/ }).first().click();
    console.log(`${n} extra shift:`, await playShift(p, `09-${n}-${i}`));
  }
}

await a.getByRole('button', { name: /Квартира/ }).click();
await a.waitForTimeout(300);
await shot(a, '10-a-room');
if (await a.locator('.cat-card, input[placeholder="Имя кота"]').count()) {
  await a.locator('input[placeholder="Имя кота"]').fill('Барсик');
  await a.getByRole('button', { name: 'Взять домой' }).click();
  await a.locator('.decor').first().getByRole('button').click();
  await a.waitForTimeout(300);
  await shot(a, '11-a-room-cat');
}

await b.bringToFront();
await b.getByRole('button', { name: /Мы/ }).click();
await b.locator('input[placeholder="Записка напарнику…"]').fill('Купил молоко, твоя смена!');
await b.getByRole('button', { name: 'Оставить' }).click();
await shot(b, '12-b-board');
await b.getByRole('button', { name: /Рейтинг/ }).click();
await shot(b, '13-b-top');

// EN-версия
const en = await open('eve', '');
await en.evaluate(() => localStorage.setItem('cft:lang', 'en'));
await en.reload();
await page_wait(en, 'Open a café together');
await shot(en, '14-en-welcome');

console.log('errors:', errors.length ? errors : 'none');
await browser.close();
if (errors.length) process.exit(1);

async function page_wait(page, text) {
  await page.getByText(text).first().waitFor({ timeout: 10_000 });
}
