import { get } from 'node:http';
import AxeBuilder from '@axe-core/playwright';
import { expect, test } from './fixtures';

/** Ответ сервера «как есть»: Playwright нормализует адрес, а нам нужен именно битый %-код. */
function rawGet(path: string): Promise<{ status: number; headers: Record<string, string | string[] | undefined> }> {
  return new Promise((resolve, reject) => {
    get({ host: '127.0.0.1', port: 25590, path }, (res) => {
      res.resume();
      resolve({ status: res.statusCode ?? 0, headers: res.headers });
    }).on('error', reject);
  });
}

test.describe('доступность (axe, WCAG 2 AA)', () => {
  for (const path of ['./?webgl=off', './products/epyc-9965', './compare', './configurator', './request', './en']) {
    test(`нет серьёзных нарушений: ${path}`, async ({ page }) => {
      await page.goto(path);
      await expect(page.locator('.preloader')).toBeHidden({ timeout: 6_000 });
      const { violations } = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
      const serious = violations
        .filter((v) => v.impact === 'serious' || v.impact === 'critical')
        .map((v) => `${v.id}: ${v.help} (${v.nodes.map((n) => n.target.join(' ')).slice(0, 3).join(', ')})`);
      expect(serious).toEqual([]);
    });
  }
});

test.describe('боевой сервер (deploy/server.mjs)', () => {
  test('битое %-кодирование — 400, и процесс продолжает отвечать', async () => {
    expect((await rawGet('/app/components/%E0%A4%A')).status).toBe(400);
    expect((await rawGet('/app/components/api/v1/configurations/%E0%A4%A')).status).toBe(400);
    expect((await rawGet('/app/components')).status).toBe(200);
  });

  test('админка без API наружу не выставлена', async () => {
    expect((await rawGet('/app/components/admin')).status).toBe(404);
    expect((await rawGet('/app/components/api/admin/me')).status).toBe(404);
  });

  test('кеш: HTML — no-cache, API — no-store, хешированные скрипты — immutable', async ({ page }) => {
    expect((await rawGet('/app/components/products/epyc-9965')).headers['cache-control']).toBe('no-cache');
    expect((await rawGet('/app/components/api/v1/configurations/aaaaaaaaaa')).headers['cache-control']).toBe('no-store');
    await page.goto('./');
    const script = await page.locator('script[src*="/_next/static/"]').first().getAttribute('src');
    expect((await rawGet(script!)).headers['cache-control']).toContain('immutable');
  });

  test('чужие пути домена — не наши: без префикса 404', async () => {
    expect((await rawGet('/')).status).toBe(404);
    expect((await rawGet('/models/cpu-epyc-9965-sp5.glb')).status).toBe(404);
  });
});
