// Боевая сборка сайта: apps/web → apps/web/.next-deploy с basePath /app/components.
//
//   node deploy\build.mjs
//
// Пока сайт работает, сборку не трогаем: сервер читает файлы из той же папки, и подмена на ходу
// уронила бы страницы. Батник «запуск компонентов.bat rebuild» сам останавливает, собирает и поднимает.
import { spawnSync } from 'node:child_process';
import { createConnection } from 'node:net';
import { join } from 'node:path';
import { deployEnv, DIST_DIR, HOST, PORT, WEB_DIR } from './env.mjs';

const listening = await new Promise((done) => {
  const socket = createConnection({ host: HOST, port: PORT });
  socket.once('connect', () => {
    socket.end();
    done(true);
  });
  socket.once('error', () => done(false));
});
if (listening) {
  console.error(`Сайт работает на ${HOST}:${PORT} — сначала закройте окно «components Site» (или запустите батник с rebuild).`);
  process.exit(1);
}

console.log(`Собираю apps/web в ${DIST_DIR} (basePath ${deployEnv().BASE_PATH}) — несколько минут...`);
const result = spawnSync(process.execPath, [join(WEB_DIR, 'node_modules', 'next', 'dist', 'bin', 'next'), 'build'], {
  cwd: WEB_DIR,
  env: { ...process.env, ...deployEnv() },
  stdio: 'inherit',
});
process.exit(result.status ?? 1);
