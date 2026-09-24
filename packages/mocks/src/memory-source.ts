import type { CatalogRecords } from '@apex/collection';
import type { CatalogSource } from '@apex/domain';

const bySortOrder = <T extends { sortOrder: number }>(items: readonly T[], tieBreak: (item: T) => string) =>
  items.toSorted((a, b) => a.sortOrder - b.sortOrder || tieBreak(a).localeCompare(tieBreak(b)));

/**
 * Источник каталога в памяти — зеркало Prisma-репозитория API:
 * те же фильтры (только опубликованное) и та же сортировка.
 */
export function createMemorySource(records: CatalogRecords, now: () => Date = () => new Date()): CatalogSource {
  const published = () => records.products.filter((p) => p.publishedAt !== null && p.publishedAt <= now());

  return {
    async listProducts({ category, status }) {
      return bySortOrder(
        published().filter((p) => (!category || p.category === category) && (!status || p.status === status)),
        (p) => p.name,
      );
    },
    async findProduct(slug) {
      return published().find((p) => p.slug === slug) ?? null;
    },
    async findProducts(slugs) {
      return published().filter((p) => slugs.includes(p.slug));
    },
    async listPlatforms() {
      return bySortOrder(records.platforms, (p) => p.socket);
    },
    async platformExists(socket) {
      return records.platforms.some((p) => p.socket === socket);
    },
    async listMotherboards(socket) {
      return bySortOrder(
        records.motherboards.filter((b) => b.platform.socket === socket),
        (b) => `${b.vendor} ${b.model}`,
      );
    },
  };
}
