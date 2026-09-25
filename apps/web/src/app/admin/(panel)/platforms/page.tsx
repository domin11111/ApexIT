'use client';

import type { AdminMotherboard, AdminPlatform, Localized, ProductStatus } from '@apex/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { adminFetch, errorText } from '@/admin/api';
import { useMe } from '@/admin/session';
import { Badge, Button, Card, Field, Input, LocalizedField, Notice, PageHeader, Select } from '@/admin/ui';

const STATUSES: Array<[ProductStatus, string]> = [
  ['AVAILABLE', 'Доступна'],
  ['COMING_SOON', 'Ожидается'],
  ['PREVIEW', 'Превью'],
];
const EMPTY: Localized = { ru: '', en: '' };
const numOrNull = (value: string) => (value.trim() === '' ? null : Number(value));

/** Платформы (лимиты для движка конфигуратора) и материнские платы. */
export default function PlatformsPage() {
  const platforms = useQuery({ queryKey: ['admin', 'platforms'], queryFn: () => adminFetch<{ items: AdminPlatform[] }>('/platforms') });
  const boards = useQuery({ queryKey: ['admin', 'boards'], queryFn: () => adminFetch<{ items: AdminMotherboard[] }>('/motherboards') });
  const [editing, setEditing] = useState<AdminMotherboard | 'new' | null>(null);

  return (
    <>
      <PageHeader
        title="Платформы и платы"
        description="Лимиты платформ и плат — вход движка совместимости: TDP, слоты памяти и PCIe. Изменения сразу видны в конфигураторе и на страницах продуктов."
      />
      <div className="grid gap-4 lg:grid-cols-2">
        {platforms.data?.items.map((p) => <PlatformCard key={`${p.id}-${JSON.stringify(p)}`} platform={p} />)}
      </div>

      <Card
        title="Материнские платы"
        className="mt-8"
        actions={
          <Button variant="primary" onClick={() => setEditing('new')}>
            + Плата
          </Button>
        }
      >
        {editing && (
          <div className="mb-6">
            <BoardForm board={editing === 'new' ? null : editing} sockets={platforms.data?.items.map((p) => p.socket) ?? []} onClose={() => setEditing(null)} />
          </div>
        )}
        <div className="overflow-x-auto">
          <table className="w-full min-w-[46rem] text-left text-small">
            <thead className="text-caption text-fg-tertiary">
              <tr className="border-b border-line">
                <th className="py-2 pr-4 font-normal">Плата</th>
                <th className="py-2 pr-4 font-normal">Сокет</th>
                <th className="py-2 pr-4 font-normal">Сокетов</th>
                <th className="py-2 pr-4 font-normal">DIMM</th>
                <th className="py-2 pr-4 font-normal">TDP</th>
                <th className="py-2 pr-4 font-normal">x16 / MCIO</th>
                <th className="py-2 font-normal" />
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {boards.data?.items.map((b) => (
                <tr key={b.id}>
                  <td className="py-2 pr-4">
                    {b.vendor} {b.model}
                    {b.isPlaceholder && (
                      <span className="ml-2">
                        <Badge tone="blue">место под плату</Badge>
                      </span>
                    )}
                  </td>
                  <td className="py-2 pr-4 font-mono">{b.socket}</td>
                  <td className="py-2 pr-4 font-mono">{b.sockets}P</td>
                  <td className="py-2 pr-4 font-mono">{b.dimmSlots}</td>
                  <td className="py-2 pr-4 font-mono">{b.maxCpuTdpW ?? '—'}</td>
                  <td className="py-2 pr-4 font-mono">
                    {b.pcieX16Slots ?? '—'} / {b.mcioX8Ports ?? '—'}
                  </td>
                  <td className="py-2 text-right">
                    <Button variant="ghost" onClick={() => setEditing(b)}>
                      Править
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  );
}

function PlatformCard({ platform }: { platform: AdminPlatform }) {
  const client = useQueryClient();
  const [draft, setDraft] = useState(platform);
  const set = <K extends keyof AdminPlatform>(key: K, value: AdminPlatform[K]) => setDraft((d) => ({ ...d, [key]: value }));
  const dirty = JSON.stringify(draft) !== JSON.stringify(platform);
  const save = useMutation({
    mutationFn: () => {
      const { id: _id, socket: _socket, ...body } = draft;
      return adminFetch<AdminPlatform>(`/platforms/${platform.id}`, 'PATCH', body);
    },
    onSuccess: () => void client.invalidateQueries({ queryKey: ['admin', 'platforms'] }),
  });
  const number = (key: keyof AdminPlatform, label: string, nullable = false) => (
    <Field label={label}>
      {(id) => (
        <Input
          id={id}
          type="number"
          value={(draft[key] as number | null) ?? ''}
          onChange={(e) => set(key, (nullable ? numOrNull(e.target.value) : Number(e.target.value)) as never)}
        />
      )}
    </Field>
  );

  return (
    <Card
      title={
        <span>
          {platform.socket} <span className="text-fg-tertiary">· {platform.cpuFamily}</span>
        </span>
      }
      actions={
        <Button variant="primary" disabled={!dirty || save.isPending} onClick={() => save.mutate()}>
          Сохранить
        </Button>
      }
    >
      <div className="grid gap-3 sm:grid-cols-3">
        {number('memoryChannels', 'Каналов памяти')}
        {number('dimmsPerChannel', 'DIMM на канал', true)}
        {number('maxCpuTdpW', 'Макс. TDP CPU, Вт')}
        {number('pcieLanes1P', 'Линий PCIe 1P')}
        {number('pcieLanes2P', 'Линий PCIe 2P', true)}
        {number('maxSockets', 'Сокетов макс.')}
        <Field label="Статус">
          {(id) => (
            <Select id={id} value={draft.status} onChange={(e) => set('status', e.target.value as ProductStatus)}>
              {STATUSES.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label="Окно доступности">{(id) => <Input id={id} value={draft.availabilityWindow ?? ''} onChange={(e) => set('availabilityWindow', e.target.value || null)} />}</Field>
      </div>
      <div className="mt-3">
        <LocalizedField label="Примечание" value={draft.availabilityNote ?? EMPTY} onChange={(v) => set('availabilityNote', v.ru || v.en ? v : null)} />
      </div>
      {save.isError && <div className="mt-3"><Notice tone="error">{errorText(save.error)}</Notice></div>}
    </Card>
  );
}

const NEW_BOARD: Omit<AdminMotherboard, 'id'> = {
  socket: 'SP5',
  vendor: '',
  model: '',
  formFactor: '',
  sockets: 1,
  dimmSlots: 12,
  maxMemoryGb: null,
  maxCpuTdpW: null,
  pcieX16Slots: null,
  mcioX8Ports: null,
  features: [],
  status: 'AVAILABLE',
  availabilityWindow: null,
  isPlaceholder: false,
  sourceUrl: null,
  note: null,
  sortOrder: 100,
};

function BoardForm({ board, sockets, onClose }: { board: AdminMotherboard | null; sockets: string[]; onClose: () => void }) {
  const client = useQueryClient();
  const me = useMe();
  const [draft, setDraft] = useState<Omit<AdminMotherboard, 'id'>>(board ?? NEW_BOARD);
  const set = <K extends keyof typeof draft>(key: K, value: (typeof draft)[K]) => setDraft((d) => ({ ...d, [key]: value }));
  const done = () => {
    void client.invalidateQueries({ queryKey: ['admin', 'boards'] });
    onClose();
  };
  const save = useMutation({
    mutationFn: () => {
      if (!board) return adminFetch('/motherboards', 'POST', draft);
      const { socket: _socket, ...body } = draft;
      return adminFetch(`/motherboards/${board.id}`, 'PATCH', body);
    },
    onSuccess: done,
  });
  const remove = useMutation({ mutationFn: () => adminFetch(`/motherboards/${board!.id}`, 'DELETE'), onSuccess: done });
  const number = (key: 'sockets' | 'dimmSlots' | 'maxMemoryGb' | 'maxCpuTdpW' | 'pcieX16Slots' | 'mcioX8Ports', label: string) => (
    <Field label={label}>
      {(id) => (
        <Input
          id={id}
          type="number"
          value={draft[key] ?? ''}
          onChange={(e) => set(key, (key === 'sockets' || key === 'dimmSlots' ? Number(e.target.value) : numOrNull(e.target.value)) as never)}
        />
      )}
    </Field>
  );

  return (
    <div className="rounded-xl border border-accent/40 p-4">
      <p className="mb-4 font-medium">{board ? `${board.vendor} ${board.model}` : 'Новая плата'}</p>
      <div className="grid gap-3 sm:grid-cols-4">
        <Field label="Сокет">
          {(id) => (
            <Select id={id} value={draft.socket} disabled={board !== null} onChange={(e) => set('socket', e.target.value)}>
              {sockets.map((socket) => (
                <option key={socket}>{socket}</option>
              ))}
            </Select>
          )}
        </Field>
        <Field label="Производитель">{(id) => <Input id={id} value={draft.vendor} onChange={(e) => set('vendor', e.target.value)} />}</Field>
        <Field label="Модель">{(id) => <Input id={id} value={draft.model} onChange={(e) => set('model', e.target.value)} />}</Field>
        <Field label="Форм-фактор">{(id) => <Input id={id} value={draft.formFactor} onChange={(e) => set('formFactor', e.target.value)} />}</Field>
        {number('sockets', 'Сокетов (1–2)')}
        {number('dimmSlots', 'Слотов DIMM')}
        {number('maxMemoryGb', 'Макс. памяти, ГБ')}
        {number('maxCpuTdpW', 'Макс. TDP CPU, Вт')}
        {number('pcieX16Slots', 'Слотов PCIe x16')}
        {number('mcioX8Ports', 'Разъёмов MCIO x8')}
        <Field label="Страница производителя">{(id) => <Input id={id} type="url" value={draft.sourceUrl ?? ''} onChange={(e) => set('sourceUrl', e.target.value || null)} />}</Field>
        <Field label="Статус">
          {(id) => (
            <Select id={id} value={draft.status} onChange={(e) => set('status', e.target.value as ProductStatus)}>
              {STATUSES.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </Select>
          )}
        </Field>
      </div>
      <label className="mt-3 flex items-center gap-2 text-small text-fg-secondary">
        <input type="checkbox" checked={draft.isPlaceholder} onChange={(e) => set('isPlaceholder', e.target.checked)} />
        Место под ещё не анонсированную плату — проверять только лимиты платформы
      </label>
      <div className="mt-3">
        <LocalizedField label="Примечание" value={draft.note ?? EMPTY} onChange={(v) => set('note', v.ru || v.en ? v : null)} />
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Button variant="primary" disabled={save.isPending || !draft.vendor || !draft.model || !draft.formFactor} onClick={() => save.mutate()}>
          {board ? 'Сохранить' : 'Добавить'}
        </Button>
        <Button variant="ghost" onClick={onClose}>
          Отмена
        </Button>
        {board && me.data?.role === 'ADMIN' && (
          <Button variant="danger" className="ml-auto" disabled={remove.isPending} onClick={() => window.confirm(`Удалить ${board.vendor} ${board.model}?`) && remove.mutate()}>
            Удалить
          </Button>
        )}
      </div>
      {(save.isError || remove.isError) && <div className="mt-3"><Notice tone="error">{errorText(save.error ?? remove.error)}</Notice></div>}
    </div>
  );
}
