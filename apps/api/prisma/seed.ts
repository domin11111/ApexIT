/**
 * Сид коллекции: платформы → продукты (характеристики, хотспоты, совместимость) → материнские платы.
 *
 * Идемпотентен: повторный запуск синхронизирует БД с @apex/collection.
 * Дочерние записи продукта пересоздаются целиком, поэтому в production существующие продукты
 * не трогаются (их могли поправить в админке — например, хотспоты), пока не задан SEED_FORCE=1.
 */
import '../src/config/load-env';
import { loadCollection, type L10n } from '@apex/collection';
import { specKeyMeta } from '@apex/contracts';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error('DATABASE_URL не задан — скопируйте .env.example в .env');
}

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl }) });
const overwriteExisting = process.env.NODE_ENV !== 'production' || process.env.SEED_FORCE === '1';

// Перевод [ru, en]: ru — в базовую колонку, en — в JSON i18n.
const ru = (text: L10n) => text[0];
const ruOrNull = (text?: L10n) => text?.[0] ?? null;
const en = (text?: L10n) => text?.[1];

async function main() {
  const collection = loadCollection();

  // ── 1. Платформы ────────────────────────────────────────────────────────────
  const platformIds = new Map<string, string>();
  for (const { socket, availabilityWindow, availabilityNote, ...columns } of collection.platforms) {
    const data = {
      ...columns,
      availabilityWindow: availabilityWindow ?? null,
      availabilityNote: ruOrNull(availabilityNote),
      i18n: { en: { availabilityNote: en(availabilityNote) } },
    };
    const { id } = await prisma.platform.upsert({
      where: { socket },
      create: { socket, ...data },
      update: data,
      select: { id: true },
    });
    platformIds.set(socket, id);
  }

  const platformId = (socket: string) => {
    const id = platformIds.get(socket);
    if (!id) throw new Error(`Платформа ${socket} не найдена`);
    return id;
  };

  // ── 2. Продукты ─────────────────────────────────────────────────────────────
  const stats = { created: 0, updated: 0, skipped: 0 };
  const publishedAt = new Date();

  for (const product of collection.products) {
    const existing = await prisma.product.findUnique({ where: { slug: product.slug }, select: { id: true } });
    if (existing && !overwriteExisting) {
      stats.skipped++;
      continue;
    }

    const {
      slug,
      codename,
      tagline,
      description,
      availabilityWindow,
      availabilityNote,
      accentColorAlt,
      specGroups,
      hotspots,
      compatibility,
      ...columns
    } = product;

    const data = {
      ...columns,
      codename: codename ?? null,
      tagline: ru(tagline),
      description: ru(description),
      availabilityWindow: availabilityWindow ?? null,
      availabilityNote: ruOrNull(availabilityNote),
      accentColorAlt: accentColorAlt ?? null,
      i18n: {
        en: { tagline: en(tagline), description: en(description), availabilityNote: en(availabilityNote) },
      },
    };

    await prisma.$transaction(
      async (tx) => {
        const { id: productId } = await tx.product.upsert({
          where: { slug },
          create: { slug, ...data, publishedAt },
          update: data,
          select: { id: true },
        });

        // Характеристики удаляются каскадом вместе с группами.
        await tx.specGroup.deleteMany({ where: { productId } });
        await tx.hotspot.deleteMany({ where: { productId } });
        await tx.compatibility.deleteMany({ where: { productId } });

        for (const [groupOrder, group] of specGroups.entries()) {
          const { id: groupId } = await tx.specGroup.create({
            data: {
              productId,
              key: group.key,
              title: ru(group.title),
              order: groupOrder,
              i18n: { en: { title: en(group.title) } },
            },
            select: { id: true },
          });

          await tx.spec.createMany({
            data: group.specs.map((spec, order) => {
              const meta = specKeyMeta(spec.key);
              return {
                productId,
                groupId,
                key: spec.key,
                label: ru(spec.label),
                value: ru(spec.value),
                numericValue: spec.numericValue ?? null,
                unit: spec.numericValue === undefined ? null : (meta.unit ?? null),
                highlight: spec.highlight ?? false,
                compareDirection: spec.compareDirection ?? meta.direction,
                note: ruOrNull(spec.note),
                order,
                i18n: { en: { label: en(spec.label), value: en(spec.value), note: en(spec.note) } },
              };
            }),
          });
        }

        await tx.hotspot.createMany({
          data: hotspots.map((hotspot, order) => ({
            productId,
            key: hotspot.key,
            anchorNode: hotspot.anchorNode ?? null,
            position: hotspot.position,
            cameraPosition: hotspot.cameraPosition,
            cameraTarget: hotspot.cameraTarget,
            visibility: hotspot.visibility,
            title: ru(hotspot.title),
            body: ru(hotspot.body),
            order,
            i18n: { en: { title: en(hotspot.title), body: en(hotspot.body) } },
          })),
        });

        await tx.compatibility.createMany({
          data: compatibility.map((c) => ({
            productId,
            platformId: platformId(c.socket),
            level: c.level,
            notes: ruOrNull(c.notes),
            i18n: { en: { notes: en(c.notes) } },
          })),
        });
      },
      { timeout: 30_000 },
    );

    stats[existing ? 'updated' : 'created']++;
  }

  // ── 3. Материнские платы ────────────────────────────────────────────────────
  for (const { vendor, model, socket, availabilityWindow, note, ...columns } of collection.motherboards) {
    const data = {
      ...columns,
      platformId: platformId(socket),
      availabilityWindow: availabilityWindow ?? null,
      note: ruOrNull(note),
      i18n: { en: { note: en(note) } },
    };
    await prisma.motherboard.upsert({
      where: { vendor_model: { vendor, model } },
      create: { vendor, model, ...data },
      update: data,
    });
  }

  await prisma.auditLog.create({
    data: { action: 'seed.run', entity: 'Collection', entityId: 'compute-collection-2026', diff: stats },
  });

  console.log(`✓ Платформы: ${platformIds.size}`);
  console.log(
    `✓ Продукты: создано ${stats.created}, обновлено ${stats.updated}, пропущено ${stats.skipped}` +
      (stats.skipped > 0 ? ' (production — для перезаписи задайте SEED_FORCE=1)' : ''),
  );
  console.log(`✓ Материнские платы: ${collection.motherboards.length}`);
}

try {
  await main();
} finally {
  await prisma.$disconnect();
}
