import { defineConfig, globalIgnores } from 'eslint/config';
import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTs from 'eslint-config-next/typescript';

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  // public/basis — транскодер Basis из three (копия, не наш код); .next* — сборки (обычная, боевая,
  // для E2E); отчёты Playwright — генерируемые файлы
  globalIgnores([
    '.next*/**',
    'out/**',
    'next-env.d.ts',
    'public/mockServiceWorker.js',
    'public/basis/**',
    'playwright-report/**',
    'test-results/**',
  ]),
  {
    rules: {
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    },
  },
  {
    // React Three Fiber: объекты three.js (материалы, uniform'ы, рендерер, RigControls) намеренно
    // меняются в useFrame и эффектах — это императивный цикл рендера WebGL, а не состояние React.
    // React Compiler в проекте не включён, поэтому правило здесь только мешает.
    files: ['src/three/**/*.{ts,tsx}', 'src/app/**/lab/**/*.tsx'],
    rules: { 'react-hooks/immutability': 'off' },
  },
  {
    // Фикстуры Playwright передают значение в тест через функцию use — это не хук React
    files: ['e2e/**/*.ts'],
    rules: { 'react-hooks/rules-of-hooks': 'off' },
  },
]);
