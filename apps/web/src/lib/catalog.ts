import 'server-only';
import { buildCatalogRecords } from '@apex/collection';
import { CompareResponse, ProductDetailDto, ProductListResponse, type Locale } from '@apex/contracts';
import { createCatalogService, DomainError, type CatalogService } from '@apex/domain';
import { createMemorySource } from '@apex/mocks';
import { notFound } from 'next/navigation';

/*
 * Данные каталога для серверных компонентов.
 * API_URL задан — ходим в API с ISR-кэшем; не задан — используем тот же сервис каталога
 * на встроенных данных коллекции (ответы совпадают с API, это проверяет тест apps/api).
 */

const API_URL = process.env.API_URL?.replace(/\/$/, '');
const REVALIDATE_SECONDS = 300;

let localCatalog: CatalogService | undefined;
const mockCatalog = () => (localCatalog ??= createCatalogService(createMemorySource(buildCatalogRecords())));

async function fromApi<T>(path: string, parse: (body: unknown) => T): Promise<T> {
  const response = await fetch(`${API_URL}/api/v1${path}`, {
    next: { revalidate: REVALIDATE_SECONDS, tags: ['catalog'] },
  });
  if (response.status === 404) notFound();
  if (!response.ok) throw new Error(`API ${path} ответил ${response.status}`);
  return parse(await response.json());
}

export async function getProducts(locale: Locale): Promise<ProductListResponse> {
  if (!API_URL) return mockCatalog().listProducts({}, locale);
  return fromApi(`/products?locale=${locale}`, (body) => ProductListResponse.parse(body));
}

export async function getProduct(slug: string, locale: Locale): Promise<ProductDetailDto> {
  if (!API_URL) {
    try {
      return await mockCatalog().getProduct(slug, locale);
    } catch (error) {
      if (error instanceof DomainError && error.code === 'PRODUCT_NOT_FOUND') notFound();
      throw error;
    }
  }
  return fromApi(`/products/${encodeURIComponent(slug)}?locale=${locale}`, (body) => ProductDetailDto.parse(body));
}

export async function getCompare(slugs: string[], locale: Locale): Promise<CompareResponse> {
  if (!API_URL) return mockCatalog().compare(slugs, locale);
  return fromApi(`/compare?slugs=${slugs.map(encodeURIComponent).join(',')}&locale=${locale}`, (body) =>
    CompareResponse.parse(body),
  );
}
