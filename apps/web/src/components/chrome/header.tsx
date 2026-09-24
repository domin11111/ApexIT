import { useLocale, useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { Magnetic } from '../ui/magnetic';
import { LocaleSwitch } from './locale-switch';
import { LogoMark } from './logo-mark';

export function Header() {
  const t = useTranslations('nav');
  const locale = useLocale();

  return (
    <header
      // Подложка с размытием, которая плавно растворяется книзу: текст под шапкой не спорит с навигацией
      className="fixed inset-x-0 top-0 z-[var(--z-header)] before:pointer-events-none before:absolute before:inset-x-0 before:top-0 before:-z-10 before:h-[calc(var(--layout-header-h)+1.5rem)] before:bg-gradient-to-b before:from-void/90 before:via-void/60 before:to-transparent before:backdrop-blur-md before:[mask-image:linear-gradient(to_bottom,black_55%,transparent)]"
    >
      <a
        href="#content"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:rounded-md focus:bg-elevated focus:px-4 focus:py-2"
      >
        {t('skip')}
      </a>
      <div className="mx-auto flex h-[var(--layout-header-h)] max-w-[var(--layout-max)] items-center justify-between px-[var(--layout-gutter)]">
        <Link href="/" aria-label={t('home')} className="flex items-center gap-3">
          <LogoMark className="size-8 text-fg" />
          <span className="font-display text-small font-semibold tracking-[0.02em]">APEX</span>
        </Link>

        <nav aria-label={t('primary')} className="hidden md:block">
          <ul className="flex items-center gap-8 text-small text-fg-secondary">
            <li>
              <Link href="/" className="transition-colors hover:text-fg">
                {t('collection')}
              </Link>
            </li>
            <li>
              <Link href="/compare" className="transition-colors hover:text-fg">
                {t('compare')}
              </Link>
            </li>
            <li>
              <Link href="/configurator" className="transition-colors hover:text-fg">
                {t('configurator')}
              </Link>
            </li>
          </ul>
        </nav>

        <div className="flex items-center gap-4">
          <LocaleSwitch current={locale} />
          <Magnetic>
            <Link
              href="/request"
              className="glass inline-flex h-10 items-center rounded-pill px-5 text-small font-medium transition-colors hover:text-accent"
            >
              {t('request')}
            </Link>
          </Magnetic>
        </div>
      </div>
    </header>
  );
}
