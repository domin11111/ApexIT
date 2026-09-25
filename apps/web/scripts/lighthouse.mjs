// Замер Lighthouse по ключевым страницам (продакшн-сборка, мобильный и десктоп профили).
//
//   pnpm --filter @apex/web build && pnpm --filter @apex/web exec next start -p 3100
//   pnpm --filter @apex/web lighthouse [-- http://localhost:3100]
//
// Цели брифа (раздел 9): Performance ≥ 85 на мобильном, Accessibility ≥ 95, SEO ≥ 95.
// Отчёты JSON — в .lighthouse/ (вне git), в консоль — сводка и главные метрики.
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const base = (process.argv[2] ?? 'http://localhost:3100').replace(/\/$/, '');
const outDir = join(resolve(dirname(fileURLToPath(import.meta.url)), '..'), '.lighthouse');
mkdirSync(outDir, { recursive: true });

const PAGES = ['/', '/products/epyc-9996-venice', '/compare', '/configurator', '/request', '/en'];
const PROFILES = { mobile: [], desktop: ['--preset=desktop'] };
const TARGETS = { performance: { mobile: 85, desktop: 90 }, accessibility: 95, 'best-practices': 90, seo: 95 };

const rows = [];
for (const [profile, flags] of Object.entries(PROFILES)) {
  for (const path of PAGES) {
    const file = join(outDir, `${profile}${path.replace(/\//g, '_') || '_'}.json`);
    rmSync(file, { force: true });
    const started = Date.now();
    try {
      execFileSync(
        process.platform === 'win32' ? 'npx.cmd' : 'npx',
        ['-y', 'lighthouse@12', `${base}${path}`, '--quiet', '--output=json', `--output-path=${file}`, '--chrome-flags=--headless=new', ...flags],
        { stdio: ['ignore', 'ignore', 'pipe'], shell: process.platform === 'win32' },
      );
    } catch (error) {
      // Windows: chrome-launcher не может удалить временный профиль Chrome (EPERM) уже ПОСЛЕ записи отчёта
      const written = (() => {
        try {
          return statSync(file).mtimeMs >= started;
        } catch {
          return false;
        }
      })();
      if (!written) throw error;
    }
    const report = JSON.parse(readFileSync(file, 'utf8'));
    const score = (id) => Math.round((report.categories[id]?.score ?? 0) * 100);
    const metric = (id) => report.audits[id]?.displayValue ?? '—';
    rows.push({
      profile,
      path,
      perf: score('performance'),
      a11y: score('accessibility'),
      bp: score('best-practices'),
      seo: score('seo'),
      LCP: metric('largest-contentful-paint'),
      CLS: metric('cumulative-layout-shift'),
      TBT: metric('total-blocking-time'),
    });
  }
}
console.table(rows);

const failed = rows.filter(
  (r) => r.perf < TARGETS.performance[r.profile] || r.a11y < TARGETS.accessibility || r.seo < TARGETS.seo || r.bp < TARGETS['best-practices'],
);
if (failed.length > 0) {
  console.log(`Ниже целей: ${failed.map((r) => `${r.profile} ${r.path}`).join(', ')}`);
  process.exitCode = 1;
}
