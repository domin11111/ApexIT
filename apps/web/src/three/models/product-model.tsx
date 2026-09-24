'use client';

import type { ModelPreset } from '@apex/contracts';
import { useGLTF } from '@react-three/drei';
import { useFrame, type ThreeElements } from '@react-three/fiber';
import { useEffect, useMemo } from 'react';
import type { Object3D } from 'three';
import { prepareGlb, type ModelManifest } from './glb';
import { buildProceduralModel, type ModelIdentity } from './procedural';
import { applyRig, collectRig, disposeModel, type RigControls } from './rig';

type GroupProps = ThreeElements['group'];

export type ModelSource = { url: string; manifest?: ModelManifest };

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

function GlbModel({
  source,
  controls,
  onRoot,
  ...group
}: GroupProps & { source: ModelSource; controls: RigControls; onRoot?: (root: Object3D) => void }) {
  // true, true — декодеры Draco и Meshopt (модели сжимает пайплайн загрузки, этап 7)
  const { scene } = useGLTF(source.url, true, true);
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
