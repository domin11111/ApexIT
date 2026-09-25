'use client';

import type { AdminLead, LeadStatus } from '@apex/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import { adminFetch, errorText } from '@/admin/api';
import { LEAD_INTENT, LEAD_SOURCE, LEAD_STATUS } from '@/admin/leads';
import { Badge, Button, Card, Notice, PageHeader, Select, Textarea, formatDate } from '@/admin/ui';

/** Заявка: контакты, что просили, статус и переписка менеджеров. */
export default function LeadPage() {
  const { id } = useParams<{ id: string }>();
  const client = useQueryClient();
  const key = ['admin', 'lead', id];
  const lead = useQuery({ queryKey: key, queryFn: () => adminFetch<AdminLead>(`/leads/${id}`) });
  const [comment, setComment] = useState('');

  const onSaved = (data: AdminLead) => {
    client.setQueryData(key, data);
    void client.invalidateQueries({ queryKey: ['admin', 'leads'] });
  };
  const status = useMutation({ mutationFn: (value: LeadStatus) => adminFetch<AdminLead>(`/leads/${id}`, 'PATCH', { status: value }), onSuccess: onSaved });
  const addComment = useMutation({
    mutationFn: () => adminFetch<AdminLead>(`/leads/${id}/comments`, 'POST', { body: comment }),
    onSuccess: (data) => {
      setComment('');
      onSaved(data);
    },
  });

  if (lead.isError) return <Notice tone="error">{errorText(lead.error)}</Notice>;
  if (!lead.data) return <p className="text-small text-fg-tertiary">Загрузка…</p>;
  const l = lead.data;
  const site = process.env.NEXT_PUBLIC_SITE_URL ?? '';

  return (
    <>
      <PageHeader
        title={l.name}
        description={`${formatDate(l.createdAt)} · ${LEAD_SOURCE[l.source] ?? l.source} · язык: ${l.locale}`}
        actions={
          <Link href="/admin/leads" className="text-small text-fg-secondary hover:text-fg">
            ← Все заявки
          </Link>
        }
      />
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="flex flex-col gap-6">
          <Card title="Запрос">
            <dl className="grid gap-x-6 gap-y-3 text-small sm:grid-cols-[10rem_minmax(0,1fr)]">
              <dt className="text-fg-tertiary">Что нужно</dt>
              <dd>{LEAD_INTENT[l.intent]}</dd>
              <dt className="text-fg-tertiary">Компания</dt>
              <dd>{l.company ?? '—'}</dd>
              <dt className="text-fg-tertiary">Почта</dt>
              <dd>
                <a href={`mailto:${l.email}`} className="hover:text-accent">
                  {l.email}
                </a>
              </dd>
              <dt className="text-fg-tertiary">Телефон</dt>
              <dd>{l.phone ? <a href={`tel:${l.phone}`}>{l.phone}</a> : '—'}</dd>
              <dt className="text-fg-tertiary">Продукт</dt>
              <dd>
                {l.productSlug ? (
                  <a href={`${site}/products/${l.productSlug}`} target="_blank" rel="noreferrer" className="font-mono hover:text-accent">
                    {l.productSlug} ↗
                  </a>
                ) : (
                  '—'
                )}
              </dd>
              <dt className="text-fg-tertiary">Сборка</dt>
              <dd>
                {l.configurationShareCode ? (
                  <a href={`${site}/configurator?c=${l.configurationShareCode}`} target="_blank" rel="noreferrer" className="font-mono hover:text-accent">
                    {l.configurationShareCode} ↗
                  </a>
                ) : (
                  '—'
                )}
              </dd>
            </dl>
            {l.message && <p className="mt-5 whitespace-pre-wrap rounded-lg bg-white/[0.03] p-4 text-small">{l.message}</p>}
          </Card>

          <Card title="Комментарии менеджеров">
            {l.comments.length === 0 && <p className="mb-4 text-small text-fg-tertiary">Пока пусто.</p>}
            <ul className="mb-4 flex flex-col gap-3">
              {l.comments.map((c) => (
                <li key={c.id} className="rounded-lg border border-line p-3 text-small">
                  <p className="whitespace-pre-wrap">{c.body}</p>
                  <p className="mt-2 text-caption text-fg-tertiary">
                    {c.author ?? 'удалённый пользователь'} · {formatDate(c.createdAt)}
                  </p>
                </li>
              ))}
            </ul>
            <form
              onSubmit={(event) => {
                event.preventDefault();
                addComment.mutate();
              }}
              className="flex flex-col gap-2"
            >
              <Textarea placeholder="Что сделано, о чём договорились" value={comment} onChange={(event) => setComment(event.target.value)} aria-label="Комментарий" />
              <Button type="submit" variant="primary" className="self-start" disabled={!comment.trim() || addComment.isPending}>
                Добавить
              </Button>
              {addComment.isError && <Notice tone="error">{errorText(addComment.error)}</Notice>}
            </form>
          </Card>
        </div>

        <Card title="Статус" className="self-start">
          <Badge tone={LEAD_STATUS[l.status].tone}>{LEAD_STATUS[l.status].label}</Badge>
          <Select className="mt-4" value={l.status} onChange={(event) => status.mutate(event.target.value as LeadStatus)} aria-label="Сменить статус" disabled={status.isPending}>
            {(Object.keys(LEAD_STATUS) as LeadStatus[]).map((value) => (
              <option key={value} value={value}>
                {LEAD_STATUS[value].label}
              </option>
            ))}
          </Select>
          {status.isError && <div className="mt-3"><Notice tone="error">{errorText(status.error)}</Notice></div>}
        </Card>
      </div>
    </>
  );
}
