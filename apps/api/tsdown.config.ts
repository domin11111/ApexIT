import { defineConfig } from 'tsdown';

export default defineConfig({
  // Имена выходных файлов явные. seed и admin-create — для образа: коллекция и первый администратор
  // в контейнере запускаются обычным node, без tsx (см. Dockerfile и docker-compose.prod.yml)
  entry: { server: 'src/server.ts', worker: 'src/worker.ts', seed: 'prisma/seed.ts', 'admin-create': 'src/scripts/admin-create.ts' },
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
