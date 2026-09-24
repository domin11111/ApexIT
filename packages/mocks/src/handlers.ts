import { buildCatalogRecords, type CatalogRecords } from '@apex/collection';
import { CompareQuery, LocaleQuery, ProductListQuery, Slug, SocketParam } from '@apex/contracts';
import { createCatalogService, DomainError } from '@apex/domain';
import { delay, http, HttpResponse, type JsonBodyType } from 'msw';
import { ZodError } from 'zod';
import { createMemorySource } from './memory-source';

export type MockOptions = {
  records?: CatalogRecords;
  /** Искусственная задержка ответа — чтобы видеть плейсхолдеры и прелоадер */
  latencyMs?: number;
};

/**
 * MSW-обработчики публичного API /api/v1 для фронта до готовности бэкенда.
 * Вызывают тот же сервис каталога (@apex/domain), что и API, поэтому формат ответов,
 * локализация, порядок и ошибки совпадают — это проверяет интеграционный тест apps/api.
 */
export function createHandlers({ records = buildCatalogRecords(), latencyMs = 0 }: MockOptions = {}) {
  const catalog = createCatalogService(createMemorySource(records));

  const respond = async <T extends JsonBodyType>(run: () => T | Promise<T>) => {
    if (latencyMs > 0) await delay(latencyMs);
    try {
      return HttpResponse.json(await run());
    } catch (error) {
      if (error instanceof DomainError) {
        return HttpResponse.json(error.toApiError(), { status: error.status });
      }
      if (error instanceof ZodError) {
        return HttpResponse.json(
          { error: { code: 'VALIDATION_ERROR', message: 'Некорректные параметры запроса', details: error.issues } },
          { status: 400 },
        );
      }
      throw error;
    }
  };

  const searchParams = (request: Request) => Object.fromEntries(new URL(request.url).searchParams);

  return [
    http.get('*/api/v1/products', ({ request }) =>
      respond(() => {
        const { locale, ...filter } = ProductListQuery.parse(searchParams(request));
        return catalog.listProducts(filter, locale);
      }),
    ),

    http.get('*/api/v1/products/:slug', ({ request, params }) =>
      respond(() => catalog.getProduct(Slug.parse(params.slug), LocaleQuery.parse(searchParams(request)).locale)),
    ),

    http.get('*/api/v1/compare', ({ request }) =>
      respond(() => {
        const { slugs, locale } = CompareQuery.parse(searchParams(request));
        return catalog.compare(slugs, locale);
      }),
    ),

    http.get('*/api/v1/platforms', ({ request }) =>
      respond(() => catalog.listPlatforms(LocaleQuery.parse(searchParams(request)).locale)),
    ),

    http.get('*/api/v1/platforms/:socket/motherboards', ({ request, params }) =>
      respond(() =>
        catalog.listMotherboards(SocketParam.parse(params.socket), LocaleQuery.parse(searchParams(request)).locale),
      ),
    ),
  ];
}

export const handlers = createHandlers();
