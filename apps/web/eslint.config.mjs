import { defineConfig, globalIgnores } from 'eslint/config';
import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTs from 'eslint-config-next/typescript';

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  // public/basis — транскодер Basis из three (копия, не наш код)
  globalIgnores(['.next/**', 'out/**', 'next-env.d.ts', 'public/mockServiceWorker.js', 'public/basis/**']),
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
]);
