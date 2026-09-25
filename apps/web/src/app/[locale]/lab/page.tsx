import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
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
  const t = await getTranslations('lab');
  // Детали из tools/blender вне каталога: плата и сокет сцены сборки, облегчённый модуль-статист
  const parts = [
    { slug: 'board-sp7', label: t('board'), url: '/models/board-sp7.glb', mobileUrl: '/models/board-sp7-mobile.glb' },
    { slug: 'socket-sp7', label: t('socket'), url: '/models/socket-sp7.glb', mobileUrl: '/models/socket-sp7-mobile.glb' },
    { slug: 'rdimm-lod', label: t('filler'), url: '/models/rdimm-micron-512gb-lod.glb' },
  ];

  return (
    <main id="content" className="h-[100svh]">
      <ModelLab
        products={[
          ...details.map((p) => ({
            slug: p.slug,
            label: `${p.brand} ${p.name}`,
            preset: p.modelPreset,
            accent: p.accentColor,
            identity: { brand: p.brand, name: p.name, codename: p.codename },
            source: modelSource(p.models),
          })),
          ...parts.map(({ slug, label, url, mobileUrl }) => ({
            slug,
            label,
            preset: slug === 'rdimm-lod' ? ('RDIMM' as const) : ('MOTHERBOARD' as const),
            accent: '#0a84ff',
            identity: { brand: 'APEX', name: label },
            source: { url, mobileUrl },
          })),
        ]}
      />
    </main>
  );
}
