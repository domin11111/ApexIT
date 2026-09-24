'use client';

import type { ModelPreset } from '@apex/contracts';
import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import { Euler, Matrix4, Quaternion, Vector3, type InstancedMesh } from 'three';
import { buildProceduralModel, type ModelIdentity } from '../models/procedural';
import { disposeParts, disposeSource, flattenByMaterial } from './flatten';
import type { SlotPose } from './layout';

type Instance = {
  /** Занимает слот (иначе — улетает вверх и исчезает) */
  active: boolean;
  /** Ещё рисуется: влетает, стоит или улетает */
  alive: boolean;
  /** Пауза перед влётом — модули ставятся по очереди */
  delay: number;
  position: Vector3;
  pose: SlotPose;
};

type InstancedModelProps = {
  preset: ModelPreset;
  accent: string;
  identity?: ModelIdentity;
  /** Занятые слоты по порядку: первые poses.length экземпляров стоят на местах */
  poses: readonly SlotPose[];
  /** Ёмкость буфера экземпляров — постоянная, чтобы InstancedMesh не пересоздавался */
  capacity: number;
  /** С какой высоты влетает компонент */
  drop?: number;
  /** Задержка между соседними компонентами, с */
  stagger?: number;
  reducedMotion: boolean;
};

const EMPTY_POSE: SlotPose = { position: [0, 0, 0], rotation: [0, 0, 0], scale: 0 };

/**
 * Одинаковые компоненты сборки (процессоры, модули памяти, видеокарты), нарисованные экземплярами:
 * модель «запекается» один раз, а каждый экземпляр влетает в свой слот сверху с разворотом.
 * Убранные компоненты улетают обратно вверх. При prefers-reduced-motion — мгновенно.
 */
export function InstancedModel({
  preset,
  accent,
  identity,
  poses,
  capacity,
  drop = 2.6,
  stagger = 0.06,
  reducedMotion,
}: InstancedModelProps) {
  const brand = identity?.brand;
  const name = identity?.name;
  const codename = identity?.codename;
  const parts = useMemo(() => {
    const root = buildProceduralModel(preset, accent, brand && name ? { brand, name, codename } : undefined);
    const flat = flattenByMaterial(root);
    disposeSource(root, flat);
    return flat;
  }, [preset, accent, brand, name, codename]);
  useEffect(() => () => disposeParts(parts), [parts]);

  const meshes = useRef<Array<InstancedMesh | null>>([]);
  const instances = useRef<Instance[]>([]);
  // Сменилась модель (другой процессор) — все экземпляры влетают заново
  useEffect(() => {
    instances.current = Array.from({ length: capacity }, () => ({
      active: false,
      alive: false,
      delay: 0,
      position: new Vector3(),
      pose: EMPTY_POSE,
    }));
  }, [capacity, parts]);

  const scratch = useMemo(
    () => ({ matrix: new Matrix4(), quaternion: new Quaternion(), euler: new Euler(), scale: new Vector3(), goal: new Vector3() }),
    [],
  );

  useFrame((_, rawDelta) => {
    const list = instances.current;
    if (list.length === 0) return;
    const delta = Math.min(rawDelta, 0.05);
    const { matrix, quaternion, euler, scale, goal } = scratch;
    let entering = 0;
    let count = 0;

    for (let i = 0; i < list.length; i++) {
      const instance = list[i]!;
      const pose = poses[i];

      if (pose) {
        instance.pose = pose;
        if (!instance.active) {
          instance.active = true;
          instance.delay = reducedMotion ? 0 : entering * stagger;
          entering += 1;
          // Влетает сверху, если не был в полёте (иначе продолжает с текущего места)
          if (!instance.alive) instance.position.set(pose.position[0], pose.position[1] + drop, pose.position[2]);
          instance.alive = true;
        }
      } else {
        instance.active = false;
      }
      if (!instance.alive) continue;

      const [px, py, pz] = instance.pose.position;
      goal.set(px, instance.active ? py : py + drop, pz);
      let visible = true;
      if (instance.delay > 0) {
        instance.delay -= delta;
        visible = false;
      } else {
        const k = reducedMotion ? 1 : 1 - Math.exp(-delta * (instance.active ? 5.5 : 8));
        instance.position.lerp(goal, k);
      }

      // Доля пути до слота: 1 — на месте. По ней — разворот и масштаб в полёте
      const progress = 1 - Math.min(1, Math.abs(instance.position.y - py) / drop);
      if (!instance.active && progress < 0.03) {
        instance.alive = false;
        visible = false;
      }

      const [rx, ry, rz] = instance.pose.rotation;
      euler.set(rx + (1 - progress) * 0.35, ry + (1 - progress) * 1.1, rz);
      const s = visible ? instance.pose.scale * (0.75 + 0.25 * progress) : 0;
      matrix.compose(instance.position, quaternion.setFromEuler(euler), scale.setScalar(s));
      for (const mesh of meshes.current) mesh?.setMatrixAt(i, matrix);
      if (instance.alive) count = i + 1;
    }

    for (const mesh of meshes.current) {
      if (!mesh) continue;
      mesh.count = count;
      mesh.instanceMatrix.needsUpdate = true;
    }
  });

  return (
    <group>
      {parts.map((part, i) => (
        <instancedMesh
          key={`${part.material.uuid}-${capacity}`}
          ref={(mesh) => {
            meshes.current[i] = mesh;
            if (mesh) mesh.count = 0;
          }}
          args={[part.geometry, part.material, capacity]}
          // Экземпляры разлетаются по всей плате — ограничивающая сфера геометрии им не подходит
          frustumCulled={false}
        />
      ))}
    </group>
  );
}
