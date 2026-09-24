/**
 * Сид коллекции: `pnpm db:seed`. Логика — в src/db/seed-catalog.ts (её же использует интеграционный тест).
 * В production существующие продукты не перезаписываются, пока не задан SEED_FORCE=1.
 */
import '../src/config/load-env';
import { buildCatalogRecords } from '@apex/collection';
import { createPrisma } from '../src/db/prisma';
import { seedCatalog } from '../src/db/seed-catalog';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error('DATABASE_URL не задан — скопируйте .env.example в .env');
}

const prisma = createPrisma(databaseUrl);

try {
  const stats = await seedCatalog(prisma, buildCatalogRecords(), {
    overwriteExisting: process.env.NODE_ENV !== 'production' || process.env.SEED_FORCE === '1',
  });
  console.log(`✓ Платформы: ${stats.platforms}`);
  console.log(
    `✓ Продукты: создано ${stats.created}, обновлено ${stats.updated}, пропущено ${stats.skipped}` +
      (stats.skipped > 0 ? ' (production — для перезаписи задайте SEED_FORCE=1)' : ''),
  );
  console.log(`✓ Материнские платы: ${stats.motherboards}`);
} finally {
  await prisma.$disconnect();
}
