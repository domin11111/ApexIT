import 'lenis/dist/lenis.css';
import '../globals.css';
import { color } from '@apex/ui/tokens';
import type { Metadata, Viewport } from 'next';
import { notFound } from 'next/navigation';
import { hasLocale, NextIntlClientProvider } from 'next-intl';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Cursor } from '@/components/chrome/cursor';
import { Grain } from '@/components/chrome/grain';
import { Header } from '@/components/chrome/header';
import { PageTransition } from '@/components/chrome/page-transition';
import { Preloader } from '@/components/chrome/preloader';
import { routing } from '@/i18n/routing';
import { inter, jetbrainsMono } from '@/lib/fonts';
import { SITE_NAME, SITE_URL, alternatesFor } from '@/lib/site';
import { AppProviders } from '@/providers/app-providers';

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

// Только известные локали: /robots.txt, /favicon.ico и прочее не должны попадать в [locale]
export const dynamicParams = false;

export async function generateMetadata({ params }: LayoutProps<'/[locale]'>): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale: hasLocale(routing.locales, locale) ? locale : routing.defaultLocale, namespace: 'meta' });
  const lang = locale === 'en' ? 'en' : 'ru';
  return {
    metadataBase: new URL(SITE_URL),
    title: { default: t('title'), template: `%s — ${t('title')}` },
    description: t('description'),
    applicationName: SITE_NAME,
    // Главная; страницы переопределяют canonical своими путями
    alternates: alternatesFor(lang, '/'),
    openGraph: {
      siteName: SITE_NAME,
      type: 'website',
      locale: lang === 'ru' ? 'ru_RU' : 'en_US',
      alternateLocale: lang === 'ru' ? ['en_US'] : ['ru_RU'],
      title: t('title'),
      description: t('description'),
    },
    twitter: { card: 'summary_large_image', title: t('title'), description: t('description') },
    formatDetection: { telephone: false },
  };
}

export const viewport: Viewport = {
  themeColor: color.bgVoid,
  colorScheme: 'dark',
};

export default async function LocaleLayout({ children, params }: LayoutProps<'/[locale]'>) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);

  return (
    <html lang={locale} className={`${inter.variable} ${jetbrainsMono.variable}`}>
      <body>
        {/* Без JS прелоадер не должен закрывать страницу */}
        <noscript>
          <style>{'.preloader{display:none!important}'}</style>
        </noscript>
        <NextIntlClientProvider>
          <AppProviders>
            <Preloader />
            <Header />
            {children}
            <PageTransition />
            <Cursor />
            <Grain />
          </AppProviders>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
