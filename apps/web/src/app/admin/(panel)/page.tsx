'use client';

import type { AdminLeadPage } from '@apex/contracts';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { adminFetch } from '@/admin/api';
import { LEAD_INTENT, LEAD_STATUS } from '@/admin/leads';
import { useMe } from '@/admin/session';
import { Badge, Card, Notice, PageHeader, formatDate } from '@/admin/ui';

/** Обзор: воронка заявок и последние обращения. */
export default function AdminHome() {
  const me = useMe();
  const leads = useQuery({ queryKey: ['admin', 'leads', 'recent'], queryFn: () => adminFetch<AdminLeadPage>('/leads?limit=6') });

  return (
    <>
      <PageHeader title="Обзор" description="Заявки с сайта: новые, в работе и закрытые." />
      {me.data && !me.data.totpEnabled && (
        <div className="mb-6">
          <Notice>
            Второй фактор не включён. <Link href="/admin/security" className="underline">Включите TOTP</Link> — это защитит админку при утечке пароля.
          </Notice>
        </div>
      )}
      <div className="grid gap-4 sm:grid-cols-3">
        {(Object.keys(LEAD_STATUS) as Array<keyof typeof LEAD_STATUS>).map((status) => (
          <Link key={status} href={`/admin/leads?status=${status}`} className="rounded-xl border border-line p-5 transition-colors hover:border-fg/30">
            <p className="text-caption text-fg-tertiary">{LEAD_STATUS[status].label}</p>
            <p className="mt-2 font-mono text-h2">{leads.data?.counts[status] ?? '—'}</p>
          </Link>
        ))}
      </div>
      <Card title="Последние заявки" className="mt-6" actions={<Link href="/admin/leads" className="text-small text-fg-secondary hover:text-fg">Все →</Link>}>
        {leads.data?.items.length === 0 && <p className="text-small text-fg-tertiary">Заявок пока нет.</p>}
        <ul className="divide-y divide-line">
          {leads.data?.items.map((lead) => (
            <li key={lead.id}>
              <Link href={`/admin/leads/${lead.id}`} className="flex flex-wrap items-center justify-between gap-3 py-3 hover:text-accent">
                <span>
                  <span className="font-medium">{lead.name}</span>
                  {lead.company && <span className="text-fg-secondary"> · {lead.company}</span>}
                  <span className="ml-2 text-caption text-fg-tertiary">{LEAD_INTENT[lead.intent]}</span>
                </span>
                <span className="flex items-center gap-3">
                  <span className="text-caption text-fg-tertiary">{formatDate(lead.createdAt)}</span>
                  <Badge tone={LEAD_STATUS[lead.status].tone}>{LEAD_STATUS[lead.status].label}</Badge>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </Card>
    </>
  );
}
