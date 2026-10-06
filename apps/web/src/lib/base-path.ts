/*
 * Префикс сайта на общем домене. Боевая сборка живёт под https://lenivec.online/app/components/
 * (basePath в next.config.ts, из переменной BASE_PATH при сборке); в разработке префикса нет.
 *
 * Ссылки next/link и роутер Next добавляют basePath сами. Всё остальное — fetch, srcset,
 * адреса GLB для загрузчика three.js — строки, которые Next не видит: их ведём через withBasePath.
 * Путь от корня без префикса на общем домене ушёл бы в соседнее приложение.
 */
export const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? '';

/** '/models/a.glb' → '/app/components/models/a.glb'. Абсолютные URL и уже префиксованные пути — как есть. */
export function withBasePath(path: string): string {
  if (!BASE_PATH || !path.startsWith('/') || path.startsWith('//')) return path;
  if (path === BASE_PATH || path.startsWith(`${BASE_PATH}/`)) return path;
  return `${BASE_PATH}${path}`;
}

/** Обратное: путь из адресной строки или href без префикса — для роутера, который добавит его сам. */
export function stripBasePath(path: string): string {
  if (!BASE_PATH) return path;
  if (path === BASE_PATH) return '/';
  return path.startsWith(`${BASE_PATH}/`) ? path.slice(BASE_PATH.length) : path;
}
