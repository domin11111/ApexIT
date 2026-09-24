'use client';

import type { ConfigurationPayload, SavedConfigurationDto } from '@apex/contracts';
import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useSearchParams } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { apiFetch } from '@/lib/api-client';

/**
 * Открывает сборку по ссылке /configurator?c=код. Вынесен в отдельный компонент под Suspense:
 * useSearchParams на статической странице иначе отключил бы серверный рендер всего конфигуратора.
 */
export function SharedBuildLoader({ onLoaded }: { onLoaded: (payload: ConfigurationPayload | null, code: string | null) => void }) {
  const t = useTranslations('configurator');
  const code = useSearchParams().get('c');
  // Код из адреса читаем один раз: дальше адрес меняет сам конфигуратор
  const [initial] = useState(code);
  const settled = useRef(false);

  const query = useQuery({
    queryKey: ['configuration', initial],
    queryFn: () => apiFetch<SavedConfigurationDto>(`/configurations/${encodeURIComponent(initial!)}`),
    enabled: initial !== null,
    retry: false,
    staleTime: Infinity,
  });

  useEffect(() => {
    if (settled.current) return;
    if (initial === null) {
      settled.current = true;
      onLoaded(null, null);
    } else if (query.isSuccess) {
      settled.current = true;
      onLoaded(query.data.payload, query.data.shareCode);
    } else if (query.isError) {
      settled.current = true;
      onLoaded(null, null);
    }
  }, [initial, query.isSuccess, query.isError, query.data, onLoaded]);

  if (query.isLoading) {
    return (
      <p role="status" className="glass px-5 py-3 text-small text-fg-secondary">
        {t('loading')}
      </p>
    );
  }
  if (query.isError) {
    return (
      <p role="status" className="glass px-5 py-3 text-small text-badge-coming">
        {t('notFound')}
      </p>
    );
  }
  return null;
}
