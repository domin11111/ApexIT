/**
 * `pnpm --filter @apex/api openapi` — выгружает спецификацию в apps/api/openapi.json.
 * Подключения к БД и Redis не открываются: документ строится только из схем маршрутов.
 */
import '../config/load-env';
import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { buildApp } from '../app';
import { createRedis } from '../cache/redis';
import { loadEnv } from '../config/env';
import { createPrisma } from '../db/prisma';

const env = loadEnv({ ...process.env, NODE_ENV: 'production', LOG_LEVEL: 'silent' });
const app = await buildApp({ env, prisma: createPrisma(env.DATABASE_URL), redis: createRedis(env.REDIS_URL) });
await app.ready();

const target = new URL('../../openapi.json', import.meta.url);
await writeFile(target, `${JSON.stringify(app.swagger(), null, 2)}\n`);
await app.close();
console.log(`✓ OpenAPI → ${fileURLToPath(target)}`);
