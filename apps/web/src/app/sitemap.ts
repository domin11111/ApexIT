import type { MetadataRoute } from 'next';
import { getProducts } from '@/lib/catalog';
import { absoluteUrl, localizedPath } from '@/lib/site';

/** Карта сайта: каждая страница в обеих локалях с hreflang-альтернативами. */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const { items } = await getProducts('ru');
  const pages: Array<{
    path: string;
    priority: number;
    changeFrequency: MetadataRoute.Sitemap[number]['changeFrequency'];
  }> = [
    { path: '/', priority: 1, changeFrequency: 'weekly' },
    ...items.map((p) => ({
      path: `/products/${p.slug}`,
      priority: 0.9,
      changeFrequency: 'weekly' as const,
    })),
    { path: '/compare', priority: 0.6, changeFrequency: 'monthly' },
    { path: '/configurator', priority: 0.7, changeFrequency: 'monthly' },
    { path: '/request', priority: 0.5, changeFrequency: 'yearly' },
  ];
  const lastModified = new Date();
  return pages.flatMap(({ path, priority, changeFrequency }) =>
    (['ru', 'en'] as const).map((locale) => ({
      url: absoluteUrl(localizedPath(locale, path)),
      lastModified,
      changeFrequency,
      priority: locale === 'ru' ? priority : priority * 0.9,
      alternates: {
        languages: {
          ru: absoluteUrl(localizedPath('ru', path)),
          en: absoluteUrl(localizedPath('en', path)),
        },
      },
    })),
  );
}
