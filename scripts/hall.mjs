// Снимки гостевого зала со всеми предметами каждого уровня: node scripts/hall.mjs при запущенном vite preview
import { chromium } from 'playwright';
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, locale: 'ru-RU' });
await ctx.route('https://telegram.org/**', (r) => r.fulfill({ status: 200, body: '' }));
const p = await ctx.newPage();
p.on('pageerror', (e) => console.log('ERR', e.message));
await p.goto('http://localhost:4173/?as=anya');
await p.getByRole('button', { name: 'Открыть кофейню' }).click().catch(() => {});
await p.waitForSelector('.hud', { timeout: 15000 });
const walls = ['hw-latte', 'hw-green-panel', 'hw-brick'];
const floors = ['hf-oak', 'hf-tile', 'hf-herring'];
for (const v of [-1, 0, 1, 2]) {
  await p.evaluate(([v, wall, floor]) => {
    const k = Object.keys(localStorage).find((x) => x.startsWith('cft:cafe:'));
    const s = JSON.parse(localStorage.getItem(k));
    if (v >= 0) {
      const slots = ['window1', 'window2', 'table1', 'table2', 'table3', 'chandelier', 'picture', 'sconces', 'poster', 'shelf', 'plant'];
      s.hall.placed = {};
      for (const sl of slots) { s.hall.owned.push(`${sl}-${v}`); s.hall.placed[sl] = `${sl}-${v}`; }
      s.hall.wall = wall; s.hall.walls.push(wall); s.hall.floor = floor; s.hall.floors.push(floor);
    }
    s.version += 1; localStorage.setItem(k, JSON.stringify(s));
  }, [v, walls[Math.max(0, v)], floors[Math.max(0, v)]]);
  await p.reload(); await p.waitForSelector('.hud');
  const ok = p.getByRole('button', { name: 'Понятно' }); if (await ok.count()) await ok.click();
  await p.locator('.tab-btn', { hasText: 'Кофейня' }).click();
  await p.waitForTimeout(700);
  await p.locator('.hall-scene').screenshot({ path: `/tmp/prev/hall-${v}.png` }).catch((e) => console.log(e.message));
  if (v === 0) await p.screenshot({ path: '/tmp/prev/hall-tab.png', fullPage: true });
}
await browser.close();
