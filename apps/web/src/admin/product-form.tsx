'use client';

import type { AdminAsset, AdminProduct, AdminProductUpdate, Localized, ModelPreset, ProductStatus } from '@apex/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { adminFetch, errorText } from './api';
import { Button, Card, Field, Input, LocalizedField, Notice, Select } from './ui';

const STATUSES: Array<[ProductStatus, string]> = [
  ['AVAILABLE', 'Доступен'],
  ['COMING_SOON', 'Ожидается'],
  ['PREVIEW', 'Превью (только запрос информации)'],
];
const PRESETS: ModelPreset[] = ['CPU_SP7', 'CPU_SP5', 'RDIMM', 'GPU_DUAL_SLOT', 'MOTHERBOARD'];
const EMPTY: Localized = { ru: '', en: '' };

/** Изменённые поля относительно сохранённой версии — PATCH отправляет только их. */
function changes(saved: AdminProduct, draft: AdminProduct): AdminProductUpdate {
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(draft) as Array<keyof AdminProduct>) {
    if (['id', 'slug', 'category', 'publishedAt', 'updatedAt'].includes(key)) continue;
    if (JSON.stringify(saved[key]) !== JSON.stringify(draft[key])) out[key] = draft[key];
  }
  return out as AdminProductUpdate;
}

/** Основные поля продукта и публикация. */
export function ProductForm({ product, onSaved }: { product: AdminProduct; onSaved: () => void }) {
  const client = useQueryClient();
  const [draft, setDraft] = useState(product);
  const assets = useQuery({ queryKey: ['admin', 'assets'], queryFn: () => adminFetch<{ items: AdminAsset[] }>('/assets') });
  const set = <K extends keyof AdminProduct>(key: K, value: AdminProduct[K]) => setDraft((d) => ({ ...d, [key]: value }));
  const diff = changes(product, draft);
  const dirty = Object.keys(diff).length > 0;

  const save = useMutation({
    mutationFn: () => adminFetch<AdminProduct>(`/products/${product.id}`, 'PATCH', diff),
    onSuccess: () => {
      onSaved();
      void client.invalidateQueries({ queryKey: ['admin', 'products'] });
    },
  });
  const publish = useMutation({
    mutationFn: (published: boolean) => adminFetch<AdminProduct>(`/products/${product.id}/publish`, 'POST', { published }),
    onSuccess: () => {
      onSaved();
      void client.invalidateQueries({ queryKey: ['admin', 'products'] });
    },
  });

  return (
    <div className="flex flex-col gap-6">
      <Card
        title="Публикация"
        actions={
          <Button variant={product.publishedAt ? 'danger' : 'primary'} disabled={publish.isPending} onClick={() => publish.mutate(!product.publishedAt)}>
            {product.publishedAt ? 'Снять с публикации' : 'Опубликовать'}
          </Button>
        }
      >
        <p className="text-small text-fg-secondary">
          {product.publishedAt
            ? 'Продукт на сайте. Любое сохранение обновляет страницы сразу: кэш API сбрасывается, фронт получает вебхук ревалидации.'
            : 'Черновик: не виден в публичном API и на сайте.'}
        </p>
        {publish.isError && <div className="mt-3"><Notice tone="error">{errorText(publish.error)}</Notice></div>}
      </Card>

      <Card title="Основное">
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Бренд">{(id) => <Input id={id} value={draft.brand} onChange={(e) => set('brand', e.target.value)} />}</Field>
          <Field label="Название">{(id) => <Input id={id} value={draft.name} onChange={(e) => set('name', e.target.value)} />}</Field>
          <Field label="Кодовое имя">{(id) => <Input id={id} value={draft.codename ?? ''} onChange={(e) => set('codename', e.target.value || null)} />}</Field>
          <Field label="Заголовок (одинаков в языках)" hint="«The New Era»">{(id) => <Input id={id} value={draft.headline} onChange={(e) => set('headline', e.target.value)} />}</Field>
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
          <Field label="Окно доступности" hint="«Q4 2026» — в бейдж">{(id) => <Input id={id} value={draft.availabilityWindow ?? ''} onChange={(e) => set('availabilityWindow', e.target.value || null)} />}</Field>
        </div>
        <div className="mt-4 flex flex-col gap-4">
          <LocalizedField label="Слоган" value={draft.tagline} onChange={(v) => set('tagline', v)} required />
          <LocalizedField label="Описание" value={draft.description} onChange={(v) => set('description', v)} multiline required />
          <LocalizedField
            label="Примечание о доступности"
            value={draft.availabilityNote ?? EMPTY}
            onChange={(v) => set('availabilityNote', v.ru || v.en ? v : null)}
          />
        </div>
      </Card>

      <Card title="Вид и 3D-модель">
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Акцент">{(id) => <Input id={id} type="color" value={draft.accentColor} onChange={(e) => set('accentColor', e.target.value)} className="h-10 p-1" />}</Field>
          <Field label="Второй цвет градиента">
            {(id) => (
              <div className="flex gap-2">
                <Input id={id} type="color" value={draft.accentColorAlt ?? draft.accentColor} onChange={(e) => set('accentColorAlt', e.target.value)} className="h-10 p-1" />
                {draft.accentColorAlt && (
                  <Button variant="ghost" onClick={() => set('accentColorAlt', null)}>
                    Убрать
                  </Button>
                )}
              </div>
            )}
          </Field>
          <Field label="Порядок в коллекции">{(id) => <Input id={id} type="number" value={draft.sortOrder} onChange={(e) => set('sortOrder', Number(e.target.value))} />}</Field>
          <Field label="Процедурная модель" hint="Пока не назначен GLB">
            {(id) => (
              <Select id={id} value={draft.modelPreset} onChange={(e) => set('modelPreset', e.target.value as ModelPreset)}>
                {PRESETS.map((preset) => (
                  <option key={preset}>{preset}</option>
                ))}
              </Select>
            )}
          </Field>
          <Field label="Загруженная модель (GLB)" hint="Готовые модели из раздела «3D-модели»">
            {(id) => (
              <Select id={id} value={draft.modelAssetId ?? ''} onChange={(e) => set('modelAssetId', e.target.value || null)}>
                <option value="">— процедурная —</option>
                {assets.data?.items
                  .filter((a) => a.status === 'READY')
                  .map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.fileName}
                    </option>
                  ))}
              </Select>
            )}
          </Field>
        </div>
      </Card>

      <div className="sticky bottom-4 flex items-center gap-3 rounded-xl border border-line bg-void/90 p-3 backdrop-blur">
        <Button variant="primary" disabled={!dirty || save.isPending} onClick={() => save.mutate()}>
          {save.isPending ? 'Сохраняем…' : 'Сохранить'}
        </Button>
        <Button variant="ghost" disabled={!dirty} onClick={() => setDraft(product)}>
          Отменить
        </Button>
        <span className="text-caption text-fg-tertiary">{dirty ? `Изменено полей: ${Object.keys(diff).length}` : 'Изменений нет'}</span>
        {save.isError && <span className="text-small text-[#ff6b61]">{errorText(save.error)}</span>}
      </div>
    </div>
  );
}
