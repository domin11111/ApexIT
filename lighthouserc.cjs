// Lighthouse CI: те же страницы и цели, что у scripts/lighthouse.mjs (критерии готовности брифа).
// Сервер — боевая сборка deploy/server.mjs на 127.0.0.1:25590 под /app/components (см. ci.yml).
const BASE = process.env.APEX_SITE_URL || 'http://127.0.0.1:25590/app/components';

module.exports = {
  ci: {
    collect: {
      url: ['', '/products/epyc-9996-venice', '/compare', '/configurator', '/request', '/en'].map((path) => `${BASE}${path}`),
      // Медиана трёх прогонов: у одного прогона на общем раннере разброс в 5–10 баллов
      numberOfRuns: 3,
      settings: { chromeFlags: '--no-sandbox --headless=new' },
    },
    assert: {
      assertions: {
        // Производительность на раннере GitHub ниже, чем на живом сервере (медленный общий CPU),
        // поэтому здесь предупреждение; жёсткая проверка — pnpm --filter @apex/web lighthouse
        'categories:performance': ['warn', { minScore: 0.85, aggregationMethod: 'median-run' }],
        'categories:accessibility': ['error', { minScore: 0.95, aggregationMethod: 'median-run' }],
        'categories:seo': ['error', { minScore: 0.95, aggregationMethod: 'median-run' }],
        'categories:best-practices': ['error', { minScore: 0.9, aggregationMethod: 'median-run' }],
        'cumulative-layout-shift': ['error', { maxNumericValue: 0.05, aggregationMethod: 'median-run' }],
      },
    },
    upload: { target: 'filesystem', outputDir: '.lighthouseci' },
  },
};
