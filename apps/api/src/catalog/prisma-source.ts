import type { CatalogSource } from '@apex/domain';
import type { Prisma } from '../generated/prisma/client';
import type { Db } from '../db/prisma';

const summaryInclude = {
  heroImage: true,
  // Для карточек нужны только характеристики с highlight
  specGroups: {
    orderBy: { order: 'asc' },
    include: { specs: { where: { highlight: true }, orderBy: { order: 'asc' } } },
  },
} satisfies Prisma.ProductInclude;

const detailInclude = {
  heroImage: true,
  modelAsset: { include: { variants: true } },
  specGroups: { orderBy: { order: 'asc' }, include: { specs: { orderBy: { order: 'asc' } } } },
  hotspots: { orderBy: { order: 'asc' } },
  compatibility: { include: { platform: { select: { socket: true, name: true } } } },
} satisfies Prisma.ProductInclude;

/** Источник каталога поверх PostgreSQL. Отдаёт только опубликованные продукты. */
export function createPrismaSource(prisma: Db, now: () => Date = () => new Date()): CatalogSource {
  const published = () => ({ publishedAt: { not: null, lte: now() } });

  return {
    listProducts: ({ category, status }) =>
      prisma.product.findMany({
        where: { ...published(), category, status },
        include: summaryInclude,
        orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      }),

    findProduct: (slug) =>
      prisma.product.findFirst({ where: { slug, ...published() }, include: detailInclude }),

    findProducts: (slugs) =>
      prisma.product.findMany({ where: { slug: { in: [...slugs] }, ...published() }, include: detailInclude }),

    listPlatforms: () => prisma.platform.findMany({ orderBy: [{ sortOrder: 'asc' }, { socket: 'asc' }] }),

    platformExists: async (socket) => (await prisma.platform.count({ where: { socket } })) > 0,

    listMotherboards: (socket) =>
      prisma.motherboard.findMany({
        where: { platform: { socket } },
        include: { platform: { select: { socket: true } } },
        orderBy: [{ sortOrder: 'asc' }, { vendor: 'asc' }, { model: 'asc' }],
      }),
  };
}
