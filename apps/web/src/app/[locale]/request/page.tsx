import type { ProductStatus } from '@apex/contracts';
import { isOrderable } from '@apex/contracts/status';
import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { RequestForm, type RequestProduct } from '@/components/request/request-form';
import { RevealText } from '@/components/story/reveal-text';
import type { routing } from '@/i18n/routing';
import { alternatesFor } from '@/lib/site';
import { getProducts } from '@/lib/catalog';

type Locale = (typeof routing.locales)[number];

export async function generateMetadata({ params, searchParams }: PageProps<'/[locale]/request'>): Promise<Metadata> {
  const { locale } = (await params) as { locale: Locale };
  const personalized = Object.keys(await searchParams).length > 0;
  const t = await getTranslations({ locale, namespace: 'request' });
  return {
    title: t('metaTitle'),
    description: t('metaDescription'),
    alternates: alternatesFor(locale, '/request'),
    // Форма с продуктом или сборкой из ссылки — не для выдачи; чистый /request индексируется
    robots: { index: !personalized, follow: true },
  };
}

const single = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value) ?? null;

/** Запрос КП или информации (F7): продукт и сборка приходят в ссылке ?product=…&configuration=…&intent=… */
export default async function RequestPage({ params, searchParams }: PageProps<'/[locale]/request'>) {
  const { locale } = (await params) as { locale: Locale };
  setRequestLocale(locale);
  const t = await getTranslations('request');
  const query = await searchParams;

  const { items } = await getProducts(locale);
  const statuses: Record<string, ProductStatus> = Object.fromEntries(items.map((p) => [p.slug, p.status]));
  const found = items.find((p) => p.slug === single(query.product));
  const product: RequestProduct | null = found
    ? { slug: found.slug, title: `${found.brand} ${found.name}`, status: found.status, accentColor: found.accentColor }
    : null;
  const code = single(query.configuration);
  const configurationCode = code && /^[a-hjkmnp-z2-9]{10}$/.test(code) ? code : null;
  const requested = single(query.intent) === 'INFO' ? 'INFO' : 'QUOTE';
  const initialIntent = product && !isOrderable(product.status) ? 'INFO' : requested;

  return (
    <main
      id="content"
      className="mx-auto grid max-w-[var(--layout-max)] gap-12 px-[var(--layout-gutter)] pb-24 pt-[calc(var(--layout-header-h)+2rem)] lg:grid-cols-[minmax(0,1fr)_minmax(0,36rem)]"
    >
      <header className="lg:sticky lg:top-[calc(var(--layout-header-h)+2rem)] lg:self-start">
        <p className="eyebrow mb-4">{t('eyebrow')}</p>
        <RevealText as="h1" className="text-h1">
          {t('title')}
        </RevealText>
        <p className="mt-5 max-w-md text-body text-fg-secondary">{t('lead')}</p>
      </header>
      <RequestForm locale={locale} product={product} configurationCode={configurationCode} initialIntent={initialIntent} statuses={statuses} />
    </main>
  );
}
