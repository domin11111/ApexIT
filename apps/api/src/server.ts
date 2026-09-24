import './config/load-env';
import closeWithGrace from 'close-with-grace';
import { buildApp } from './app';
import { createRedis } from './cache/redis';
import { loadEnv } from './config/env';
import { createPrisma } from './db/prisma';

const env = loadEnv();
const prisma = createPrisma(env.DATABASE_URL);
const redis = createRedis(env.REDIS_URL);
const app = await buildApp({ env, prisma, redis });

// Redis не обязателен для старта: без него API работает без кэша и лимитов.
await redis.connect().catch((err: unknown) => app.log.warn({ err }, 'Redis недоступен — работаем без кэша'));

closeWithGrace({ delay: 10_000 }, async ({ signal, err }) => {
  if (err) app.log.error({ err }, 'Остановка из-за необработанной ошибки');
  else app.log.info({ signal }, 'Остановка сервера');
  await app.close();
});

await app.listen({ host: env.API_HOST, port: env.API_PORT });
app.log.info(`Документация API: http://localhost:${env.API_PORT}/docs`);
