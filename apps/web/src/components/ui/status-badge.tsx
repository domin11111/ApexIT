import { STATUS_META, statusBadge, type ProductStatusCode } from '@apex/contracts/status';

const TONE = {
  available: 'text-badge-available',
  coming: 'text-badge-coming',
  preview: 'text-badge-preview',
} as const;

/** Бейдж статуса: одно перечисление ProductStatus на фронте и в API (STATUS_META). */
export function StatusBadge({
  status,
  window,
  locale,
}: {
  status: ProductStatusCode;
  window: string | null;
  locale: 'ru' | 'en';
}) {
  const tone = TONE[STATUS_META[status].tone];
  return (
    <span
      className={`inline-flex items-center gap-2 whitespace-nowrap rounded-pill border border-current/30 px-3 py-1 font-mono text-caption uppercase tracking-caption ${tone}`}
    >
      <span className="size-1.5 rounded-full bg-current shadow-[0_0_10px_currentColor]" aria-hidden />
      {statusBadge(status, locale, window)}
    </span>
  );
}
