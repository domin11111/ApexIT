// Боевой сервер сайта: https://lenivec.online/app/components/ → Caddy → 127.0.0.1:25580 → здесь.
//
//   node deploy\server.mjs        (запускает «запуск компонентов.bat» в окне «components Site»)
//
// Свой файл, а не `next start`, по трём причинам:
// 1. Отпечаток. stop-components.ps1 ищет процесс по полному пути к этому файлу — dev-сервер
//    (`next dev`) и локальные `next start` для замеров под него не попадают и остаются жить.
// 2. Кривой запрос не роняет процесс: адрес с битым %-кодированием (например %E0%A4%A) получает
//    400 до Next, а ошибка или необработанный reject в обработчике пишется в журнал, процесс живёт.
// 3. Окружение боевой копии (deploy/env.mjs) задаётся здесь, до загрузки Next.
import { existsSync } from 'node:fs';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { BASE_PATH, deployEnv, DIST_DIR, HOST, PORT, WEB_DIR } from './env.mjs';

Object.assign(process.env, deployEnv());
// next.config.ts считает корень монорепо от текущей папки
process.chdir(WEB_DIR);

const stamp = () => new Date().toISOString().slice(0, 19).replace('T', ' ');
process.on('unhandledRejection', (reason) => console.error(stamp(), '[unhandledRejection]', reason));
process.on('uncaughtException', (error) => console.error(stamp(), '[uncaughtException]', error));

if (!existsSync(join(WEB_DIR, DIST_DIR, 'BUILD_ID'))) {
  console.error(`Нет боевой сборки (${join(WEB_DIR, DIST_DIR)}). Соберите: node deploy\\build.mjs`);
  process.exit(1);
}

/** Админка работает только с API и базой, которых у боевой копии нет; наружу её не выставляем. */
const HIDDEN = [`${BASE_PATH}/admin`, `${BASE_PATH}/api/admin`, `${BASE_PATH}/api/revalidate`];
const hidden = (path) => HIDDEN.some((prefix) => path === prefix || path.startsWith(`${prefix}/`));

function plain(res, status, text) {
  res.writeHead(status, { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' });
  res.end(text);
}

const next = createRequire(join(WEB_DIR, 'package.json'))('next');
// hostname — только имя в адресах, которые Next строит сам (слушаем всё равно 127.0.0.1, см. listen).
// Middleware next-intl собирает адрес переписывания с localhost; будь здесь 127.0.0.1, Next счёл бы
// переписывание внешним и стал проксировать запрос сам себе — отсюда 500 и вечные 307.
const app = next({ dev: false, dir: WEB_DIR, hostname: 'localhost', port: PORT });
const handle = app.getRequestHandler();
await app.prepare();

/*
 * Кеш. Хешированные файлы _next/static Next отдаёт с immutable — их и оставляем. Страницам SSG/ISR
 * он ставит s-maxage на год: за Cloudflare с правилом «кешировать всё» HTML застрял бы там после
 * обновления сайта. Такие ответы переводим в no-cache — браузер и CDN переспрашивают, ETag даёт 304.
 */
function revalidateAlways(res) {
  if (String(res.getHeader('cache-control') ?? '').includes('s-maxage')) res.setHeader('cache-control', 'no-cache');
}

const server = createServer((req, res) => {
  let path;
  try {
    path = decodeURIComponent(new URL(req.url ?? '/', 'http://localhost').pathname);
  } catch {
    return plain(res, 400, 'Bad Request');
  }
  if (hidden(path)) return plain(res, 404, 'Not Found');

  const writeHead = res.writeHead;
  res.writeHead = function (...args) {
    revalidateAlways(this);
    return writeHead.apply(this, args);
  };

  Promise.resolve(handle(req, res)).catch((error) => {
    console.error(stamp(), '[request]', req.method, req.url, error);
    if (!res.headersSent) plain(res, 500, 'Internal Server Error');
    else res.destroy();
  });
});

// Caddy держит соединения к нам открытыми до 2 минут: закрывать раньше — значит ловить 502 на гонке
server.keepAliveTimeout = 125_000;
server.headersTimeout = 126_000;

server.listen(PORT, HOST, () => {
  console.log(`${stamp()} components: http://${HOST}:${PORT}${BASE_PATH}/  (снаружи https://lenivec.online${BASE_PATH}/)`);
});
