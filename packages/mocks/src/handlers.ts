import { buildCatalogRecords, type CatalogRecords } from '@apex/collection';
import {
  CompareQuery,
  ConfigurationPayload,
  LocaleQuery,
  ProductListQuery,
  ShareCode,
  Slug,
  SocketParam,
} from '@apex/contracts';
import { createCatalogService, createConfiguratorService, DomainError } from '@apex/domain';
import { delay, http, HttpResponse, type JsonBodyType } from 'msw';
import { ZodError } from 'zod';
import { createMemoryConfigurationStore, createMemorySource } from './memory-source';

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
  // Сохранённые сборки живут, пока открыта вкладка (или процесс теста)
  const configurator = createConfiguratorService({ catalog, store: createMemoryConfigurationStore() });

  const respond = async <T extends JsonBodyType>(run: () => T | Promise<T>, status = 200) => {
    if (latencyMs > 0) await delay(latencyMs);
    try {
      return HttpResponse.json(await run(), { status });
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

    http.post('*/api/v1/configurations/validate', async ({ request }) => {
      const body: unknown = await request.json();
      return respond(() =>
        configurator.validate(ConfigurationPayload.parse(body), LocaleQuery.parse(searchParams(request)).locale),
      );
    }),

    http.post('*/api/v1/configurations', async ({ request }) => {
      const body: unknown = await request.json();
      return respond(() => configurator.save(ConfigurationPayload.parse(body)), 201);
    }),

    http.get('*/api/v1/configurations/:shareCode', ({ params }) =>
      respond(() => configurator.load(ShareCode.parse(params.shareCode))),
    ),
  ];
}

export const handlers = createHandlers();
