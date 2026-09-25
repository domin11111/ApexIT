'use client';

import type { AuditPage } from '@apex/contracts';
import { useInfiniteQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { adminFetch, errorText } from '@/admin/api';
import { Button, Notice, PageHeader, Select, formatDate } from '@/admin/ui';

const ENTITIES = ['', 'Product', 'Platform', 'Motherboard', 'Lead', 'Asset', 'AdminUser'];

/** Журнал аудита (только администратор): кто, что и когда изменил — с разницей «до/после». */
export default function AuditLogPage() {
  const [entity, setEntity] = useState('');
  const log = useInfiniteQuery({
    queryKey: ['admin', 'audit', entity],
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) => adminFetch<AuditPage>(`/audit?limit=50${entity ? `&entity=${entity}` : ''}${pageParam ? `&cursor=${pageParam}` : ''}`),
    getNextPageParam: (last) => last.nextCursor,
  });
  const items = log.data?.pages.flatMap((page) => page.items) ?? [];

  return (
    <>
      <PageHeader
        title="Журнал"
        description="Все изменения каталога, заявок, моделей и пользователей. Секреты (пароли, TOTP) в журнал не попадают."
        actions={
          <Select value={entity} onChange={(e) => setEntity(e.target.value)} aria-label="Сущность" className="w-48">
            {ENTITIES.map((value) => (
              <option key={value} value={value}>
                {value || 'Все сущности'}
              </option>
            ))}
          </Select>
        }
      />
      {log.isError && <Notice tone="error">{errorText(log.error)}</Notice>}
      <ol className="divide-y divide-line rounded-xl border border-line">
        {items.map((entry) => (
          <li key={entry.id} className="p-4 text-small">
            <div className="flex flex-wrap items-baseline justify-between gap-3">
              <span>
                <span className="font-mono text-accent">{entry.action}</span>
                <span className="ml-3 text-fg-secondary">
                  {entry.entity} · <span className="font-mono text-caption">{entry.entityId}</span>
                </span>
              </span>
              <span className="text-caption text-fg-tertiary">
                {entry.user ?? 'система'} · {formatDate(entry.createdAt)}
                {entry.ip ? ` · ${entry.ip}` : ''}
              </span>
            </div>
            {entry.diff !== null && typeof entry.diff === 'object' && Object.keys(entry.diff).length > 0 && (
              <details className="mt-2">
                <summary className="cursor-pointer text-caption text-fg-tertiary">Изменения: {Object.keys(entry.diff).join(', ')}</summary>
                <pre className="mt-2 max-h-80 overflow-auto rounded-lg bg-white/[0.03] p-3 font-mono text-caption text-fg-secondary">{JSON.stringify(entry.diff, null, 2)}</pre>
              </details>
            )}
          </li>
        ))}
      </ol>
      {log.hasNextPage && (
        <Button className="mt-4" onClick={() => void log.fetchNextPage()} disabled={log.isFetchingNextPage}>
          Показать ещё
        </Button>
      )}
    </>
  );
}
