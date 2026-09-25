'use client';

import type { AdminSpec, AdminSpecGroup, CompareDirection } from '@apex/contracts';
import { SPEC_KEYS } from '@apex/contracts';
import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { adminFetch, errorText } from './api';
import { Button, Card, Input, LocalizedField, Notice, Select } from './ui';

const DIRECTIONS: Array<[CompareDirection, string]> = [
  ['HIGHER_BETTER', 'Больше — лучше'],
  ['LOWER_BETTER', 'Меньше — лучше'],
  ['NONE', 'Не сравнивать'],
];

const newSpec = (): AdminSpec => ({
  key: '',
  label: { ru: '', en: '' },
  value: { ru: '', en: '' },
  numericValue: null,
  unit: null,
  highlight: false,
  compareDirection: 'NONE',
  note: null,
});

function move<T>(list: T[], index: number, delta: number): T[] {
  const next = [...list];
  const [item] = next.splice(index, 1);
  next.splice(Math.max(0, Math.min(next.length, index + delta)), 0, item!);
  return next;
}

/**
 * Группы и характеристики: порядок = порядок на сайте. Ключ из реестра SPEC_KEYS участвует
 * в сравнении и конфигураторе (числа в каноничных единицах), произвольный — только отображается.
 */
export function SpecsEditor({ productId, initial, onSaved }: { productId: string; initial: AdminSpecGroup[]; onSaved: () => void }) {
  const [groups, setGroups] = useState(initial);
  const [open, setOpen] = useState<string | null>(null);
  const save = useMutation({ mutationFn: () => adminFetch(`/products/${productId}/specs`, 'PUT', { groups }), onSuccess: onSaved });
  const dirty = JSON.stringify(groups) !== JSON.stringify(initial);

  const updateGroup = (gi: number, patch: Partial<AdminSpecGroup>) => setGroups((gs) => gs.map((g, i) => (i === gi ? { ...g, ...patch } : g)));
  const updateSpec = (gi: number, si: number, patch: Partial<AdminSpec>) =>
    setGroups((gs) => gs.map((g, i) => (i === gi ? { ...g, specs: g.specs.map((s, j) => (j === si ? { ...s, ...patch } : s)) } : g)));

  return (
    <div className="flex flex-col gap-4">
      <datalist id="spec-keys">
        {Object.keys(SPEC_KEYS).map((key) => (
          <option key={key} value={key} />
        ))}
      </datalist>
      {groups.map((group, gi) => (
        <Card
          key={gi}
          title={
            <span className="flex items-center gap-3">
              <span className="font-mono text-caption text-fg-tertiary">{group.key || 'новая группа'}</span>
              {group.title.ru}
            </span>
          }
          actions={
            <>
              <Button variant="ghost" onClick={() => setGroups((gs) => move(gs, gi, -1))} disabled={gi === 0} aria-label="Выше">
                ↑
              </Button>
              <Button variant="ghost" onClick={() => setGroups((gs) => move(gs, gi, 1))} disabled={gi === groups.length - 1} aria-label="Ниже">
                ↓
              </Button>
              <Button variant="danger" onClick={() => setGroups((gs) => gs.filter((_, i) => i !== gi))}>
                Удалить группу
              </Button>
            </>
          }
        >
          <div className="mb-4 grid gap-3 sm:grid-cols-[10rem_minmax(0,1fr)]">
            <Input value={group.key} onChange={(e) => updateGroup(gi, { key: e.target.value })} placeholder="compute" aria-label="Ключ группы" className="font-mono" />
            <LocalizedField label="Название группы" value={group.title} onChange={(title) => updateGroup(gi, { title })} required />
          </div>
          <ul className="divide-y divide-line rounded-lg border border-line">
            {group.specs.map((spec, si) => {
              const id = `${gi}:${si}`;
              const known = spec.key in SPEC_KEYS;
              return (
                <li key={si} className="p-3">
                  <div className="flex flex-wrap items-center gap-3">
                    <Input list="spec-keys" value={spec.key} onChange={(e) => updateSpec(gi, si, { key: e.target.value })} placeholder="cpu.cores" aria-label="Ключ" className="max-w-[12rem] font-mono" />
                    <span className="min-w-0 flex-1 truncate text-small">
                      {spec.label.ru || '—'}: <span className="font-mono text-fg-secondary">{spec.value.ru || '—'}</span>
                    </span>
                    {!known && spec.key && <span className="text-caption text-badge-preview">вне реестра</span>}
                    <label className="flex items-center gap-1.5 text-caption text-fg-tertiary">
                      <input type="checkbox" checked={spec.highlight} onChange={(e) => updateSpec(gi, si, { highlight: e.target.checked })} /> ключевая
                    </label>
                    <Button variant="ghost" onClick={() => setOpen(open === id ? null : id)}>
                      {open === id ? 'Свернуть' : 'Править'}
                    </Button>
                    <Button variant="ghost" onClick={() => updateGroup(gi, { specs: move(group.specs, si, -1) })} disabled={si === 0} aria-label="Выше">
                      ↑
                    </Button>
                    <Button variant="ghost" onClick={() => updateGroup(gi, { specs: group.specs.filter((_, j) => j !== si) })} aria-label="Удалить">
                      ✕
                    </Button>
                  </div>
                  {open === id && (
                    <div className="mt-3 flex flex-col gap-3">
                      <LocalizedField label="Подпись" value={spec.label} onChange={(label) => updateSpec(gi, si, { label })} required />
                      <LocalizedField label="Значение для показа" value={spec.value} onChange={(value) => updateSpec(gi, si, { value })} required />
                      <div className="grid gap-3 sm:grid-cols-3">
                        <Input
                          type="number"
                          step="any"
                          value={spec.numericValue ?? ''}
                          onChange={(e) => updateSpec(gi, si, { numericValue: e.target.value === '' ? null : Number(e.target.value) })}
                          placeholder="Число (для сравнения)"
                          aria-label="Число"
                        />
                        <Input value={spec.unit ?? ''} onChange={(e) => updateSpec(gi, si, { unit: e.target.value || null })} placeholder="Единица: W, GB, GHz…" aria-label="Единица" />
                        <Select value={spec.compareDirection} onChange={(e) => updateSpec(gi, si, { compareDirection: e.target.value as CompareDirection })} aria-label="Сравнение">
                          {DIRECTIONS.map(([value, label]) => (
                            <option key={value} value={value}>
                              {label}
                            </option>
                          ))}
                        </Select>
                      </div>
                      <LocalizedField label="Сноска" value={spec.note ?? { ru: '', en: '' }} onChange={(note) => updateSpec(gi, si, { note: note.ru || note.en ? note : null })} />
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
          <Button className="mt-3" onClick={() => updateGroup(gi, { specs: [...group.specs, newSpec()] })}>
            + Характеристика
          </Button>
        </Card>
      ))}
      <Button className="self-start" onClick={() => setGroups((gs) => [...gs, { key: '', title: { ru: '', en: '' }, specs: [] }])}>
        + Группа
      </Button>

      <div className="sticky bottom-4 flex items-center gap-3 rounded-xl border border-line bg-void/90 p-3 backdrop-blur">
        <Button variant="primary" disabled={!dirty || save.isPending} onClick={() => save.mutate()}>
          {save.isPending ? 'Сохраняем…' : 'Сохранить характеристики'}
        </Button>
        <Button variant="ghost" disabled={!dirty} onClick={() => setGroups(initial)}>
          Отменить
        </Button>
        {save.isError && <Notice tone="error">{errorText(save.error)}</Notice>}
      </div>
    </div>
  );
}
