// Сквозной прогон в Playwright: два игрока в двух вкладках одного браузера, роли.
// Запуск: npm run build && npx vite preview --port 4173 & node scripts/e2e.mjs
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const BASE = process.env.BASE ?? 'http://localhost:4173/';
const OUT = process.env.OUT ?? 'screens';
mkdirSync(OUT, { recursive: true });

const ICON_TO_STATION = { '☕': 'Эспрессо', '💧': 'Вода', '🥛': 'Молоко', '☁️': 'Пенка', '🍯': 'Сироп', '🍫': 'Какао' };
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

async function playShift(page, label, wipe = true) {
  await tab(page, 'Кофейня');
  await page.getByRole('button', { name: /Встать за стойку|Вернуться за стойку/ }).click();
  await page.waitForSelector('.shift');
  let shotTaken = false;
  for (let tick = 0; tick < 500; tick++) {
    if (await page.locator('.result').count()) break;
    if (wipe) {
      const dirty = page.locator('.table-spot.dirty');
      const n = await dirty.count();
      for (let i = 0; i < n; i++) {
        await dirty.first().click({ timeout: 300 }).catch(() => {});
        await dirty.first().click({ timeout: 300 }).catch(() => {});
      }
    }
    const guest = page.locator('.guest.active');
    if (await guest.count()) {
      const recipe = (await guest.locator('.guest-recipe').innerText()).split(/\s+/).filter(Boolean);
      for (const icon of recipe) await page.locator('.station', { hasText: ICON_TO_STATION[icon] }).click();
      await page.getByRole('button', { name: 'Подать' }).click();
      if (!shotTaken && (await page.locator('.table-spot.busy').count())) {
        await shot(page, `${label}-shift`);
        shotTaken = true;
      }
    }
    await page.waitForTimeout(120);
  }
  await page.waitForSelector('.result', { timeout: 90_000 });
  await shot(page, `${label}-result`);
  const earned = await page.locator('.big-number').innerText();
  await page.getByRole('button', { name: 'Назад' }).click();
  return earned;
}

// --- A создаёт кофейню бариста
const a = await open('anya');
await a.getByText('Кем будешь в кофейне?').waitFor();
await shot(a, '01-welcome-roles');
await a.locator('.role-card', { hasText: 'Бариста' }).click();
await a.getByRole('button', { name: 'Открыть кофейню' }).click();
await a.waitForSelector('.partner-card');
await shot(a, '02-a-barista');
check((await a.locator('.role-badge').innerText()).includes('Бариста'), 'A is barista');

const { code, key } = await a.evaluate(() => {
  const k = Object.keys(localStorage).find((x) => x.startsWith('cft:cafe:'));
  const s = JSON.parse(localStorage.getItem(k));
  return { code: s.code, key: s.inviteKey };
});

// Бариста не может закупаться
await tab(a, 'Управление');
check((await a.locator('.locked-note').count()) === 1, 'barista sees management locked');
await shot(a, '03-a-manage-locked');

console.log('A shift 1:', await playShift(a, '04-a'));

// --- B приходит по приглашению и становится управляющим
const b = await open('borya', `&startapp=cafe_${code}_${key}`);
await b.getByText('Тебя зовут в кофейню').waitFor();
check((await b.locator('.role-badge').innerText()).includes('Управляющий'), 'invite offers manager role');
await shot(b, '05-b-invite');
await b.getByRole('button', { name: 'Войти в кофейню' }).click();
await b.waitForSelector('.partner-card');
check((await b.locator('.role-badge').innerText()).includes('Управляющий'), 'B is manager');
check((await b.getByRole('button', { name: /Встать за стойку/ }).count()) === 0, 'manager has no shift button');

// Старое приглашение с неверным ключом
const x = await open('stranger', `&startapp=cafe_${code}_ZZZZZ`);
await x.getByText('Тебя зовут в кофейню').waitFor();
check((await x.getByText('Это приглашение больше не действует').count()) + (await x.getByText('уже двое').count()) > 0, 'wrong key rejected');
await x.close();

// B: поездка к поставщику, реклама
await tab(b, 'Управление');
await b.locator('.item', { hasText: 'Сироп' }).locator('.stepper button').nth(1).click();
await b.locator('.item', { hasText: 'Молоко' }).locator('.stepper button').nth(1).click();
await shot(b, '06-b-supply');
await b.getByRole('button', { name: /Съездить/ }).click();
await b.waitForTimeout(300);
check((await b.locator('.item', { hasText: 'Сироп' }).locator('.muted').first().innerText()).startsWith('10'), 'syrup bought');
await debug(b, /Силы и \+1000/);
await tab(b, 'Управление');
await b.locator('.item', { hasText: 'Листовки' }).getByRole('button').click();
await b.waitForTimeout(300);
await shot(b, '07-b-manage');

// A: смена с рекламой (+1 гость) и уборкой столиков
console.log('A shift 2:', await playShift(a, '08-a'));

// Обмен ролями: A предлагает, B соглашается
await tab(a, 'Кофейня');
await a.getByRole('button', { name: /Предложить поменяться/ }).click();
await a.waitForTimeout(400);
check((await a.getByText(/Ждём, когда/).count()) === 1, 'A waits for swap');
await b.bringToFront();
await tab(b, 'Кофейня');
await b.waitForTimeout(500);
await shot(b, '09-b-swap-incoming');
await b.getByRole('button', { name: 'Согласиться' }).click();
await b.waitForTimeout(300);
check((await b.locator('.role-badge').first().innerText()).includes('Бариста'), 'B became barista');
await a.bringToFront();
await a.waitForTimeout(500);
check((await a.locator('.role-badge').first().innerText()).includes('Управляющий'), 'A became manager');

// B (теперь бариста) работает
await debug(b, /Силы и \+1000/);
console.log('B shift:', await playShift(b, '10-b'));

// Выход напарника: B выходит
await tab(b, 'Мы');
await shot(b, '11-b-us');
await b.getByRole('button', { name: /Выйти из кофейни/ }).click();
await b.getByText('Кем будешь в кофейне?').waitFor({ timeout: 10_000 });
check(true, 'B left and sees welcome');
await a.bringToFront();
await a.waitForTimeout(500);
await tab(a, 'Кофейня');
check((await a.getByText(/подменяет напарника/).count()) === 1, 'neighbour took B place');
await shot(a, '12-a-after-leave');

// EN
const en = await open('eve');
await en.evaluate(() => localStorage.setItem('cft:lang', 'en'));
await en.reload();
await en.getByText('Who will you be in the café?').waitFor();
await shot(en, '13-en-welcome');

console.log('errors:', errors.length ? errors : 'none');
await browser.close();
if (errors.length) process.exit(1);
