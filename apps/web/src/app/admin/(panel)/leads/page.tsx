'use client';

import type { AdminLeadPage, LeadStatus } from '@apex/contracts';
import { useInfiniteQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useDeferredValue, useState } from 'react';
import { adminFetch, adminUrl } from '@/admin/api';
import { LEAD_INTENT, LEAD_SOURCE, LEAD_STATUS } from '@/admin/leads';
import { Badge, Button, Input, PageHeader, formatDate } from '@/admin/ui';

export default function LeadsPage() {
  return (
    <Suspense>
      <Leads />
    </Suspense>
  );
}

/** Заявки: вкладки по статусу со счётчиками, поиск, «показать ещё», экспорт CSV. */
function Leads() {
  const params = useSearchParams();
  const router = useRouter();
  const status = (params.get('status') as LeadStatus | null) ?? undefined;
  const [search, setSearch] = useState('');
  const q = useDeferredValue(search.trim());

  const query = new URLSearchParams({ limit: '30', ...(status ? { status } : {}), ...(q ? { q } : {}) });
  const leads = useInfiniteQuery({
    queryKey: ['admin', 'leads', status ?? 'all', q],
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) => adminFetch<AdminLeadPage>(`/leads?${query.toString()}${pageParam ? `&cursor=${pageParam}` : ''}`),
    getNextPageParam: (last) => last.nextCursor,
  });
  const counts = leads.data?.pages[0]?.counts;
  const items = leads.data?.pages.flatMap((page) => page.items) ?? [];
  const exportQuery = new URLSearchParams({ ...(status ? { status } : {}), ...(q ? { q } : {}) });

  const tab = (value: LeadStatus | undefined, label: string, count?: number) => (
    <button
      key={value ?? 'all'}
      type="button"
      aria-pressed={status === value}
      onClick={() => router.replace(value ? `/admin/leads?status=${value}` : '/admin/leads')}
      className="rounded-lg px-3 py-1.5 text-small text-fg-secondary hover:text-fg aria-pressed:bg-white/10 aria-pressed:text-fg"
    >
      {label}
      {count !== undefined && <span className="ml-2 font-mono text-caption text-fg-tertiary">{count}</span>}
    </button>
  );

  return (
    <>
      <PageHeader
        title="Заявки"
        actions={
          <a href={adminUrl(`/leads/export.csv?${exportQuery.toString()}`)} className="inline-flex h-9 items-center rounded-lg border border-line px-4 text-small hover:border-fg/40">
            Экспорт CSV
          </a>
        }
      />
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-1">
          {tab(undefined, 'Все', counts ? counts.NEW + counts.IN_PROGRESS + counts.CLOSED : undefined)}
          {(Object.keys(LEAD_STATUS) as LeadStatus[]).map((value) => tab(value, LEAD_STATUS[value].label, counts?.[value]))}
        </div>
        <Input type="search" placeholder="Имя, компания или почта" value={search} onChange={(event) => setSearch(event.target.value)} className="max-w-xs" aria-label="Поиск" />
      </div>

      <div className="overflow-x-auto rounded-xl border border-line">
        <table className="w-full min-w-[48rem] text-left text-small">
          <thead className="text-caption text-fg-tertiary">
            <tr className="border-b border-line">
              <th className="px-4 py-3 font-normal">Дата</th>
              <th className="px-4 py-3 font-normal">Контакт</th>
              <th className="px-4 py-3 font-normal">Запрос</th>
              <th className="px-4 py-3 font-normal">Источник</th>
              <th className="px-4 py-3 font-normal">Статус</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {items.map((lead) => (
              <tr key={lead.id} className="cursor-pointer hover:bg-white/[0.03]" onClick={() => router.push(`/admin/leads/${lead.id}`)}>
                <td className="whitespace-nowrap px-4 py-3 font-mono text-caption text-fg-tertiary">{formatDate(lead.createdAt)}</td>
                <td className="px-4 py-3">
                  <Link href={`/admin/leads/${lead.id}`} className="font-medium hover:text-accent" onClick={(event) => event.stopPropagation()}>
                    {lead.name}
                  </Link>
                  <span className="block text-caption text-fg-tertiary">
                    {lead.company ? `${lead.company} · ` : ''}
                    {lead.email}
                  </span>
                </td>
                <td className="px-4 py-3">
                  {LEAD_INTENT[lead.intent]}
                  <span className="block font-mono text-caption text-fg-tertiary">{lead.productSlug ?? lead.configurationShareCode ?? '—'}</span>
                </td>
                <td className="px-4 py-3 text-fg-secondary">{LEAD_SOURCE[lead.source] ?? lead.source}</td>
                <td className="px-4 py-3">
                  <Badge tone={LEAD_STATUS[lead.status].tone}>{LEAD_STATUS[lead.status].label}</Badge>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {leads.isSuccess && items.length === 0 && <p className="p-6 text-small text-fg-tertiary">Ничего не найдено.</p>}
      </div>
      {leads.hasNextPage && (
        <Button className="mt-4" onClick={() => void leads.fetchNextPage()} disabled={leads.isFetchingNextPage}>
          Показать ещё
        </Button>
      )}
    </>
  );
}
