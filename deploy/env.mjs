// Окружение боевой копии сайта на https://lenivec.online/app/components/ — общее для сборки и сервера.
//
// Те же сборка и сервер гоняются в E2E-тестах и CI: переменные APEX_* меняют порт, папку сборки и
// данных, а APEX_SECRETS=off отключает Telegram и Turnstile — тестовые заявки никуда не уходят.
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseEnv } from 'node:util';

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const WEB_DIR = join(ROOT, 'apps', 'web');
export const BASE_PATH = '/app/components';
export const SITE_URL = process.env.APEX_SITE_URL || `https://lenivec.online${BASE_PATH}`;
// Своя папка сборки: локальный `next build` (замеры, отладка) пишет в .next и боевую не трогает
export const DIST_DIR = process.env.APEX_DIST_DIR || '.next-deploy';
export const DATA_DIR = process.env.APEX_DATA_DIR || join(ROOT, 'deploy', 'data');
export const HOST = '127.0.0.1';
export const PORT = Number(process.env.APEX_PORT || 25580);

/** Ключи из .env-файла (нет файла — пусто). */
function readEnvFile(file) {
  return existsSync(file) ? parseEnv(readFileSync(file, 'utf8')) : {};
}

const SECRET_KEYS = ['NEXT_PUBLIC_TURNSTILE_SITE_KEY', 'TURNSTILE_SECRET', 'TELEGRAM_BOT_TOKEN', 'TELEGRAM_CHAT_ID', 'LEAD_IP_SALT'];

/**
 * Переменные для `next build` и сервера. Пустые строки — нарочно: Next не перезаписывает уже
 * заданные переменные значениями из apps/web/.env.local, а там для разработки указан API на
 * localhost:4000 и MSW-моки. Боевая копия работает без API — каталог встроенный, заявки и сборки
 * принимают маршруты самого Next (app/api/v1).
 *
 * Секреты (Telegram, Turnstile) — из корневого .env, а deploy/components.env (вне git) может их
 * переопределить: например, боевые ключи Turnstile для lenivec.online. С APEX_SECRETS=off они
 * пустые — и пустые же перекрывают тестовый ключ Turnstile из .env.local.
 */
export function deployEnv() {
  const noSecrets = process.env.APEX_SECRETS === 'off';
  const secrets = noSecrets ? {} : { ...readEnvFile(join(ROOT, '.env')), ...readEnvFile(join(ROOT, 'deploy', 'components.env')) };
  return {
    NODE_ENV: 'production',
    NEXT_TELEMETRY_DISABLED: '1',
    BASE_PATH,
    NEXT_DIST_DIR: DIST_DIR,
    NEXT_PUBLIC_SITE_URL: SITE_URL,
    API_URL: '',
    NEXT_PUBLIC_API_URL: '',
    NEXT_PUBLIC_API_MOCKING: 'disabled',
    APEX_DATA_DIR: DATA_DIR,
    ...Object.fromEntries(SECRET_KEYS.flatMap((key) => (noSecrets ? [[key, '']] : secrets[key] ? [[key, secrets[key]]] : []))),
  };
}
