import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';

export default function NotFound() {
  const t = useTranslations('notFound');
  return (
    <main id="content" className="grid min-h-[100svh] place-items-center px-[var(--layout-gutter)]">
      <div className="max-w-xl text-center">
        <p className="eyebrow mb-6">404</p>
        <h1 className="text-h1">{t('title')}</h1>
        <p className="mt-6 text-lead text-fg-secondary">{t('body')}</p>
        <Link href="/" className="glass mt-10 inline-flex h-12 items-center rounded-pill px-6 text-small font-medium hover:text-accent">
          {t('back')}
        </Link>
      </div>
    </main>
  );
}
