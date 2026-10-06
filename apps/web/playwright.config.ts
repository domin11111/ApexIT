import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { defineConfig, devices } from '@playwright/test';

/*
 * E2E по боевой конфигурации: deploy/server.mjs с basePath /app/components — ровно то, что крутится
 * на lenivec.online, — но на порту 25590, со сборкой в .next-e2e и данными во временной папке.
 * APEX_SECRETS=off: ни Telegram, ни Turnstile — заявки из тестов никуда не уходят.
 *
 *   pnpm --filter @apex/web test:e2e              (локально — установленный Chrome)
 *   E2E_REBUILD=1 pnpm --filter @apex/web test:e2e  (пересобрать после правок кода)
 */

const PORT = 25590;
export const BASE_URL = `http://127.0.0.1:${PORT}/app/components`;

// Папка данных общая для сервера и тестов (заявка из формы должна оказаться в журнале)
process.env.APEX_DATA_DIR ??= mkdtempSync(join(tmpdir(), 'apex-e2e-'));
const CI = Boolean(process.env.CI);

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: CI,
  retries: CI ? 1 : 0,
  workers: CI ? 2 : undefined,
  reporter: CI ? [['github'], ['html', { open: 'never' }]] : [['list']],
  timeout: 45_000,
  expect: { timeout: 10_000 },
  use: {
    // baseURL с префиксом: в тестах пути относительные ('./compare'), как на домене
    baseURL: `${BASE_URL}/`,
    // Русский браузер: иначе next-intl по Accept-Language (en-US у Chrome) уведёт на /en
    locale: 'ru-RU',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    // В CI — Chromium из `playwright install`, локально — установленный Chrome (браузеры не качаем)
    { name: 'desktop', use: { ...devices['Desktop Chrome'], ...(CI ? {} : { channel: 'chrome' }) } },
    {
      name: 'mobile',
      use: { ...devices['Pixel 7'], ...(CI ? {} : { channel: 'chrome' }) },
      testMatch: /(home|product|request)\.spec\.ts/,
    },
  ],
  webServer: {
    command: 'node e2e/serve.mjs',
    url: `${BASE_URL}/icon.svg`,
    reuseExistingServer: !CI,
    // Первый прогон собирает сайт — это несколько минут
    timeout: 600_000,
    stdout: 'pipe',
    env: {
      APEX_PORT: String(PORT),
      APEX_DIST_DIR: '.next-e2e',
      APEX_DATA_DIR: process.env.APEX_DATA_DIR,
      APEX_SITE_URL: BASE_URL,
      APEX_SECRETS: 'off',
    },
  },
});
