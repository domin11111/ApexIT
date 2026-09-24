import type { Locale } from '@apex/contracts';
import type { CatalogService, ProductFilter } from '@apex/domain';
import type { CatalogCache } from '../cache/catalog-cache';

/** Сервис каталога с кэшем: ключ включает все параметры, влияющие на ответ, включая локаль. */
export function createCachedCatalog(service: CatalogService, cache: CatalogCache) {
  return {
    listProducts: (filter: ProductFilter, locale: Locale) =>
      cache.wrap(`products:${filter.category ?? '*'}:${filter.status ?? '*'}:${locale}`, () =>
        service.listProducts(filter, locale),
      ),

    getProduct: (slug: string, locale: Locale) =>
      cache.wrap(`product:${slug}:${locale}`, () => service.getProduct(slug, locale)),

    // Порядок slug важен: это порядок колонок в таблице
    compare: (slugs: readonly string[], locale: Locale) =>
      cache.wrap(`compare:${slugs.join(',')}:${locale}`, () => service.compare(slugs, locale)),

    listPlatforms: (locale: Locale) => cache.wrap(`platforms:${locale}`, () => service.listPlatforms(locale)),

    listMotherboards: (socket: string, locale: Locale) =>
      cache.wrap(`motherboards:${socket}:${locale}`, () => service.listMotherboards(socket, locale)),
  };
}

export type CachedCatalog = ReturnType<typeof createCachedCatalog>;
