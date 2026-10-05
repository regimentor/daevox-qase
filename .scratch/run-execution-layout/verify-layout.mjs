import { chromium, expect } from '@playwright/test';

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
const storybookUrl = process.env.STORYBOOK_URL ?? 'http://127.0.0.1:6006';
try {
  await page.goto(`${storybookUrl}/iframe.html?id=execution-workspace--default&viewMode=story`);
  const nav = page.getByRole('navigation', { name: 'Кейсы запуска' });
  const panel = page.getByRole('complementary');
  const content = page.getByRole('main');
  await expect(nav).toBeVisible();
  await expect.poll(async () => (await nav.boundingBox()).width).toBe(520);
  for (const [label, target, delta, expected] of [
    ['Ширина списка кейсов', nav, 80, 600],
    ['Ширина результата попытки', panel, -60, 420],
  ]) {
    const handle = page.getByRole('separator', { name: label });
    const box = await handle.boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + 100);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + delta, box.y + 100, { steps: 5 });
    await page.mouse.up();
    await expect.poll(async () => (await target.boundingBox()).width).toBe(expected);
  }
  await expect.poll(async () => (await content.boundingBox()).width).toBeGreaterThanOrEqual(420);
  console.log('Mouse resizing: passed');
  for (const width of [1100, 1000, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await expect
      .poll(() => page.evaluate(() => document.documentElement.scrollWidth))
      .toBeLessThanOrEqual(width);
    if (width > 1023) {
      await expect
        .poll(async () => (await content.boundingBox()).width)
        .toBeGreaterThanOrEqual(420);
      await expect(page.getByRole('separator', { name: 'Ширина списка кейсов' })).toBeVisible();
    } else {
      await expect(page.getByRole('separator', { name: 'Ширина списка кейсов' })).toBeHidden();
      await expect(page.getByRole('separator', { name: 'Ширина результата попытки' })).toBeHidden();
      await expect
        .poll(
          async () =>
            (await content.boundingBox()).y -
            ((await nav.boundingBox()).y + (await nav.boundingBox()).height),
        )
        .toBeGreaterThanOrEqual(0);
      await expect(panel).toBeVisible();
    }
  }
  console.log('Responsive layout at 1100, 1000 and 390 px: passed');
  await page.setViewportSize({ width: 1600, height: 900 });
  await page.goto(
    `${storybookUrl}/iframe.html?id=execution-workspace--narrow-container&viewMode=story`,
  );
  await expect(page.getByRole('navigation', { name: 'Кейсы запуска' })).toBeVisible();
  await expect(page.getByRole('separator', { name: 'Ширина списка кейсов' })).toBeHidden();
  for (const role of ['banner', 'navigation', 'main', 'complementary']) {
    await expect
      .poll(() =>
        page.getByRole(role).evaluate((element) => element.scrollWidth - element.clientWidth),
      )
      .toBeLessThanOrEqual(1);
  }
  console.log('Narrow container and long content: passed');
  await page.goto(
    `${storybookUrl}/iframe.html?id=execution-workspace--independent-panel-scrolling&viewMode=story`,
  );
  await expect(nav.getByRole('button', { name: 'Аутентификация' })).toHaveAttribute(
    'aria-expanded',
    'true',
  );
  await expect(panel.getByRole('button', { expanded: false })).toHaveCount(30);
  const list = nav.getByRole('list', { name: 'Сьюты запуска' }).locator('..');
  const pageTop = await page.evaluate(() => document.scrollingElement.scrollTop);
  const navBox = await nav.boundingBox();
  await page.mouse.move(navBox.x + 100, navBox.y + 200);
  await page.mouse.wheel(0, 300);
  await expect.poll(() => list.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
  expect(await page.evaluate(() => document.scrollingElement.scrollTop)).toBe(pageTop);
  const panelBox = await panel.boundingBox();
  await page.mouse.move(panelBox.x + 100, panelBox.y + 200);
  await page.mouse.wheel(0, 300);
  await expect.poll(() => panel.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
  expect(await page.evaluate(() => document.scrollingElement.scrollTop)).toBe(pageTop);
  const contentBox = await content.boundingBox();
  await page.mouse.move(contentBox.x + 100, contentBox.y + 200);
  await page.mouse.wheel(0, 400);
  await expect
    .poll(() => page.evaluate(() => document.scrollingElement.scrollTop))
    .toBeGreaterThan(pageTop);
  expect((await nav.boundingBox()).y).toBeGreaterThanOrEqual(60);
  expect((await panel.boundingBox()).y).toBeGreaterThanOrEqual(60);
  console.log('Mouse wheel scrolling and sticky panels: passed');
} finally {
  await browser.close();
}
