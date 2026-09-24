import type { CompatibilityDto, MotherboardDto, ProductSummaryDto } from '@apex/contracts';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { boardFit, type Fit, type FitSubject } from '@/lib/compatibility';
import { RevealText } from '../story/reveal-text';

export type PlatformBoards = { compatibility: CompatibilityDto; boards: MotherboardDto[] };
export type RelatedProduct = {
  product: ProductSummaryDto;
  platforms: Array<{ socket: string; level: CompatibilityDto['level'] }>;
};

const FIT_TONE: Record<Fit['kind'], string> = {
  ok: 'text-badge-available',
  tdp: 'text-[#ff6b61]',
  capacity: 'text-[#ff6b61]',
  pending: 'text-badge-coming',
  unknown: 'text-fg-tertiary',
};

/** Совместимость: платформы, материнские платы с оценкой «подходит / нет» и совместимые компоненты. */
export function CompatibilitySection({
  platforms,
  related,
  subject,
}: {
  platforms: PlatformBoards[];
  related: RelatedProduct[];
  subject: FitSubject;
}) {
  const t = useTranslations('product.compatibility');

  const fitText = (fit: Fit) => {
    switch (fit.kind) {
      case 'ok':
        return t('fit.ok');
      case 'tdp':
        return t('fit.tdp', { max: fit.max });
      case 'capacity':
        return t('fit.capacity', { max: fit.max });
      case 'pending':
        return t('fit.pending');
      case 'unknown':
        return t('fit.unknown');
    }
  };

  return (
    <section
      aria-labelledby="compatibility-title"
      className="mx-auto max-w-[var(--layout-max)] px-[var(--layout-gutter)] py-[var(--layout-section-y)]"
    >
      <RevealText id="compatibility-title" className="text-h1">
        {t('title')}
      </RevealText>

      {platforms.map(({ compatibility, boards }) => (
        <div key={compatibility.socket} className="mt-12">
          <div className="flex flex-wrap items-baseline gap-4">
            <h3 className="text-h3">{compatibility.platformName}</h3>
            <span
              className={`font-mono text-caption uppercase tracking-caption ${compatibility.level === 'SUPPORTED' ? 'text-badge-available' : 'text-badge-coming'}`}
            >
              {t(`levels.${compatibility.level}`)}
            </span>
          </div>
          {compatibility.notes && (
            <p className="mt-2 max-w-2xl text-small text-fg-secondary">{compatibility.notes}</p>
          )}

          <div className="mt-6">
            {boards.length === 0 ? (
              <p className="text-small text-fg-tertiary">{t('none')}</p>
            ) : (
              <>
                {/* Телефон: карточки — вердикт «подходит / нет» виден сразу, без горизонтальной прокрутки */}
                <ul className="divide-y divide-line md:hidden">
                  {boards.map((board) => {
                    const fit = boardFit(board, subject);
                    return (
                      <li key={board.id} className="py-4">
                        <p className="font-medium">
                          {board.vendor} {board.model}
                        </p>
                        <p className={`mt-1 text-small ${FIT_TONE[fit.kind]}`}>{fitText(fit)}</p>
                        <p className="mt-2 font-mono text-caption text-fg-tertiary">
                          {board.formFactor} · {board.sockets}P · {board.dimmSlots} DIMM
                          {board.maxCpuTdpW ? ` · ${board.maxCpuTdpW} W` : ''}
                        </p>
                      </li>
                    );
                  })}
                </ul>
                <table className="hidden w-full table-fixed text-left text-small md:table">
                  <caption className="sr-only">
                    {t('boards')} — {compatibility.platformName}
                  </caption>
                  {/* Одинаковые колонки у всех платформ — таблицы читаются как одна */}
                  <colgroup>
                    <col className="w-[30%]" />
                    <col className="w-[22%]" />
                    <col className="w-[9%]" />
                    <col className="w-[10%]" />
                    <col className="w-[10%]" />
                    <col className="w-[19%]" />
                  </colgroup>
                  <thead className="text-caption text-fg-tertiary">
                    <tr className="border-b border-line">
                      <th scope="col" className="py-3 pr-4 font-normal">
                        {t('columns.board')}
                      </th>
                      <th scope="col" className="py-3 pr-4 font-normal">
                        {t('columns.formFactor')}
                      </th>
                      <th scope="col" className="py-3 pr-4 font-normal">
                        {t('columns.sockets')}
                      </th>
                      <th scope="col" className="py-3 pr-4 font-normal">
                        {t('columns.dimms')}
                      </th>
                      <th scope="col" className="py-3 pr-4 font-normal">
                        {t('columns.tdp')}
                      </th>
                      <th scope="col" className="py-3 font-normal">
                        {t('columns.fit')}
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {boards.map((board) => {
                      const fit = boardFit(board, subject);
                      return (
                        <tr key={board.id}>
                          <th scope="row" className="py-3 pr-4 font-medium">
                            {board.sourceUrl ? (
                              <a
                                href={board.sourceUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="hover:text-accent"
                              >
                                {board.vendor} {board.model}
                              </a>
                            ) : (
                              `${board.vendor} ${board.model}`
                            )}
                          </th>
                          <td className="py-3 pr-4 text-fg-secondary">{board.formFactor}</td>
                          <td className="py-3 pr-4 font-mono">{board.sockets}P</td>
                          <td className="py-3 pr-4 font-mono">{board.dimmSlots}</td>
                          <td className="py-3 pr-4 font-mono">
                            {board.maxCpuTdpW ? `${board.maxCpuTdpW} W` : '—'}
                          </td>
                          <td className={`py-3 ${FIT_TONE[fit.kind]}`}>{fitText(fit)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </>
            )}
          </div>
        </div>
      ))}

      {related.length > 0 && (
        <div className="mt-16">
          <h3 className="eyebrow mb-5">{t('components')}</h3>
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {related.map(({ product, platforms: shared }) => (
              <li
                key={product.slug}
                className="glass relative flex items-center justify-between gap-4 p-5"
              >
                <div>
                  <p className="font-medium">
                    {product.brand} {product.name}
                  </p>
                  {shared.map(({ socket, level }) => (
                    <p key={socket} className="mt-1 font-mono text-caption text-fg-tertiary">
                      {socket} · {t(`levels.${level}`)}
                    </p>
                  ))}
                </div>
                <Link
                  href={`/products/${product.slug}`}
                  data-transition-label={`${product.brand} ${product.name}`}
                  className="text-small after:absolute after:inset-0 hover:text-accent"
                  aria-label={`${product.brand} ${product.name}`}
                >
                  <span aria-hidden>→</span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
