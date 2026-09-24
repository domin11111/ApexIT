import { defineConfig } from 'tsdown';

export default defineConfig({
  entry: ['src/server.ts'],
  format: 'esm',
  platform: 'node',
  target: 'node22',
  outDir: 'dist',
  clean: true,
  sourcemap: true,
  dts: false,
  deps: {
    // Внутренние пакеты отдают TypeScript-исходники — вшиваем их в бандл.
    // Остальные зависимости остаются внешними и ставятся из package.json.
    alwaysBundle: [/^@apex\//],
  },
});
