// Снимки всех обоев в каждой комнате (с мебелью уютного уровня): node scripts/walls.mjs при запущенном vite preview
import { chromium } from 'playwright';
const WALLS = {
  hall: ['wp-cream-stripe', 'wp-milk', 'wp-peach-dots', 'wp-blue-diamond', 'wp-honey-herring', 'wp-sage-panel'],
  kitchen: ['wp-sage', 'wp-cream-plain', 'wp-butter-stripe', 'wp-peach-dots-k', 'wp-bistro-check', 'wp-olive-flowers'],
  bedroom: ['wp-lavender-dots', 'wp-linen', 'wp-lilac-stripe', 'wp-powder-flowers', 'wp-sky-diamond', 'wp-cream-panel'],
};
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'ru-RU' });
await ctx.route('https://telegram.org/**', (r) => r.fulfill({ status: 200, body: '' }));
const p = await ctx.newPage();
await p.goto('http://localhost:4173/?as=anya');
await p.getByRole('button', { name: 'Открыть кофейню' }).click().catch(() => {});
await p.waitForSelector('.hud', { timeout: 15000 });
for (let k = 0; k < 6; k++) {
  await p.evaluate(([k, WALLS]) => {
    const key = Object.keys(localStorage).find((x) => x.startsWith('cft:cafe:'));
    const s = JSON.parse(localStorage.getItem(key));
    const slots = { hall: ['sofa','table','lamp','wall','window','rug','plant','shelf'], kitchen: ['stove','fridge','dining','coffeemaker','shelf','plant','window'], bedroom: ['bed','desk','wardrobe','lamp','wall','window','rug','plant'] };
    for (const r of Object.values(s.home.rooms)) { r.open = true; r.placed = {}; for (const sl of slots[r.kind]) r.placed[sl] = `${sl}-1`; r.wallpaper = WALLS[r.kind][k]; }
    s.version += 1; localStorage.setItem(key, JSON.stringify(s));
  }, [k, WALLS]);
  await p.reload(); await p.waitForSelector('.hud');
  const ok = p.getByRole('button', { name: 'Понятно' }); if (await ok.count()) await ok.click();
  await p.locator('.tab-btn', { hasText: 'Квартира' }).click();
  for (const [i, name] of [[0, 'Зал'], [1, 'Кухня'], [2, 'Моя комната']]) {
    await p.locator('.room-dot', { hasText: name }).click();
    await p.waitForTimeout(500);
    await p.evaluate(() => window.scrollTo(0, 0));
    await p.locator('.room-page').nth(i).locator('.room-scene').screenshot({ path: `/tmp/prev/wall-${k}-${i}.png` }).catch((e) => console.log(e.message));
  }
}
await browser.close();
