'use client';

import { ModelManifest, type AdminAsset, type UploadTicket } from '@apex/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import dynamic from 'next/dynamic';
import { useRef, useState } from 'react';
import { adminFetch, errorText } from '@/admin/api';
import { useMe } from '@/admin/session';
import { Badge, Button, Card, Notice, PageHeader, Textarea, formatBytes, formatDate } from '@/admin/ui';

const AssetPreview = dynamic(() => import('@/admin/asset-preview'), { ssr: false });

const STATUS = {
  PENDING: { label: 'Ожидает файл', tone: 'neutral' },
  PROCESSING: { label: 'Обрабатывается', tone: 'blue' },
  READY: { label: 'Готова', tone: 'green' },
  FAILED: { label: 'Ошибка', tone: 'red' },
} as const;

/** PUT файла по presigned URL с прогрессом (fetch прогресс отправки не отдаёт). */
function putWithProgress(ticket: UploadTicket, file: File, onProgress: (share: number) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', ticket.uploadUrl);
    for (const [name, value] of Object.entries(ticket.headers)) xhr.setRequestHeader(name, value);
    xhr.upload.onprogress = (event) => event.lengthComputable && onProgress(event.loaded / event.total);
    xhr.onload = () => (xhr.status < 300 ? resolve() : reject(new Error(`Хранилище ответило ${xhr.status}`)));
    xhr.onerror = () => reject(new Error('Хранилище недоступно (CORS или сеть)'));
    xhr.send(file);
  });
}

/**
 * 3D-модели (B4): GLB грузится напрямую в S3, воркер проверяет формат, сжимает (Meshopt, KTX2),
 * делает мобильный вариант; превью снимается кадром из живого окна просмотра.
 */
