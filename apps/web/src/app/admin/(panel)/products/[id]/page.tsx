'use client';

import type { AdminProductDetail } from '@apex/contracts';
import { useQuery } from '@tanstack/react-query';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import { adminFetch, errorText } from '@/admin/api';
import { ProductForm } from '@/admin/product-form';
import { SpecsEditor } from '@/admin/specs-editor';
import { Notice, PageHeader } from '@/admin/ui';

// three.js — только во вкладке хотспотов
const HotspotEditor = dynamic(() => import('@/admin/hotspot-editor').then((m) => m.HotspotEditor), { ssr: false });

const TABS = [
  ['main', 'Основное'],
  ['specs', 'Характеристики'],
  ['hotspots', 'Хотспоты 3D'],
] as const;

export default function ProductEditPage() {
  const { id } = useParams<{ id: string }>();
  const [tab, setTab] = useState<(typeof TABS)[number][0]>('main');
  const detail = useQuery({ queryKey: ['admin', 'product', id], queryFn: () => adminFetch<AdminProductDetail>(`/products/${id}`) });

  if (detail.isError) return <Notice tone="error">{errorText(detail.error)}</Notice>;
  if (!detail.data) return <p className="text-small text-fg-tertiary">Загрузка…</p>;
  const { product, groups, hotspots, compatibility } = detail.data;
  const refresh = () => void detail.refetch();
  const site = process.env.NEXT_PUBLIC_SITE_URL ?? '';

  return (
    <>
      <PageHeader
        title={`${product.brand} ${product.name}`}
        description={`${product.slug} · платформы: ${compatibility.map((c) => c.socket).join(', ') || '—'}`}
        actions={
          <>
            <a href={`${site}/products/${product.slug}`} target="_blank" rel="noreferrer" className="inline-flex h-9 items-center rounded-lg border border-line px-4 text-small hover:border-fg/40">
              Открыть на сайте ↗
            </a>
            <Link href="/admin/products" className="inline-flex h-9 items-center px-2 text-small text-fg-secondary hover:text-fg">
              ← Все продукты
            </Link>
          </>
        }
      />
      <div role="tablist" className="mb-6 flex gap-1 border-b border-line">
        {TABS.map(([value, label]) => (
          <button
            key={value}
            type="button"
            role="tab"
            aria-selected={tab === value}
            onClick={() => setTab(value)}
            className="-mb-px border-b-2 border-transparent px-4 py-2.5 text-small text-fg-secondary hover:text-fg aria-selected:border-accent aria-selected:text-fg"
            style={{ '--accent': product.accentColor } as React.CSSProperties}
          >
            {label}
          </button>
        ))}
      </div>
      {/* key = версия данных: после сохранения черновик формы начинается с актуальной записи */}
      {tab === 'main' && <ProductForm key={product.updatedAt} product={product} onSaved={refresh} />}
      {tab === 'specs' && <SpecsEditor key={JSON.stringify(groups).length + product.updatedAt} productId={product.id} initial={groups} onSaved={refresh} />}
      {tab === 'hotspots' && <HotspotEditor key={JSON.stringify(hotspots)} product={product} initial={hotspots} onSaved={refresh} />}
    </>
  );
}
