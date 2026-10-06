import { expect, realErrors, test } from './fixtures';

/*
 * Без видеокарты (проект software-gl: Chrome рисует WebGL программно через SwiftShader, как на
 * раннере CI, в виртуалке или по удалённому рабочему столу) сайт не мучает посетителя сценой
 * с кадром в секунды, а показывает статичные рендеры.
 */
test('программный WebGL — главная и продукт на статичных рендерах', async ({ page, consoleErrors }) => {
  await page.goto('./');
  await expect(page.locator('.preloader')).toBeHidden({ timeout: 8_000 });
  await expect(page.locator('canvas')).toHaveCount(0);
  await expect(page.locator('img[src*="renders/epyc-9996-venice-hero"]')).toBeVisible();

  await page.goto('./products/epyc-9965');
  await expect(page.locator('picture img[alt*="EPYC 9965"]')).toBeVisible();
  // Сцена могла успеть смонтироваться — к этому моменту её уже сменили рендеры
  await expect(page.locator('canvas')).toHaveCount(0);
  expect(realErrors(consoleErrors)).toEqual([]);
});
