'use client';

import type { AdminRole, AdminUserDto } from '@apex/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { adminFetch, errorText } from '@/admin/api';
import { useMe } from '@/admin/session';
import { Badge, Button, Card, Field, Input, Notice, PageHeader, Select, formatDate } from '@/admin/ui';

const ROLES: Array<[AdminRole, string]> = [
  ['EDITOR', 'Редактор — контент и заявки'],
  ['ADMIN', 'Администратор — всё, включая журнал и пользователей'],
];

/** Пользователи админки (только администратор). Пароль задаёт администратор, второй фактор — сам пользователь. */
export default function UsersPage() {
  const client = useQueryClient();
  const me = useMe();
  const users = useQuery({ queryKey: ['admin', 'users'], queryFn: () => adminFetch<{ items: AdminUserDto[] }>('/users') });
  const [draft, setDraft] = useState({ email: '', role: 'EDITOR' as AdminRole, password: '' });
  const refresh = () => void client.invalidateQueries({ queryKey: ['admin', 'users'] });

  const create = useMutation({
    mutationFn: () => adminFetch('/users', 'POST', draft),
    onSuccess: () => {
      setDraft({ email: '', role: 'EDITOR', password: '' });
      refresh();
    },
  });
  const update = useMutation({
    mutationFn: ({ id, ...body }: { id: string; role?: AdminRole; isActive?: boolean }) => adminFetch(`/users/${id}`, 'PATCH', body),
    onSuccess: refresh,
  });

  return (
    <>
      <PageHeader title="Пользователи" description="Отключённый пользователь сразу выходит из всех сессий." />
      <Card title="Новый пользователь" className="mb-6">
        <form
          className="grid gap-3 sm:grid-cols-[1fr_1fr_1fr_auto] sm:items-end"
          onSubmit={(event) => {
            event.preventDefault();
            create.mutate();
          }}
        >
          <Field label="Почта">{(id) => <Input id={id} type="email" autoComplete="off" value={draft.email} onChange={(e) => setDraft({ ...draft, email: e.target.value })} />}</Field>
          <Field label="Роль">
            {(id) => (
              <Select id={id} value={draft.role} onChange={(e) => setDraft({ ...draft, role: e.target.value as AdminRole })}>
                {ROLES.map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label="Временный пароль (от 12 символов)">
            {(id) => <Input id={id} type="password" autoComplete="new-password" value={draft.password} onChange={(e) => setDraft({ ...draft, password: e.target.value })} />}
          </Field>
          <Button type="submit" variant="primary" disabled={create.isPending || !draft.email || draft.password.length < 12}>
            Добавить
          </Button>
        </form>
        {create.isError && <div className="mt-3"><Notice tone="error">{errorText(create.error)}</Notice></div>}
      </Card>

      <div className="overflow-x-auto rounded-xl border border-line">
        <table className="w-full min-w-[40rem] text-left text-small">
          <thead className="text-caption text-fg-tertiary">
            <tr className="border-b border-line">
              <th className="px-4 py-3 font-normal">Почта</th>
              <th className="px-4 py-3 font-normal">Роль</th>
              <th className="px-4 py-3 font-normal">2FA</th>
              <th className="px-4 py-3 font-normal">Последний вход</th>
              <th className="px-4 py-3 font-normal">Доступ</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {users.data?.items.map((user) => {
              const self = user.id === me.data?.id;
              return (
                <tr key={user.id} className={user.isActive ? '' : 'opacity-50'}>
                  <td className="px-4 py-3">
                    {user.email}
                    {self && <span className="ml-2 text-caption text-fg-tertiary">это вы</span>}
                  </td>
                  <td className="px-4 py-3">
                    <Select value={user.role} disabled={self || update.isPending} onChange={(e) => update.mutate({ id: user.id, role: e.target.value as AdminRole })} aria-label="Роль">
                      <option value="EDITOR">Редактор</option>
                      <option value="ADMIN">Администратор</option>
                    </Select>
                  </td>
                  <td className="px-4 py-3">{user.totpEnabled ? <Badge tone="green">включена</Badge> : <Badge tone="amber">нет</Badge>}</td>
                  <td className="px-4 py-3 text-fg-secondary">{user.lastLoginAt ? formatDate(user.lastLoginAt) : '—'}</td>
                  <td className="px-4 py-3">
                    <Button variant={user.isActive ? 'danger' : 'secondary'} disabled={self || update.isPending} onClick={() => update.mutate({ id: user.id, isActive: !user.isActive })}>
                      {user.isActive ? 'Отключить' : 'Включить'}
                    </Button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {update.isError && <div className="mt-3"><Notice tone="error">{errorText(update.error)}</Notice></div>}
    </>
  );
}
