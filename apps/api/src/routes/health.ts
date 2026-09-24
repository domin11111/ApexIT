import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import type { Redis } from '../cache/redis';
import type { Db } from '../db/prisma';

const Check = z.enum(['ok', 'fail']);

const Health = z.object({
  /** ok — всё работает; degraded — нет кэша, но API отвечает; down — нет БД */
  status: z.enum(['ok', 'degraded', 'down']),
  uptimeSeconds: z.number().int(),
  checks: z.object({ database: Check, cache: Check }),
});

async function probe(run: () => Promise<unknown>, timeoutMs = 1_500): Promise<z.infer<typeof Check>> {
  let timer: NodeJS.Timeout | undefined;
  try {
    await Promise.race([
      run(),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error('timeout')), timeoutMs);
      }),
    ]);
    return 'ok';
  } catch {
    return 'fail';
  } finally {
    clearTimeout(timer);
  }
}

export const healthRoutes: FastifyPluginAsyncZod<{ prisma: Db; redis: Redis }> = async (app, { prisma, redis }) => {
  app.get(
    '/health',
    {
      schema: {
        tags: ['system'],
        summary: 'Состояние сервиса',
        description: '200 — БД доступна (даже без кэша), 503 — БД недоступна.',
        response: { 200: Health, 503: Health },
      },
    },
    async (_request, reply) => {
      const [database, cache] = await Promise.all([
        probe(() => prisma.$queryRaw`SELECT 1`),
        probe(() => redis.ping()),
      ]);
      const status = database === 'fail' ? 'down' : cache === 'fail' ? 'degraded' : 'ok';
      return reply
        .code(database === 'ok' ? 200 : 503)
        .header('cache-control', 'no-store')
        .send({ status, uptimeSeconds: Math.round(process.uptime()), checks: { database, cache } });
    },
  );
};
