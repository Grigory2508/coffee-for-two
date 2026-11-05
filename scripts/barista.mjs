// Бот-бариста для e2e и тура: читает заказ выбранного гостя (data-want) и проходит шаги сборки.
export async function baristaStep(page) {
  const card = page.locator('.order-card.on');
  if (!(await card.count())) return 'idle';
  const want = JSON.parse((await card.getAttribute('data-want', { timeout: 300 }).catch(() => null)) ?? 'null');
  if (!want) return 'idle';
  const panel = page.locator('.bottom-panel');
  if ((await panel.getAttribute('data-busy')) === '1') return 'busy';
  // десерт — заранее, с панели десертов
  if (want.ds && !(await page.locator('.tray').count())) {
    await page.locator('.panel-tabs .seg', { hasText: /Десерты|Desserts/ }).click({ timeout: 300 }).catch(() => {});
    await page.locator(`[data-k="ds:${want.ds}"]`).click({ timeout: 300 }).catch(() => {});
    await page.locator('.panel-tabs .seg', { hasText: /Напиток|Drink/ }).click({ timeout: 300 }).catch(() => {});
    return 'dessert';
  }
  const step = await panel.getAttribute('data-step');
  const value = {
    vessel: want.vessel,
    ice: want.ice ? 'true' : null,
    base: want.base,
    flavor: want.flavor,
    dairy: want.dairy ? `${want.dairy.kind}-${want.dairy.type}-${want.dairy.temp}` : null,
    texture: want.texture,
    whip: want.whip ? 'true' : null,
    water: want.water ? 'true' : null,
    topping: want.topping,
  }[step];
  const later = ['flavor', 'dairy', 'texture', 'whip', 'water', 'topping'];
  const rest = later.slice(later.indexOf(step) + 1);
  const restNeeded = rest.some((k) => want[k]);
  if (!step || (!value && !restNeeded && step !== 'vessel' && step !== 'base')) {
    await page.locator('.serve-btn:not([disabled])').click({ timeout: 300 }).catch(() => {});
    return 'served';
  }
  if (value) await page.locator(`[data-k="${step}:${value}"]`).click({ timeout: 300 }).catch(() => {});
  else await page.getByRole('button', { name: /Пропустить шаг|Skip step/ }).click({ timeout: 300 }).catch(() => {});
  return 'step';
}
