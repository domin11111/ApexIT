import { expect, readJournal, test } from './fixtures';

test.describe('заявка', () => {
  test('ошибки валидации, затем успешная отправка — заявка в журнале сервера', async ({ page }, testInfo) => {
    await page.goto('./request');
    await page.getByRole('button', { name: 'Отправить запрос' }).click();
    await expect(page.getByText('Укажите имя')).toBeVisible();
    await expect(page.getByText('Нужно согласие на обработку данных')).toBeVisible();

    // Своя почта на проект: заявки обоих браузерных профилей в одном журнале
    const email = `e2e-${testInfo.project.name}-${Date.now()}@example.com`;
    await page.getByLabel('Имя').fill('Тест E2E');
    await page.getByLabel('Рабочая почта').fill(email);
    await page.getByLabel(/Согласен на обработку/).check();
    await page.getByRole('button', { name: 'Отправить запрос' }).click();

    await expect(page.getByText('Запрос отправлен')).toBeVisible();
    await expect.poll(() => readJournal('leads.jsonl').some((lead) => lead.email === email)).toBe(true);
  });
});
