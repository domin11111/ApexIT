import type {
  CompareResponse,
  Locale,
  MotherboardDto,
  PlatformDto,
  ProductDetailDto,
  ProductListResponse,
} from '@apex/contracts';
import { buildCompareTable } from './compare';
import { DomainError } from './errors';
import {
  toMotherboardDto,
  toPlatformDto,
  toProductDetailDto,
  toProductSummaryDto,
} from './mappers';
import type { CatalogSource, ProductFilter } from './records';

/**
 * Сценарии публичного каталога поверх любого источника данных.
 * API оборачивает их кэшем Redis, моки фронта вызывают напрямую.
 */
export function createCatalogService(source: CatalogSource) {
  return {
    async listProducts(filter: ProductFilter, locale: Locale): Promise<ProductListResponse> {
      const products = await source.listProducts(filter);
      return { items: products.map((p) => toProductSummaryDto(p, locale)) };
    },

    async getProduct(slug: string, locale: Locale): Promise<ProductDetailDto> {
      const product = await source.findProduct(slug);
      if (!product) throw new DomainError('PRODUCT_NOT_FOUND', `Продукт «${slug}» не найден`, { slug });
      return toProductDetailDto(product, locale);
    },

    async compare(slugs: readonly string[], locale: Locale): Promise<CompareResponse> {
      const found = await source.findProducts(slugs);
      const bySlug = new Map(found.map((p) => [p.slug, p]));
      const missing = slugs.filter((slug) => !bySlug.has(slug));
      if (missing.length > 0) {
        throw new DomainError('COMPARE_UNKNOWN_PRODUCTS', `Не найдены продукты: ${missing.join(', ')}`, { missing });
      }

      // Колонки — в порядке из запроса, а не из БД: так их выбрал пользователь.
      const products = slugs.map((slug) => toProductDetailDto(bySlug.get(slug)!, locale));
      const table = buildCompareTable(products);
      return {
        ...table,
        products: slugs.map((slug) => toProductSummaryDto(bySlug.get(slug)!, locale)),
      };
    },

    async listPlatforms(locale: Locale): Promise<{ items: PlatformDto[] }> {
      const platforms = await source.listPlatforms();
      return { items: platforms.map((p) => toPlatformDto(p, locale)) };
    },

    async listMotherboards(socket: string, locale: Locale): Promise<{ items: MotherboardDto[] }> {
      if (!(await source.platformExists(socket))) {
        throw new DomainError('PLATFORM_NOT_FOUND', `Платформа ${socket} не найдена`, { socket });
      }
      const boards = await source.listMotherboards(socket);
      return { items: boards.map((b) => toMotherboardDto(b, locale)) };
    },
  };
}

export type CatalogService = ReturnType<typeof createCatalogService>;
