import { expect, realErrors, test } from './fixtures';

test.describe('главная', () => {
  test('hero, семь сцен сторителлинга, прелоадер уходит, ошибок в консоли нет', async ({ page, consoleErrors }) => {
    await page.goto('./');
    await expect(page).toHaveTitle(/Compute Collection/);
    await expect(page.locator('#hero-title')).toHaveAttribute('aria-label', /The Compute Collection 2026/);
    // Прелоадер укладывается в 2,5 с (интро ещё около секунды)
    await expect(page.locator('.preloader')).toBeHidden({ timeout: 6_000 });
    for (const scene of ['hero', 'chiplets', 'generations', 'memory', 'gpu', 'assembly']) {
      await expect(page.locator(`[data-scene="${scene}"]`)).toHaveCount(1);
    }
    expect(realErrors(consoleErrors)).toEqual([]);
  });

  test('английская версия — /en', async ({ page }) => {
    await page.goto('./en');
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    // Навигация на телефоне в меню, поэтому проверяем то, что видно на любом экране
    await expect(page.getByRole('link', { name: 'Request a quote' }).first()).toBeVisible();
    await expect(page.getByText('Four flagships setting the bar')).toBeVisible();
  });

  test('без WebGL — статичный рендер вместо сцены', async ({ page }) => {
    await page.goto('./?webgl=off');
    await expect(page.locator('.preloader')).toBeHidden({ timeout: 6_000 });
    await expect(page.locator('canvas')).toHaveCount(0);
    await expect(page.locator('img[src*="renders/epyc-9996-venice-hero"]')).toBeVisible();
  });

  test('prefers-reduced-motion: интро без анимаций, заголовок сразу читается', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('./');
    await expect(page.locator('.preloader')).toBeHidden({ timeout: 4_000 });
    await expect(page.locator('#hero-title')).toBeVisible();
  });

  test('SEO: canonical, hreflang и JSON-LD с адресами под префиксом сайта', async ({ page }) => {
    await page.goto('./');
    const canonical = await page.locator('link[rel="canonical"]').getAttribute('href');
    expect(canonical).toMatch(/\/app\/components$/);
    await expect(page.locator('link[rel="alternate"][hreflang="en"]')).toHaveAttribute('href', /\/app\/components\/en$/);
    const jsonLd = await page.locator('script[type="application/ld+json"]').first().textContent();
    expect(jsonLd).toContain('"@type":"Organization"');
  });
});
