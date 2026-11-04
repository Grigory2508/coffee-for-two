// Сквозной прогон в Playwright: команда из трёх игроков во вкладках одного браузера.
// Запуск: npm run build && npx vite preview --port 4173 & node scripts/e2e.mjs
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const BASE = process.env.BASE ?? 'http://localhost:4173/';
const OUT = process.env.OUT ?? 'screens';
mkdirSync(OUT, { recursive: true });

const ICON_TO_STATION = { '☕': 'Эспрессо', '💧': 'Кипяток', '🥛': 'Молоко', '☁️': 'Пенка', '🍦': 'Сливки', '🍯': 'Ваниль', '🍮': 'Карамель', '🍫': 'Какао', '🪵': 'Корица', '🧊': 'Лёд' };
const errors = [];
const check = (cond, msg) => {
  if (!cond) errors.push(`check failed: ${msg}`);
  console.log(cond ? '✓' : '✗', msg);
};

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, locale: 'ru-RU' });
await ctx.route('https://telegram.org/**', (r) => r.fulfill({ status: 200, body: '' }));

async function open(as, query = '') {
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(`${as}: ${e.message}`));
  page.on('console', (m) => m.type() === 'error' && errors.push(`${as} console: ${m.text()}`));
  page.on('dialog', (d) => d.accept());
  await page.goto(`${BASE}?as=${as}${query}`);
  return page;
}

const shot = (page, name) => page.screenshot({ path: `${OUT}/${name}.png`, fullPage: true });
const tab = (page, name) => page.locator('.tab-btn', { hasText: name }).click();
const debug = async (page, label) => {
  await page.locator('.debug-fab').click();
  await page.getByRole('button', { name: label }).click();
  await page.locator('.debug .link').click();
};

async function startShift(page) {
  await tab(page, 'Стойка');
  await page.getByRole('button', { name: /Встать за стойку|Вернуться за стойку/ }).click();
  await page.waitForSelector('.shift');
}

async function finishShift(page, label) {
  let served = 0;
  for (let tick = 0; tick < 800; tick++) {
    if (await page.locator('.result').count()) break;
    const dirty = page.locator('.table-spot.dirty');
    if (await dirty.count()) await dirty.first().click({ timeout: 300 }).catch(() => {});
    const ready = page.locator('.serve-btn:not([disabled])');
    if (await ready.count()) {
      await ready.first().click({ timeout: 300 }).catch(() => {});
      if (++served === 1) await shot(page, `${label}-shift`);
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
      
    }
    await page.waitForTimeout(110);
  }
  await page.waitForSelector('.result', { timeout: 90_000 });
  await shot(page, `${label}-result`);
  const earned = await page.locator('.big-number').innerText();
  await page.getByRole('button', { name: 'Назад' }).click();
  return earned;
}

async function applyTo(page, roleLabel) {
  await page.getByText('Тебя зовут в кофейню').waitFor();
  await page.locator('.role-card', { hasText: roleLabel }).click();
  await page.getByRole('button', { name: 'Подать заявку' }).click();
  await page.getByText('Заявка отправлена').waitFor();
}

async function approveAll(page) {
  await page.bringToFront();
  await tab(page, 'Команда');
  await page.getByRole('button', { name: 'Одобрить' }).first().click();
  await page.waitForTimeout(300);
}

const roleOf = async (page) => (await page.locator('.tab-btn').first().innerText()).includes('Дела') ? 'Управляющий' : 'Бариста';
const closeSheet = async (page) => {
  const b = page.getByRole('button', { name: 'Понятно' });
  if (await b.count()) await b.click();
};

// --- A создаёт кофейню бариста
const a = await open('anya');
await a.getByText('Кем будешь в кофейне?').waitFor();
await shot(a, '01-welcome-roles');
await a.locator('.role-card', { hasText: 'Бариста' }).click();
await a.getByRole('button', { name: 'Открыть кофейню' }).click();
await a.waitForSelector('.hud');
await shot(a, '02-a-barista');
check((await roleOf(a)).includes('Бариста'), 'A is barista');

const { code, key } = await a.evaluate(() => {
  const k = Object.keys(localStorage).find((x) => x.startsWith('cft:cafe:'));
  const s = JSON.parse(localStorage.getItem(k));
  return { code: s.code, key: s.inviteKey };
});
const inviteQ = `&startapp=cafe_${code}_${key}`;

check((await a.locator('.tab-btn', { hasText: 'Дела' }).count()) === 0, 'barista has no management tab');

