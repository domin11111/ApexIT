'use client';

import type { ModelPreset } from '@apex/contracts';
import { useGLTF } from '@react-three/drei';
import { useFrame, useThree, type ThreeElements } from '@react-three/fiber';
import { useEffect, useMemo, useState } from 'react';
import type { Object3D, WebGLRenderer } from 'three';
import { KTX2Loader } from 'three/addons/loaders/KTX2Loader.js';
import { withBasePath } from '@/lib/base-path';
import { prepareGlb, type ModelManifest } from './glb';
import { buildProceduralModel, type ModelIdentity } from './procedural';
import { applyRig, collectRig, disposeModel, type RigControls } from './rig';

type GroupProps = ThreeElements['group'];

/** GLB-модель: url — десктопная, mobileUrl — облегчённая (текстуры до 1024 px) для телефонов и планшетов. */
export type ModelSource = { url: string; mobileUrl?: string; manifest?: ModelManifest };

/** Тот же критерий, что и у качества рендера: сенсорный экран или узкое окно — мобильный вариант. */
const CONSTRAINED = '(pointer: coarse), (max-width: 767px)';

type ProductModelProps = GroupProps & {
  preset: ModelPreset;
  accent: string;
  identity?: ModelIdentity;
  /** Изменяемый объект: сцена и GSAP пишут в него, модель читает каждый кадр */
  controls: RigControls;
  /** GLB-модель; не задана — процедурная по preset */
  source?: ModelSource;
  /** Корень модели после сборки — например, чтобы хотспоты следовали за узлами при разборке */
  onRoot?: (root: Object3D) => void;
};

/**
 * Модель продукта для любой сцены. Процедурная и GLB-модели управляются одинаково — через RigControls,
 * поэтому замена одной на другую (загрузка GLB в админке) не требует правок сцен.
 */
export function ProductModel({ source, preset, accent, identity, controls, onRoot, ...group }: ProductModelProps) {
  return source ? (
    <GlbModel source={source} controls={controls} onRoot={onRoot} {...group} />
  ) : (
    <ProceduralModel preset={preset} accent={accent} identity={identity} controls={controls} onRoot={onRoot} {...group} />
  );
}

function ProceduralModel({
  preset,
  accent,
  identity,
  controls,
  onRoot,
  ...group
}: Omit<ProductModelProps, 'source'>) {
  const brand = identity?.brand;
  const name = identity?.name;
  const codename = identity?.codename;
  const root = useMemo(
    () => buildProceduralModel(preset, accent, brand && name ? { brand, name, codename } : undefined),
    [preset, accent, brand, name, codename],
  );
  useEffect(() => () => disposeModel(root), [root]);
  return <RiggedObject root={root} controls={controls} onRoot={onRoot} {...group} />;
}

/** URL варианта модели для этого устройства. Выбирается один раз: смена ориентации или окна не перезагружает модель. */
export function useModelUrl(source: ModelSource): string {
  const [url] = useState(() => (source.mobileUrl && window.matchMedia(CONSTRAINED).matches ? source.mobileUrl : source.url));
  return url;
}

/**
 * Один KTX2Loader на рендерер: транскодер Basis (public/basis) грузится один раз.
 * Пайплайн загрузки сжимает текстуры в KTX2, Meshopt-геометрию useGLTF декодирует сам.
 */
const ktx2Loaders = new WeakMap<WebGLRenderer, KTX2Loader>();
function ktx2For(gl: WebGLRenderer): KTX2Loader {
  let loader = ktx2Loaders.get(gl);
  if (!loader) {
    loader = new KTX2Loader().setTranscoderPath(withBasePath('/basis/')).detectSupport(gl);
    ktx2Loaders.set(gl, loader);
  }
  return loader;
}

/**
 * Сцена GLB по URL: декодеры Draco и Meshopt (модели tools/blender сжаты Meshopt),
 * KTX2 — для текстур, сжатых пайплайном загрузки (этап 7). Кэш общий на всё приложение.
 */
export function useGlbScene(url: string): Object3D {
  const gl = useThree((state) => state.gl);
  const { scene } = useGLTF(withBasePath(url), true, true, (loader) => {
    // GLTFLoader drei типизирован по three-stdlib; KTX2Loader из three совместим по интерфейсу
    loader.setKTX2Loader(ktx2For(gl) as unknown as Parameters<typeof loader.setKTX2Loader>[0]);
  });
  return scene;
}

function GlbModel({
  source,
  controls,
  onRoot,
  ...group
}: GroupProps & { source: ModelSource; controls: RigControls; onRoot?: (root: Object3D) => void }) {
  const scene = useGlbScene(useModelUrl(source));
  const root = useMemo(() => prepareGlb(scene, source.manifest), [scene, source.manifest]);
  return <RiggedObject root={root} controls={controls} onRoot={onRoot} {...group} />;
}

function RiggedObject({
  root,
  controls,
  onRoot,
  ...group
}: GroupProps & { root: Object3D; controls: RigControls; onRoot?: (root: Object3D) => void }) {
  const rig = useMemo(() => collectRig(root), [root]);
  useEffect(() => onRoot?.(root), [root, onRoot]);
  useFrame((_, delta) => applyRig(rig, controls, delta));
  return (
    <group {...group}>
      <primitive object={root} />
    </group>
  );
}
