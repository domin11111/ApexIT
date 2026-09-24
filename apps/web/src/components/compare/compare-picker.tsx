import type { ProductCategory, ProductSummaryDto } from '@apex/contracts';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { chipState } from '@/lib/compare-selection';

const CATEGORIES: ProductCategory[] = ['CPU', 'MEMORY', 'GPU'];

/**
 * Выбор продуктов: обычные ссылки на /compare?slugs=… — работают без JS, ссылкой можно поделиться.
 * Недоступный вариант подписан причиной (единственный в категории, уже выбрано три).
 */
export function ComparePicker({ items, selection }: { items: ProductSummaryDto[]; selection: string[] }) {
  const t = useTranslations('compare.picker');

  return (
    <nav aria-label={t('label')} className="flex flex-col gap-4">
      <p className="font-mono text-caption uppercase tracking-caption text-fg-tertiary">
        {t('selected', { count: selection.length })}
      </p>
      <div className="flex flex-wrap gap-x-8 gap-y-4">
        {CATEGORIES.map((category) => {
          const products = items.filter((p) => p.category === category);
          if (products.length === 0) return null;
          return (
            <div key={category}>
              <p className="eyebrow mb-2">{t(`categories.${category}`)}</p>
              <ul className="flex flex-wrap gap-2">
                {products.map((product) => {
                  const state = chipState(items, selection, product);
                  const label = `${product.brand} ${product.name}`;
                  const chip = 'inline-flex h-10 items-center gap-2 rounded-pill border px-4 text-small transition-colors';
                  if (state.kind === 'only' || state.kind === 'full') {
                    return (
                      <li key={product.slug}>
                        <span
                          aria-disabled
                          title={t(state.kind)}
                          className={`${chip} cursor-not-allowed border-line text-fg-tertiary`}
                        >
                          {label}
                        </span>
                      </li>
                    );
                  }
                  const selected = state.kind === 'selected';
                  return (
                    <li key={product.slug}>
                      <Link
                        href={{ pathname: '/compare', query: state.slugs.length > 0 ? { slugs: state.slugs.join(',') } : {} }}
                        scroll={false}
                        aria-current={selected ? 'true' : undefined}
                        className={`${chip} ${
                          selected ? 'border-fg bg-fg text-void' : 'border-line text-fg-secondary hover:border-fg/40 hover:text-fg'
                        }`}
                      >
                        <span className="size-1.5 rounded-full" style={{ background: product.accentColor }} aria-hidden />
                        {label}
                        {selected && <span aria-hidden>×</span>}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
      </div>
    </nav>
  );
}
