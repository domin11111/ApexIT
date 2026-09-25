import { getTranslations } from 'next-intl/server';
import { routing } from '@/i18n/routing';
import { OG_SIZE, ogImage } from '@/lib/og';

export const size = OG_SIZE;
export const contentType = 'image/png';
export const alt = 'APEX // Compute Collection';

type Locale = (typeof routing.locales)[number];

// Картинка на каждую локаль собирается при сборке, а не на каждый запрос
export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

/** OG-картинка сайта: флагман коллекции (EPYC 9996 «Venice») и девиз. */
export default async function SiteOgImage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = (await params) as { locale: Locale };
  const t = await getTranslations({ locale, namespace: 'meta' });
  return ogImage({
    eyebrow: '2026',
    title: 'The Compute Collection',
    subtitle: t('description'),
    accent: '#0a84ff',
    render: 'epyc-9996-venice',
  });
}
