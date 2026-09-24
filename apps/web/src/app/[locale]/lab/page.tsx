import type { Metadata } from 'next';
import { setRequestLocale } from 'next-intl/server';
import { getProduct, getProducts } from '@/lib/catalog';
import { modelSource } from '@/lib/model-source';
import type { routing } from '@/i18n/routing';
import { ModelLab } from './model-lab';

export const metadata: Metadata = {
  title: 'Model lab',
  robots: { index: false, follow: false },
};

/** Служебная страница: просмотр моделей (GLB и процедурных), разлёта и подсветки. */
export default async function LabPage({ params }: PageProps<'/[locale]/lab'>) {
  const { locale } = (await params) as { locale: (typeof routing.locales)[number] };
  setRequestLocale(locale);
  const { items } = await getProducts(locale);
  const details = await Promise.all(items.map((p) => getProduct(p.slug, locale)));

  return (
    <main id="content" className="h-[100svh]">
      <ModelLab
        products={details.map((p) => ({
          slug: p.slug,
          label: `${p.brand} ${p.name}`,
          preset: p.modelPreset,
          accent: p.accentColor,
          identity: { brand: p.brand, name: p.name, codename: p.codename },
          source: modelSource(p.models),
        }))}
      />
    </main>
  );
}
