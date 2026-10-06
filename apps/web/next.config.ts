import { resolve } from 'node:path';
import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';

// next запускается из apps/web — корень монорепо на два уровня выше
const monorepoRoot = resolve(process.cwd(), '../..');

/*
 * Боевая сборка (deploy/build-components.ps1) живёт под https://lenivec.online/app/components/:
 * BASE_PATH=/app/components и отдельная папка сборки NEXT_DIST_DIR=.next-deploy — локальные
 * `next build` для замеров не затирают то, что крутится на домене. Без переменных — как раньше.
 */
const basePath = process.env.BASE_PATH?.replace(/\/$/, '') || undefined;

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  basePath,
  distDir: process.env.NEXT_DIST_DIR || '.next',
  // Префикс нужен и в браузере: fetch, srcset и загрузчик GLB его сами не добавляют (lib/base-path.ts)
  env: { NEXT_PUBLIC_BASE_PATH: basePath ?? '' },
  // Внутренние пакеты отдают TypeScript-исходники — Next их транспилирует
  transpilePackages: ['@apex/collection', '@apex/contracts', '@apex/domain', '@apex/mocks', '@apex/ui'],
  turbopack: { root: monorepoRoot },
  // app/global-not-found.tsx: 404 для адресов вне локалей (robots.txt и т. п. — свои маршруты)
  experimental: { globalNotFound: true },
  outputFileTracingRoot: monorepoRoot,
};

export default createNextIntlPlugin('./src/i18n/request.ts')(nextConfig);
