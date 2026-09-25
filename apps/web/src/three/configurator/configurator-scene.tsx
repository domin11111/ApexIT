'use client';

import type { ModelPreset } from '@apex/contracts';
import { scene } from '@apex/ui/tokens';
import { OrbitControls } from '@react-three/drei';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { Material, Texture, Vector3 } from 'three';
import type { Quality } from '@/stores/experience';
import { createMaterialKit } from '../models/materials';
import type { ModelIdentity } from '../models/procedural';
import type { ModelSource } from '../models/product-model';
import { StudioLights } from '../stage/lights';
import { LoadBridge } from '../stage/load-bridge';
import { PostFx } from '../stage/post-fx';
import { SceneClock } from '../stage/scene-clock';
import { InstancedModel } from './instanced-model';
import { cpuPose, dimmPose, gpuPose, serverLayout, type ServerLayoutInput } from './layout';
import { buildServerBoard, disposeBoard } from './server-board';

export type SceneComponent = {
  preset: ModelPreset;
  accent: string;
  identity: ModelIdentity;
  count: number;
  /** Модель из tools/blender или админки; без неё — процедурная по preset */
  source?: ModelSource | undefined;
};

export type ConfiguratorSceneProps = {
  layout: ServerLayoutInput;
  /** Акцент трасс платы — цвет выбранного процессора */
  accent: string;
  cpu: SceneComponent | null;
  memory: SceneComponent | null;
  gpu: SceneComponent | null;
  quality: Quality;
  reducedMotion: boolean;
};

/** Ёмкость буферов экземпляров: больше не бывает ни на одной плате каталога */
const CAPACITY = { cpu: 2, memory: 48, gpu: 16 } as const;
/** Направление камеры: спереди-справа и заметно сверху — плата читается как плата, а не как частокол модулей */
const VIEW_DIRECTION = new Vector3(0.42, 1.25, 0.95).normalize();

/**
 * 3D-превью конфигуратора: плата под выбранную платформу, компоненты влетают в свои слоты.
 * Камера подстраивается под размер платы (1P / 2P, число слотов), вращение — с ограничениями.
 */
export default function ConfiguratorScene(props: ConfiguratorSceneProps) {
  const container = useRef<HTMLDivElement>(null);
  const [inView, setInView] = useState(true);

  useEffect(() => {
    const el = container.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => setInView(Boolean(entry?.isIntersecting)),
      { rootMargin: '100px' },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={container} className="absolute inset-0" data-lenis-prevent>
      <Canvas
        frameloop={inView ? 'always' : 'never'}
        dpr={props.quality === 'high' ? [1, 2] : [1, 1.5]}
        gl={{ antialias: false, alpha: false, powerPreference: 'high-performance', stencil: false }}
        camera={{ fov: 30, near: 0.1, far: 60, position: [6, 8, 10] }}
      >
        <color attach="background" args={[scene.clearColor]} />
        <SceneClock />
        <LoadBridge />
        <ServerScene {...props} />
        <PostFx quality={props.quality} />
      </Canvas>
    </div>
  );
}

function ServerScene({
  layout: layoutInput,
  accent,
  cpu,
  memory,
  gpu,
  reducedMotion,
}: ConfiguratorSceneProps) {
  const { sockets, dimmsPerSocket, gpuSlots } = layoutInput;
  const layout = useMemo(
    () => serverLayout({ sockets, dimmsPerSocket, gpuSlots }),
    [sockets, dimmsPerSocket, gpuSlots],
  );

  // Материалы платы живут, пока не сменится акцент; сама плата пересобирается под раскладку
  const kit = useMemo(() => createMaterialKit(accent), [accent]);
  useEffect(
    () => () => {
      for (const value of Object.values(kit)) {
        if (!(value instanceof Material)) continue;
        for (const texture of Object.values(value))
          if (texture instanceof Texture) texture.dispose();
        value.dispose();
      }
    },
    [kit],
  );
  const board = useMemo(() => buildServerBoard(kit, layout), [kit, layout]);
  useEffect(() => () => disposeBoard(board), [board]);

  const poses = useMemo(
    () => ({
      cpu: layout.sockets.slice(0, cpu?.count ?? 0).map(cpuPose),
      memory: layout.dimms.slice(0, memory?.count ?? 0).map(dimmPose),
      gpu: layout.gpus.slice(0, gpu?.count ?? 0).map(gpuPose),
    }),
    [layout, cpu?.count, memory?.count, gpu?.count],
  );

  // ── Камера: вписать плату, плавно при смене платформы ─────────────────────
  const camera = useThree((s) => s.camera);
  const orbit = useThree((s) => s.controls) as unknown as {
    target: Vector3;
    update: () => void;
  } | null;
  const size = useThree((s) => s.size);
  const flight = useRef(true);
  const goal = useMemo(() => ({ position: new Vector3(), target: new Vector3() }), []);
  useEffect(() => {
    flight.current = true;
  }, [layout, size.width, size.height]);

  useFrame((_, delta) => {
    if (!orbit || !flight.current) return;
    // Узкое окно (телефон) — отходим дальше, чтобы плата влезла по ширине
    const aspect = size.width / size.height;
    const span = Math.max(layout.width, layout.depth * 0.9);
    const distance = (span * 1.6 + 1.2) * (aspect < 1.2 ? Math.min(1.9, 1.2 / aspect) : 1);
    goal.target.set(layout.center.x, 0.15, layout.center.z + 0.2);
    goal.position.copy(goal.target).addScaledVector(VIEW_DIRECTION, distance);
    const k = reducedMotion ? 1 : 1 - Math.exp(-delta * 2.5);
    camera.position.lerp(goal.position, k);
    orbit.target.lerp(goal.target, k);
    orbit.update();
    if (camera.position.distanceTo(goal.position) < 0.01) flight.current = false;
  });

  return (
    <>
      <StudioLights accent={accent} rimFollowsCamera />
      <OrbitControls
        makeDefault
        enableDamping
        dampingFactor={0.08}
        enablePan={false}
        minDistance={3}
        maxDistance={22}
        minPolarAngle={0.15}
        maxPolarAngle={Math.PI * 0.45}
        onStart={() => {
          flight.current = false;
        }}
      />
      <primitive object={board} />
      {/* GLB грузятся асинхронно: плата уже на месте, компоненты влетают, когда модель готова */}
      <Suspense fallback={null}>
        {cpu && (
          <InstancedModel
            preset={cpu.preset}
            accent={cpu.accent}
            identity={cpu.identity}
            source={cpu.source}
            poses={poses.cpu}
            capacity={CAPACITY.cpu}
            drop={3.2}
            stagger={0.2}
            reducedMotion={reducedMotion}
          />
        )}
        {memory && (
          <InstancedModel
            preset={memory.preset}
            accent={memory.accent}
            identity={memory.identity}
            source={memory.source}
            poses={poses.memory}
            capacity={CAPACITY.memory}
            drop={2.4}
            stagger={0.035}
            reducedMotion={reducedMotion}
          />
        )}
        {gpu && (
          <InstancedModel
            preset={gpu.preset}
            accent={gpu.accent}
            identity={gpu.identity}
            source={gpu.source}
            poses={poses.gpu}
            capacity={CAPACITY.gpu}
            drop={3}
            stagger={0.09}
            reducedMotion={reducedMotion}
          />
        )}
      </Suspense>
    </>
  );
}
