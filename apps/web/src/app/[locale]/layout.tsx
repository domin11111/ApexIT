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
import { AppProviders } from '@/providers/app-providers';

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export async function generateMetadata({ params }: LayoutProps<'/[locale]'>): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale: hasLocale(routing.locales, locale) ? locale : routing.defaultLocale, namespace: 'meta' });
  return {
    metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'),
    title: { default: t('title'), template: `%s — ${t('title')}` },
    description: t('description'),
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
