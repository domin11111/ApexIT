import { expect, readData, test } from './fixtures';

test.describe('сравнение', () => {
  test('выбор из адреса, таблица с лучшими значениями, переход к продукту', async ({ page }) => {
    await page.goto('./compare?slugs=epyc-9965,epyc-9996-venice');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Сравните флагманы');
    expect(await page.getByText('лучше', { exact: true }).count()).toBeGreaterThan(0);

    await page.getByRole('link', { name: /Страница продукта/ }).first().click();
    await expect(page).toHaveURL(/\/app\/components\/products\/[a-z0-9-]+$/);
  });
});

test.describe('конфигуратор', () => {
  test('несовместимый процессор недоступен, а совместимая сборка сохраняется ссылкой', async ({ page }) => {
    await page.goto('./configurator');

    // Платформа SP7 → процессор под SP5 (EPYC 9965) выбрать нельзя
    await page.getByRole('radio', { name: /^SP7/ }).click();
    await page.getByRole('button', { name: /Процессор/ }).first().click();
    const turin = page.getByRole('radio', { name: /EPYC 9965/ });
    await expect(turin).toHaveAttribute('aria-disabled', 'true');
    await turin.click({ force: true });
    await expect(turin).toHaveAttribute('aria-checked', 'false');

    // Сохранение: код в адресе и в хранилище сервера
    await page.getByRole('button', { name: 'Сохранить ссылку' }).click();
    await expect(page).toHaveURL(/[?&]c=[a-hjkmnp-z2-9]{10}/);
    const code = new URL(page.url()).searchParams.get('c')!;
    expect(readData<Record<string, unknown>>('configurations.json')).toHaveProperty(code);

    // Ссылка открывает ту же сборку
    await page.goto(`./configurator?c=${code}`);
    await expect(page.getByRole('radio', { name: /^SP7/ })).toHaveAttribute('aria-checked', 'true');
  });
});
