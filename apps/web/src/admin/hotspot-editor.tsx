'use client';

import type { AdminAsset, AdminHotspot, AdminProduct, HotspotVisibility } from '@apex/contracts';
import { OrbitControls } from '@react-three/drei';
import { Canvas, useThree, type ThreeEvent } from '@react-three/fiber';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Vector3, type Camera, type Object3D } from 'three';
import type { ModelManifest } from '@/three/models/glb';
import { ProductModel } from '@/three/models/product-model';
import { createRigControls } from '@/three/models/rig';
import { StudioLights } from '@/three/stage/lights';
import { adminFetch, errorText } from './api';
import { Button, Card, Field, Input, LocalizedField, Notice, Select } from './ui';

type Vec3 = [number, number, number];
const round = (v: Vector3 | Vec3): Vec3 => (Array.isArray(v) ? v : v.toArray()).map((n) => Math.round(n * 1000) / 1000) as Vec3;

const VISIBILITY: Array<[HotspotVisibility, string]> = [
  ['ALWAYS', 'Всегда'],
  ['ASSEMBLED', 'Только в собранном виде'],
  ['EXPLODED', 'Только в разобранном виде'],
];

/** Имена узлов от кликнутой детали к корню — кандидаты в anchorNode (хотспот следует за узлом при разборке). */
function nameChain(object: Object3D): string[] {
  const names: string[] = [];
  for (let node: Object3D | null = object; node; node = node.parent) {
    if (node.name && !names.includes(node.name) && node.name !== 'glb') names.push(node.name);
  }
  return names;
}

/**
 * Визуальный редактор хотспотов (B4): клик по модели ставит точку выбранного хотспота
 * (или создаёт новый), узел под курсором предлагается как якорь, камеру для подлёта
 * можно снять с текущего ракурса. Координаты — в пространстве модели, как на сайте.
 */
