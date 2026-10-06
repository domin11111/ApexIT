// Сервер для E2E: та же боевая сборка и тот же лаунчер, что на lenivec.online (deploy/), только
// на своём порту, со своей папкой сборки и данных и без секретов (APEX_* задаёт playwright.config.ts).
// Сборки нет или E2E_REBUILD=1 — сначала собираем: так тесты всегда идут по актуальному коду в CI,
// а локально повторный прогон не ждёт сборку заново.
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const root = join(import.meta.dirname, '..', '..', '..');
const distDir = process.env.APEX_DIST_DIR ?? '.next-e2e';

if (process.env.E2E_REBUILD === '1' || !existsSync(join(root, 'apps', 'web', distDir, 'BUILD_ID'))) {
  const build = spawnSync(process.execPath, [join(root, 'deploy', 'build.mjs')], { stdio: 'inherit', env: process.env });
  if (build.status !== 0) process.exit(build.status ?? 1);
}

await import(pathToFileURL(join(root, 'deploy', 'server.mjs')).href);
