import { resolve } from 'node:path';
import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';

// next запускается из apps/web — корень монорепо на два уровня выше
const monorepoRoot = resolve(process.cwd(), '../..');

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // Внутренние пакеты отдают TypeScript-исходники — Next их транспилирует
  transpilePackages: ['@apex/collection', '@apex/contracts', '@apex/domain', '@apex/mocks', '@apex/ui'],
  turbopack: { root: monorepoRoot },
  outputFileTracingRoot: monorepoRoot,
};

export default createNextIntlPlugin('./src/i18n/request.ts')(nextConfig);
