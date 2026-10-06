import { expect, realErrors, test } from './fixtures';

test.describe('страница продукта', () => {
  test('заголовок, постер-рендер, хотспоты списком и JSON-LD Product', async ({ page, consoleErrors }) => {
    await page.goto('./products/epyc-9965');
    await expect(page.locator('h1#product-title')).toContainText('EPYC 9965');
    // Постер в HTML с первого кадра — он же LCP и фолбэк без WebGL
    await expect(page.locator('picture img[alt*="EPYC 9965"]')).toBeVisible();

    await page.getByText('Детали модели').click();
    expect(await page.locator('details ol li').count()).toBeGreaterThanOrEqual(3);

    const jsonLd = await page.locator('script[type="application/ld+json"]').first().textContent();
    expect(jsonLd).toContain('"@type":"Product"');
    expect(jsonLd).toContain('/app/components/renders/epyc-9965-hero-1600.webp');
    expect(realErrors(consoleErrors)).toEqual([]);
  });

  test('без WebGL «Разобрать» показывает рендер разобранной модели', async ({ page }) => {
    await page.goto('./products/epyc-9996-venice?webgl=off');
    const poster = page.locator('picture img').first();
    await expect(poster).toHaveAttribute('src', /venice-hero/);
    const explode = page.getByRole('button', { name: 'Разобрать' });
    await explode.click();
    await expect(page.locator('picture img').first()).toHaveAttribute('src', /venice-exploded/);
    // Пресеты света без 3D смысла не имеют — скрыты
    await expect(page.getByRole('radiogroup', { name: 'Свет' })).toBeHidden();
  });

  test('неизвестный продукт — страница 404', async ({ page }) => {
    const response = await page.goto('./products/no-such-product');
    expect(response?.status()).toBe(404);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Такой страницы нет в коллекции');
    // Ссылка «на главную» — под префиксом сайта, а не в корень домена
    await expect(page.getByRole('link', { name: /На главную/ })).toHaveAttribute('href', '/app/components');
  });
});
