import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test as base } from '@playwright/test';

/*
 * Общая обвязка E2E: ошибки консоли страницы собираются в каждом тесте. WebGL в CI (headless
 * Chromium без GPU) может не создаться — тогда сайт сам уходит на статичные рендеры, а шум
 * three.js/Chrome о контексте ошибкой сайта не считаем.
 */
const IGNORED = [/WebGL/i, /THREE\./, /GPU stall/i, /context lost/i, /SwiftShader/i];

export const test = base.extend<{ consoleErrors: string[] }>({
  consoleErrors: async ({ page }, use) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(message.text());
    });
    await use(errors);
  },
});

export { expect } from '@playwright/test';

export const realErrors = (errors: string[]) => errors.filter((error) => !IGNORED.some((pattern) => pattern.test(error)));

/** Строки JSONL из папки данных сервера (APEX_DATA_DIR задаёт playwright.config.ts). */
export function readJournal(file: string): Array<Record<string, unknown>> {
  try {
    const text = readFileSync(join(process.env.APEX_DATA_DIR!, file), 'utf8');
    return text.trim().split('\n').filter(Boolean).map((line) => JSON.parse(line) as Record<string, unknown>);
  } catch {
    return [];
  }
}

export function readData<T>(file: string): T | null {
  try {
    return JSON.parse(readFileSync(join(process.env.APEX_DATA_DIR!, file), 'utf8')) as T;
  } catch {
    return null;
  }
}
