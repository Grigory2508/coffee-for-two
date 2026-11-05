// Снимки комнат со всей мебелью каждого уровня (проверка арта): node scripts/rooms.mjs при запущенном vite preview
import { chromium } from 'playwright';
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'ru-RU' });
await ctx.route('https://telegram.org/**', (r) => r.fulfill({ status: 200, body: '' }));
const p = await ctx.newPage();
await p.goto('http://localhost:4173/?as=anya');
await p.getByRole('button', { name: 'Открыть кофейню' }).click().catch(() => {});
await p.waitForSelector('.hud', { timeout: 15000 });
for (const v of [0, 1, 2]) {
  await p.evaluate((v) => {
    const k = Object.keys(localStorage).find((x) => x.startsWith('cft:cafe:'));
    const s = JSON.parse(localStorage.getItem(k));
    const slots = { hall: ['sofa','table','lamp','wall','window','rug','plant','shelf'], kitchen: ['stove','fridge','dining','coffeemaker','shelf','plant','window'], bedroom: ['bed','desk','wardrobe','lamp','wall','window','rug','plant'] };
    for (const r of Object.values(s.home.rooms)) { r.open = true; r.placed = {}; for (const sl of slots[r.kind]) { r.owned.push(`${sl}-${v}`); r.placed[sl] = `${sl}-${v}`; } }
    s.version += 1; localStorage.setItem(k, JSON.stringify(s));
  }, v);
  await p.reload(); await p.waitForSelector('.hud');
  const ok = p.getByRole('button', { name: 'Понятно' }); if (await ok.count()) await ok.click();
  await p.locator('.tab-btn', { hasText: 'Квартира' }).click();
  await p.waitForTimeout(500);
  for (const [i, name] of [[0, 'Зал'], [1, 'Кухня']]) {
    await p.locator('.room-dot', { hasText: name }).click();
    await p.waitForTimeout(600);
    await p.locator('.room-page').nth(i).locator('.room-scene').screenshot({ path: `/tmp/prev/room-${v}-${i}.png` }).catch((e) => console.log(e.message));
  }
  await p.locator('.room-dot', { hasText: 'Моя комната' }).click();
  await p.waitForTimeout(700);
  await p.evaluate(() => window.scrollTo(0, 0));
  await p.locator('.room-page').nth(2).locator('.room-scene').screenshot({ path: `/tmp/prev/bed-${v}.png` }).catch((e) => console.log(e.message));
}
await browser.close();
