'use client';

import { LOCALES } from '@apex/contracts/locales';
import { useTranslations } from 'next-intl';
import { Link, usePathname } from '@/i18n/navigation';

export function LocaleSwitch({ current }: { current: string }) {
  const t = useTranslations('locale');
  const pathname = usePathname();

  return (
    <div role="group" aria-label={t('label')} className="flex items-center gap-1 font-mono text-caption uppercase">
      {LOCALES.map((locale) => (
        <Link
          key={locale}
          href={pathname}
          locale={locale}
          lang={locale}
          aria-label={t(locale)}
          aria-current={locale === current ? 'true' : undefined}
          className="rounded-sm px-1.5 py-1 text-fg-tertiary transition-colors hover:text-fg aria-[current=true]:text-fg"
        >
          {locale}
        </Link>
      ))}
    </div>
  );
}
