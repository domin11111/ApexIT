'use client';

import type { AdminProductListItem } from '@apex/contracts';
import { STATUS_META } from '@apex/contracts/status';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { adminFetch } from '@/admin/api';
import { Badge, PageHeader, formatDate } from '@/admin/ui';

const CATEGORY = { CPU: 'Процессор', MEMORY: 'Память', GPU: 'Видеокарта', MOTHERBOARD: 'Плата' } as const;
const STATUS_TONE = { available: 'green', coming: 'blue', preview: 'amber' } as const;

export default function ProductsPage() {
  const products = useQuery({ queryKey: ['admin', 'products'], queryFn: () => adminFetch<{ items: AdminProductListItem[] }>('/products') });

  return (
    <>
      <PageHeader title="Продукты" description="Тексты на двух языках, характеристики, хотспоты 3D-модели и публикация." />
      <div className="grid gap-3">
        {products.data?.items.map((p) => (
          <Link key={p.id} href={`/admin/products/${p.id}`} className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-line p-5 transition-colors hover:border-fg/30">
            <span className="flex items-center gap-3">
              <span className="size-3 rounded-full" style={{ background: p.accentColor }} aria-hidden />
              <span>
                <span className="font-medium">
                  {p.brand} {p.name}
                </span>
                <span className="block font-mono text-caption text-fg-tertiary">
                  {CATEGORY[p.category]} · {p.slug}
                </span>
              </span>
            </span>
            <span className="flex flex-wrap items-center gap-2">
              <Badge tone={STATUS_TONE[STATUS_META[p.status].tone]}>{STATUS_META[p.status].badgeWithoutWindow.ru}</Badge>
              <Badge tone={p.published ? 'green' : 'red'}>{p.published ? 'Опубликован' : 'Черновик'}</Badge>
              <Badge>{p.hasModel ? 'GLB' : 'процедурная модель'}</Badge>
              <span className="text-caption text-fg-tertiary">изм. {formatDate(p.updatedAt)}</span>
            </span>
          </Link>
        ))}
      </div>
    </>
  );
}
