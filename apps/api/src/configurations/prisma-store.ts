import type { ConfigurationStore } from '@apex/domain';
import type { Prisma } from '../generated/prisma/client';
import type { Db } from '../db/prisma';

/** Сохранённые сборки в PostgreSQL. Код уникален: при коллизии insert возвращает false. */
export function createPrismaConfigurationStore(prisma: Db): ConfigurationStore {
  return {
    find: (shareCode) =>
      prisma.configuration.findUnique({
        where: { shareCode },
        select: { shareCode: true, payload: true, totals: true, createdAt: true },
      }),

    async insert({ shareCode, payload, totals, createdAt }) {
      // ON CONFLICT DO NOTHING: гонка двух одинаковых сохранений не превращается в ошибку 500
      const { count } = await prisma.configuration.createMany({
        data: [
          {
            shareCode,
            // payload и totals уже прошли схемы контрактов — это чистый JSON
            payload: payload as Prisma.InputJsonValue,
            totals: totals as Prisma.InputJsonValue,
            createdAt,
          },
        ],
        skipDuplicates: true,
      });
      return count === 1;
    },
  };
}