// --- B подаёт заявку менеджером, A одобряет
const b = await open('borya', inviteQ);
await b.getByText('Тебя зовут в кофейню').waitFor();
await shot(b, '03-b-invite');
await applyTo(b, 'Управляющий');
await shot(b, '04-b-pending');
await a.bringToFront();
await a.waitForTimeout(400);
check((await a.locator('.tab-btn', { hasText: 'Команда' }).locator('.badge').innerText()) === '1', 'team tab badge for application');
await tab(a, 'Команда');
await shot(a, '05-a-application');
await approveAll(a);
await b.bringToFront();
await b.waitForSelector('.hud', { timeout: 10_000 });
await closeSheet(b);
check((await roleOf(b)).includes('Управляющий'), 'B joined as manager');
check((await b.getByRole('button', { name: /Встать за стойку/ }).count()) === 0, 'manager has no shift button');

// --- C подаёт заявку баристой: нужны оба одобрения
const c = await open('vika', inviteQ);
await applyTo(c, 'Бариста');
await approveAll(a);
await c.bringToFront();
await c.waitForTimeout(3500);
check((await c.getByText('Одобрили 1 из 2').count()) === 1, 'C waits for second approval');
await approveAll(b);
await c.bringToFront();
await c.waitForSelector('.hud', { timeout: 10_000 });
await closeSheet(c);
check((await roleOf(c)).includes('Бариста'), 'C joined as barista');
await shot(c, '06-c-team');

// Неверный ключ приглашения
const x = await open('stranger', `&startapp=cafe_${code}_ZZZZZ`);
await x.getByText('Тебя зовут в кофейню').waitFor();
check((await x.getByText('Это приглашение больше не действует').count()) === 1, 'wrong key rejected');
await x.close();

// --- Касса занята: A на смене, C не может встать за стойку
await a.bringToFront();
await startShift(a);
await c.bringToFront();
await tab(c, 'Стойка');
await c.waitForTimeout(500);
check((await c.getByText(/Пока касса занята — за ней Anya/).count()) === 1, 'counter busy note for C');
check(await c.getByRole('button', { name: /Встать за стойку/ }).isDisabled(), 'C start button disabled');
await shot(c, '07-c-counter-busy');
await a.bringToFront();
console.log('A shift:', await finishShift(a, '08-a'));

// --- Кабинет занят: B в «Управлении», C переходит в менеджеры и видит, что кабинет занят
await b.bringToFront();
await tab(b, 'Дела');
await b.waitForTimeout(400);
await c.bringToFront();
await tab(c, 'Команда');
await c.getByRole('button', { name: /Перейти в роль/ }).click();
await c.waitForTimeout(300);
check((await roleOf(c)).includes('Управляющий'), 'C switched to manager');
await tab(c, 'Дела');
await c.waitForTimeout(500);
check((await c.getByText(/Пока кабинет занят — там Borya/).count()) === 1, 'office busy note for C');
await shot(c, '09-c-office-busy');
// B уходит из «Управления» — кабинет освобождается, C заходит
await b.bringToFront();
await tab(b, 'Команда');
await c.bringToFront();
await c.waitForTimeout(800);
check((await c.getByText(/Пока кабинет занят/).count()) === 0, 'office released for C');

// Последний бариста не может уйти из роли
await a.bringToFront();
await tab(a, 'Команда');
check((await a.getByRole('button', { name: /Перейти в роль/ }).count()) === 0, 'last barista cannot switch');

// --- A (владелец) убирает C, B выходит сам
await tab(a, 'Команда');
await a.locator('.staff-row', { hasText: 'Vika' }).getByRole('button', { name: 'Убрать' }).click();
await a.waitForTimeout(400);
check((await a.locator('.staff-row', { hasText: 'Vika' }).count()) === 0, 'C removed');
await c.bringToFront();
await c.getByText('Кем будешь в кофейне?').waitFor({ timeout: 10_000 });
check(true, 'C sees welcome after removal');
await shot(a, '10-a-team');
await b.bringToFront();
await tab(b, 'Команда');
await b.getByRole('button', { name: /Выйти из кофейни/ }).click();
await b.getByText('Кем будешь в кофейне?').waitFor({ timeout: 10_000 });
check(true, 'B left and sees welcome');
await a.bringToFront();
await a.waitForTimeout(500);
await tab(a, 'Команда');
check((await a.locator('.staff-row').count()) === 2, 'A + neighbour remain');
await shot(a, '11-a-after-leave');

// EN
const en = await open('eve');
await en.evaluate(() => localStorage.setItem('cft:lang', 'en'));
await en.reload();
await en.getByText('Who will you be in the café?').waitFor();
await shot(en, '12-en-welcome');

console.log('errors:', errors.length ? errors : 'none');
await browser.close();
if (errors.length) process.exit(1);