export default function AssetsPage() {
  const client = useQueryClient();
  const input = useRef<HTMLInputElement>(null);
  const [upload, setUpload] = useState<{ name: string; share: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const assets = useQuery({
    queryKey: ['admin', 'assets'],
    queryFn: () => adminFetch<{ items: AdminAsset[] }>('/assets'),
    // Пока что-то обрабатывается — опрашиваем статус
    refetchInterval: (query) => (query.state.data?.items.some((a) => a.status === 'PROCESSING') ? 2000 : false),
  });

  const start = async (file: File) => {
    setError(null);
    setUpload({ name: file.name, share: 0 });
    try {
      const ticket = await adminFetch<UploadTicket>('/assets/uploads', 'POST', { fileName: file.name, sizeBytes: file.size });
      await putWithProgress(ticket, file, (share) => setUpload({ name: file.name, share }));
      await adminFetch(`/assets/${ticket.assetId}/complete`, 'POST', {});
      await client.invalidateQueries({ queryKey: ['admin', 'assets'] });
    } catch (e) {
      setError(errorText(e));
    } finally {
      setUpload(null);
      if (input.current) input.current.value = '';
    }
  };

  return (
    <>
      <PageHeader
        title="3D-модели"
        description="GLB до 100 МБ. После обработки: бюджет 3 МБ и 150 тыс. треугольников, текстуры KTX2, мобильный вариант. Назначение продукту — в карточке продукта."
        actions={
          <>
            <input ref={input} type="file" accept=".glb,model/gltf-binary" className="hidden" onChange={(e) => e.target.files?.[0] && void start(e.target.files[0])} />
            <Button variant="primary" disabled={upload !== null} onClick={() => input.current?.click()}>
              Загрузить GLB
            </Button>
          </>
        }
      />
      {upload && (
        <div className="mb-6 rounded-xl border border-line p-4">
          <p className="text-small">
            {upload.name} — {Math.round(upload.share * 100)}%
          </p>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/5">
            <div className="h-full bg-accent transition-[width]" style={{ width: `${upload.share * 100}%` }} />
          </div>
        </div>
      )}
      {error && <div className="mb-6"><Notice tone="error">{error}</Notice></div>}
      <div className="grid gap-6">
        {assets.data?.items.map((asset) => <AssetCard key={asset.id} asset={asset} />)}
      </div>
    </>
  );
}

function AssetCard({ asset }: { asset: AdminAsset }) {
  const client = useQueryClient();
  const me = useMe();
  const canvas = useRef<HTMLCanvasElement | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const meta = asset.meta as {
    source?: { triangles?: number; nodes?: string[] };
    desktop?: { triangles?: number };
    mobile?: { triangles?: number };
    warnings?: string[];
    error?: string | null;
    ktx2?: boolean;
    manifest?: unknown;
    previewUrl?: string;
  };
  const [manifestText, setManifestText] = useState(meta.manifest ? JSON.stringify(meta.manifest, null, 2) : '');
  const refresh = () => void client.invalidateQueries({ queryKey: ['admin', 'assets'] });

  const parsedManifest = (() => {
    if (!manifestText.trim()) return { ok: true as const, value: {} };
    try {
      const result = ModelManifest.safeParse(JSON.parse(manifestText));
      return result.success ? { ok: true as const, value: result.data } : { ok: false as const, message: result.error.issues[0]?.message ?? 'Не соответствует схеме' };
    } catch {
      return { ok: false as const, message: 'Некорректный JSON' };
    }
  })();

  const saveManifest = useMutation({ mutationFn: () => adminFetch(`/assets/${asset.id}`, 'PATCH', { manifest: parsedManifest.ok ? parsedManifest.value : {} }), onSuccess: refresh });
  const savePreview = useMutation({
    mutationFn: () => {
      const dataUrl = canvas.current?.toDataURL('image/webp', 0.9);
      if (!dataUrl) throw new Error('Окно просмотра ещё не готово');
      return adminFetch(`/assets/${asset.id}/preview`, 'POST', { dataUrl });
    },
    onSuccess: refresh,
  });
  const reprocess = useMutation({ mutationFn: () => adminFetch(`/assets/${asset.id}/reprocess`, 'POST', {}), onSuccess: refresh });
  const remove = useMutation({ mutationFn: () => adminFetch(`/assets/${asset.id}`, 'DELETE'), onSuccess: refresh });
  const mobile = asset.variants.find((v) => v.variant === 'MOBILE');
  const status = STATUS[asset.status];

  return (
    <Card
      title={
        <span className="flex flex-wrap items-center gap-3">
          {asset.fileName}
          <Badge tone={status.tone}>{status.label}</Badge>
          {meta.ktx2 && <Badge>KTX2</Badge>}
        </span>
      }
      actions={
        <>
          {asset.status === 'READY' && (
            <Button variant="ghost" onClick={() => setShowPreview((v) => !v)}>
              {showPreview ? 'Скрыть 3D' : 'Показать 3D'}
            </Button>
          )}
          {(asset.status === 'READY' || asset.status === 'FAILED') && asset.meta.sourceKey !== undefined && (
            <Button variant="ghost" disabled={reprocess.isPending} onClick={() => reprocess.mutate()}>
              Обработать заново
            </Button>
          )}
          {me.data?.role === 'ADMIN' && asset.usedBy.length === 0 && (
            <Button variant="danger" onClick={() => window.confirm(`Удалить ${asset.fileName}?`) && remove.mutate()}>
              Удалить
            </Button>
          )}
        </>
      }
    >
      <div className="grid gap-6 lg:grid-cols-[18rem_minmax(0,1fr)]">
        <div>
          {showPreview ? (
            <div className="aspect-square overflow-hidden rounded-lg border border-line">
              <AssetPreview
                url={asset.url}
                manifest={parsedManifest.ok ? (parsedManifest.value as never) : undefined}
                onCanvas={(el) => {
                  canvas.current = el;
                }}
              />
            </div>
          ) : meta.previewUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- картинка из S3/CDN, оптимизатор Next для неё не нужен
            <img src={meta.previewUrl} alt={`Превью ${asset.fileName}`} className="aspect-square w-full rounded-lg border border-line object-cover" />
          ) : (
            <div className="grid aspect-square place-items-center rounded-lg border border-dashed border-line text-caption text-fg-tertiary">нет превью</div>
          )}
          {showPreview && (
            <Button className="mt-2 w-full" disabled={savePreview.isPending} onClick={() => savePreview.mutate()}>
              Сохранить кадр как превью
            </Button>
          )}
        </div>

        <div className="flex flex-col gap-4 text-small">
          <dl className="grid grid-cols-2 gap-x-6 gap-y-2 sm:grid-cols-4">
            <dt className="text-fg-tertiary">Размер</dt>
            <dd className="font-mono">{formatBytes(asset.sizeBytes)}</dd>
            <dt className="text-fg-tertiary">Мобильный</dt>
            <dd className="font-mono">{formatBytes(mobile?.sizeBytes)}</dd>
            <dt className="text-fg-tertiary">Треугольники</dt>
            <dd className="font-mono">
              {meta.desktop?.triangles ?? meta.source?.triangles ?? '—'} / {meta.mobile?.triangles ?? '—'}
            </dd>
            <dt className="text-fg-tertiary">Загружена</dt>
            <dd>{formatDate(asset.createdAt)}</dd>
          </dl>
          <p>
            <span className="text-fg-tertiary">Используется: </span>
            {asset.usedBy.length ? asset.usedBy.map((p) => p.name).join(', ') : 'нигде'}
          </p>
          {meta.error && <Notice tone="error">{meta.error}</Notice>}
          {meta.warnings?.map((warning) => (
            <Notice key={warning}>{warning}</Notice>
          ))}
          {meta.source?.nodes && (
            <details>
              <summary className="cursor-pointer text-fg-secondary">Узлы модели ({meta.source.nodes.length}) — для манифеста и хотспотов</summary>
              <p className="mt-2 font-mono text-caption text-fg-tertiary">{meta.source.nodes.join(', ')}</p>
            </details>
          )}
          <div>
            <p className="mb-1.5 text-caption text-fg-tertiary">
              Манифест: rotation (градусы), nodes (наше имя → имя в GLB), rig (разлёт и подсветка), credit (автор и лицензия)
            </p>
            <Textarea rows={6} value={manifestText} onChange={(e) => setManifestText(e.target.value)} className="font-mono text-caption" spellCheck={false} aria-invalid={!parsedManifest.ok} />
            <div className="mt-2 flex items-center gap-3">
              <Button disabled={!parsedManifest.ok || saveManifest.isPending} onClick={() => saveManifest.mutate()}>
                Сохранить манифест
              </Button>
              {!parsedManifest.ok && <span className="text-caption text-[#ff6b61]">{parsedManifest.message}</span>}
            </div>
          </div>
          {(saveManifest.isError || savePreview.isError || reprocess.isError || remove.isError) && (
            <Notice tone="error">{errorText(saveManifest.error ?? savePreview.error ?? reprocess.error ?? remove.error)}</Notice>
          )}
        </div>
      </div>
    </Card>
  );
}
