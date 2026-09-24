'use client';

import type { ModelPreset } from '@apex/contracts';
import { scene } from '@apex/ui/tokens';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import type { Group } from 'three';
import type { Quality } from '@/stores/experience';
import type { ModelIdentity } from '../models/procedural';
import { ProductModel } from '../models/product-model';
import { createRigControls } from '../models/rig';
import { StudioLights } from '../stage/lights';
import { LoadBridge } from '../stage/load-bridge';
import { Podium } from '../stage/podium';
import { PostFx } from '../stage/post-fx';
import { SceneClock } from '../stage/scene-clock';

export type CompareModel = { slug: string; preset: ModelPreset; accent: string; identity: ModelIdentity };

type Props = { models: CompareModel[]; quality: Quality; reducedMotion: boolean };

/** Расстояние между моделями на подиуме */
const SPACING = 2.8;
/** Подиум (радиус 2.5) растягивается в эллипс под число моделей */
const PODIUM_RADIUS = 2.5;

/**
 * Сравнение (F5): модели стоят рядом на общем подиуме и вращаются синхронно —
 * одним углом, который крутит автоповорот или перетаскивание мышью/пальцем.
 */
export default function CompareStage({ models, quality, reducedMotion }: Props) {
  const container = useRef<HTMLDivElement>(null);
  const [inView, setInView] = useState(true);
  // Общий угол всех моделей и состояние перетаскивания — изменяемый объект, без ре-рендеров
  const spin = useRef({ angle: 0, dragging: false, lastX: 0, idleAt: 0 });

  useEffect(() => {
    const el = container.current;
    if (!el) return;
    const observer = new IntersectionObserver(([entry]) => setInView(Boolean(entry?.isIntersecting)), { rootMargin: '100px' });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={container}
      className="absolute inset-0 cursor-grab touch-pan-y active:cursor-grabbing"
      onPointerDown={(event) => {
        spin.current.dragging = true;
        spin.current.lastX = event.clientX;
        event.currentTarget.setPointerCapture(event.pointerId);
      }}
      onPointerMove={(event) => {
        const state = spin.current;
        if (!state.dragging) return;
        state.angle += (event.clientX - state.lastX) * 0.01;
        state.lastX = event.clientX;
      }}
      onPointerUp={() => {
        spin.current.dragging = false;
        spin.current.idleAt = performance.now();
      }}
      onPointerCancel={() => {
        spin.current.dragging = false;
      }}
    >
      <Canvas
        frameloop={inView ? 'always' : 'never'}
        dpr={quality === 'high' ? [1, 2] : [1, 1.5]}
        gl={{ antialias: false, alpha: false, powerPreference: 'high-performance', stencil: false }}
        camera={{ fov: 30, near: 0.1, far: 60, position: [0, 3, 9] }}
      >
        <color attach="background" args={[scene.clearColor]} />
        <SceneClock />
        <LoadBridge />
        <StudioLights accent={models[0]?.accent ?? '#ffffff'} />
        <Lineup models={models} spin={spin} reducedMotion={reducedMotion} />
        <PostFx quality={quality} />
      </Canvas>
    </div>
  );
}

function Lineup({
  models,
  spin,
  reducedMotion,
}: {
  models: CompareModel[];
  spin: RefObject<{ angle: number; dragging: boolean; lastX: number; idleAt: number }>;
  reducedMotion: boolean;
}) {
  const groups = useRef<Array<Group | null>>([]);
  const controls = useMemo(() => models.map(() => createRigControls()), [models]);
  const camera = useThree((s) => s.camera);
  const size = useThree((s) => s.size);

  const flat = models[0]?.preset.startsWith('CPU') ?? false;
  const width = (models.length - 1) * SPACING + 2.4;

  // Камера вписывает ряд моделей: процессоры — сверху в три четверти, карты и модули — спереди
  useEffect(() => {
    const aspect = size.width / size.height;
    const fovX = 2 * Math.atan(Math.tan((30 * Math.PI) / 360) * aspect);
    // Вписываем и по ширине ряда (модель при повороте занимает диагональ), и по высоте кадра
    const horizontal = (width / 2 + 1.4) / Math.tan(fovX / 2);
    const vertical = 1.9 / Math.tan((30 * Math.PI) / 360);
    const distance = Math.max(horizontal, vertical);
    const [y, z] = flat ? [distance * 0.62, distance * 0.8] : [distance * 0.28, distance * 0.96];
    camera.position.set(0, y, z);
    camera.lookAt(0, flat ? -0.2 : 0, 0);
  }, [camera, size.width, size.height, width, flat]);

  useFrame((_, delta) => {
    const state = spin.current;
    // Автоповорот, пока посетитель не крутит сам (и ещё 2 с после)
    if (!state.dragging && !reducedMotion && performance.now() - state.idleAt > 2000) state.angle += delta * 0.3;
    for (const group of groups.current) if (group) group.rotation.y = state.angle;
  });

  return (
    <>
      <group scale={[Math.max(1, width / (PODIUM_RADIUS * 2)), 1, 1]}>
        <Podium accent={models[0]?.accent ?? '#ffffff'} getVisibility={() => 1} y={flat ? -0.35 : -0.75} />
      </group>
      {models.map((model, i) => (
        <group key={model.slug} position={[(i - (models.length - 1) / 2) * SPACING, 0, 0]}>
          <group
            ref={(group) => {
              groups.current[i] = group;
            }}
          >
            <ProductModel preset={model.preset} accent={model.accent} identity={model.identity} controls={controls[i]!} />
          </group>
        </group>
      ))}
    </>
  );
}
