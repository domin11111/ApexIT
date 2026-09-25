import './config/load-env';
import { Worker } from 'bullmq';
import closeWithGrace from 'close-with-grace';
import pino from 'pino';
import { createCatalogPublisher } from './admin/publish';
import { ASSET_QUEUE, queueConnection, runModelJob, type ModelJob } from './assets/jobs';
import { CatalogCache } from './cache/catalog-cache';
import { createRedis } from './cache/redis';
import { loadEnv } from './config/env';
import { createPrisma } from './db/prisma';
import { createS3Storage } from './storage/storage';

/**
 * Воркер обработки 3D-моделей: отдельный процесс, чтобы тяжёлое сжатие (KTX2, Meshopt,
 * упрощение) не занимало event loop API. Масштабируется числом процессов.
 */
const env = loadEnv();
const log = pino({ level: env.LOG_LEVEL, ...(env.NODE_ENV === 'development' ? { transport: { target: 'pino-pretty' } } : {}) });
const prisma = createPrisma(env.DATABASE_URL);
const redis = createRedis(env.REDIS_URL);
await redis.connect().catch((err: unknown) => log.warn({ err }, 'Redis для кэша недоступен'));

const deps = {
  prisma,
  storage: createS3Storage(env),
  publisher: createCatalogPublisher({ cache: new CatalogCache(redis, env.CACHE_TTL_SECONDS, log), webUrl: env.WEB_URL, secret: env.REVALIDATE_SECRET, log }),
  ktxDir: env.KTX_SOFTWARE_DIR,
  log,
};

const worker = new Worker<ModelJob>(ASSET_QUEUE, (job) => runModelJob(deps, job.data.assetId), {
  connection: queueConnection(env.REDIS_URL),
  // Сжатие текстур само многопоточное — по одной модели за раз
  concurrency: 1,
});
worker.on('failed', (job, err) => log.error({ err, assetId: job?.data.assetId }, 'Задача обработки модели упала'));
log.info('Воркер моделей запущен');

closeWithGrace({ delay: 30_000 }, async ({ signal, err }) => {
  if (err) log.error({ err }, 'Остановка воркера из-за ошибки');
  else log.info({ signal }, 'Остановка воркера');
  await worker.close();
  await prisma.$disconnect();
  redis.disconnect();
});