export function HotspotEditor({ product, initial, onSaved }: { product: AdminProduct; initial: AdminHotspot[]; onSaved: () => void }) {
  const [hotspots, setHotspots] = useState(initial);
  const [selected, setSelected] = useState<number | null>(initial.length ? 0 : null);
  const [chain, setChain] = useState<string[]>([]);
  const cameraRef = useRef<Camera | null>(null);
  const onCamera = useCallback((camera: Camera) => {
    cameraRef.current = camera;
  }, []);
  const save = useMutation({ mutationFn: () => adminFetch(`/products/${product.id}/hotspots`, 'PUT', { hotspots }), onSuccess: onSaved });
  const dirty = JSON.stringify(hotspots) !== JSON.stringify(initial);

  const asset = useQuery({
    queryKey: ['admin', 'asset', product.modelAssetId],
    queryFn: () => adminFetch<AdminAsset>(`/assets/${product.modelAssetId}`),
    enabled: product.modelAssetId !== null,
  });
  const source =
    asset.data?.status === 'READY' ? { url: asset.data.url, manifest: (asset.data.meta.manifest ?? {}) as ModelManifest } : undefined;

  const update = (patch: Partial<AdminHotspot>) => {
    if (selected === null) return;
    setHotspots((list) => list.map((h, i) => (i === selected ? { ...h, ...patch } : h)));
  };

  const onPick = (event: ThreeEvent<MouseEvent>) => {
    event.stopPropagation();
    const point = event.point.clone();
    const names = nameChain(event.object);
    setChain(names);
    // Камера подлёта по умолчанию — снаружи точки, по направлению от центра модели
    const out = point.clone().normalize().multiplyScalar(1.4).add(new Vector3(0, 0.35, 0));
    const anchor = names[1] ?? names[0] ?? null;
    if (selected === null) {
      const key = `spot-${hotspots.length + 1}`;
      setHotspots((list) => [
        ...list,
        {
          key,
          anchorNode: anchor,
          position: round(point),
          cameraPosition: round(point.clone().add(out)),
          cameraTarget: null,
          visibility: 'ALWAYS',
          title: { ru: '', en: '' },
          body: { ru: '', en: '' },
        },
      ]);
      setSelected(hotspots.length);
    } else {
      update({ position: round(point), anchorNode: anchor, cameraPosition: round(point.clone().add(out)) });
    }
  };

  const current = selected === null ? null : hotspots[selected];

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_26rem]">
      <div className="relative h-[60vh] min-h-[420px] overflow-hidden rounded-xl border border-line">
        <Canvas camera={{ fov: 32, position: [2.4, 2, 3.4], near: 0.05, far: 40 }} dpr={[1, 2]}>
          <color attach="background" args={['#07070a']} />
          <StudioLights accent={product.accentColor} />
          <CameraProbe onCamera={onCamera} />
          <OrbitControls makeDefault enableDamping minDistance={1} maxDistance={8} />
          <Suspense fallback={null}>
            <EditableModel product={product} source={source} onPick={onPick} />
          </Suspense>
          {hotspots.map((h, i) => (
            <mesh
              key={`${h.key}-${i}`}
              position={h.position}
              renderOrder={10}
              onClick={(event) => {
                event.stopPropagation();
                setSelected(i);
              }}
            >
              <sphereGeometry args={[i === selected ? 0.045 : 0.03, 16, 16]} />
              <meshBasicMaterial color={i === selected ? product.accentColor : '#f5f5f7'} depthTest={false} transparent opacity={0.95} />
            </mesh>
          ))}
        </Canvas>
        <p className="pointer-events-none absolute left-3 top-3 rounded-lg bg-void/80 px-3 py-2 text-caption text-fg-secondary">
          {selected === null ? 'Клик по модели — новый хотспот' : `Клик по модели переставит «${current?.key}»`}
        </p>
      </div>

      <div className="flex flex-col gap-4">
        <Card
          title="Хотспоты"
          actions={
            <Button variant="ghost" onClick={() => setSelected(null)}>
              + Новый
            </Button>
          }
        >
          <ol className="flex flex-col gap-1">
            {hotspots.map((h, i) => (
              <li key={`${h.key}-${i}`}>
                <button
                  type="button"
                  aria-pressed={i === selected}
                  onClick={() => setSelected(i)}
                  className="flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left text-small hover:bg-white/5 aria-pressed:bg-white/10"
                >
                  <span className="truncate">
                    <span className="font-mono text-fg-tertiary">{i + 1}.</span> {h.title.ru || h.key}
                  </span>
                  <span className="font-mono text-caption text-fg-tertiary">{h.anchorNode ?? '—'}</span>
                </button>
              </li>
            ))}
          </ol>
        </Card>

        {current && (
          <Card
            title={`Хотспот ${selected! + 1}`}
            actions={
              <Button
                variant="danger"
                onClick={() => {
                  setHotspots((list) => list.filter((_, i) => i !== selected));
                  setSelected(null);
                }}
              >
                Удалить
              </Button>
            }
          >
            <div className="flex flex-col gap-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Ключ">{(id) => <Input id={id} value={current.key} onChange={(e) => update({ key: e.target.value })} className="font-mono" />}</Field>
                <Field label="Когда виден">
                  {(id) => (
                    <Select id={id} value={current.visibility} onChange={(e) => update({ visibility: e.target.value as HotspotVisibility })}>
                      {VISIBILITY.map(([value, label]) => (
                        <option key={value} value={value}>
                          {label}
                        </option>
                      ))}
                    </Select>
                  )}
                </Field>
              </div>
              <Field label="Узел-якорь" hint="Хотспот следует за узлом при разборке; имена одинаковы у процедурной модели и GLB">
                {(id) => (
                  <Select id={id} value={current.anchorNode ?? ''} onChange={(e) => update({ anchorNode: e.target.value || null })}>
                    <option value="">— без якоря —</option>
                    {[...new Set([...(current.anchorNode ? [current.anchorNode] : []), ...chain])].map((name) => (
                      <option key={name} value={name}>
                        {name}
                      </option>
                    ))}
                  </Select>
                )}
              </Field>
              <LocalizedField label="Заголовок" value={current.title} onChange={(title) => update({ title })} required />
              <LocalizedField label="Текст" value={current.body} onChange={(body) => update({ body })} multiline required />
              <p className="font-mono text-caption text-fg-tertiary">
                точка {current.position.join(', ')} · камера {current.cameraPosition.join(', ')}
              </p>
              <Button
                onClick={() => {
                  const camera = cameraRef.current;
                  if (camera) update({ cameraPosition: round(camera.position.clone()) });
                }}
              >
                Камера подлёта — текущий ракурс
              </Button>
            </div>
          </Card>
        )}

        <div className="flex items-center gap-3">
          <Button variant="primary" disabled={!dirty || save.isPending} onClick={() => save.mutate()}>
            {save.isPending ? 'Сохраняем…' : 'Сохранить хотспоты'}
          </Button>
          <Button variant="ghost" disabled={!dirty} onClick={() => setHotspots(initial)}>
            Отменить
          </Button>
        </div>
        {save.isError && <Notice tone="error">{errorText(save.error)}</Notice>}
      </div>
    </div>
  );
}

/** Модель продукта в собранном виде; клики по деталям уходят в редактор. */
function EditableModel({
  product,
  source,
  onPick,
}: {
  product: AdminProduct;
  source: { url: string; manifest: ModelManifest } | undefined;
  onPick: (event: ThreeEvent<MouseEvent>) => void;
}) {
  const controls = useMemo(() => createRigControls(), []);
  return (
    <group onClick={onPick}>
      <ProductModel
        preset={product.modelPreset}
        accent={product.accentColor}
        identity={{ brand: product.brand, name: product.name, codename: product.codename }}
        controls={controls}
        source={source}
      />
    </group>
  );
}

/** Отдаёт камеру сцены наружу — для кнопки «камера подлёта — текущий ракурс». */
function CameraProbe({ onCamera }: { onCamera: (camera: Camera) => void }) {
  const camera = useThree((s) => s.camera);
  useEffect(() => onCamera(camera), [camera, onCamera]);
  return null;
}
