'use client';

import type { ModelPreset } from '@apex/contracts';
import { useFrame } from '@react-three/fiber';
import { Suspense, useEffect, useMemo, useRef } from 'react';
import { Color, MathUtils, type Group, type Vector3 } from 'three';
import { usePrefersReducedMotion } from '@/hooks/use-media-query';
import { gsap } from '@/lib/gsap';
import { scrollState, storyClock, useExperience, type Quality } from '@/stores/experience';
import { direct, type ActorPose, type StoryPose, type Vec3 } from '@/story/director';
import { createMaterialKit } from '../models/materials';
import { buildRdimmSimple, type ModelIdentity } from '../models/procedural';
import { ProductModel, type ModelSource } from '../models/product-model';
import { createRigControls, disposeModel } from '../models/rig';
import { LightBeam } from '../stage/beam';
import { DataStream } from '../stage/data-stream';
import { Dust } from '../stage/dust';
import { StudioLights } from '../stage/lights';
import { Podium } from '../stage/podium';
import { TraceField } from '../stage/trace-field';
import { AssemblyBoard } from './assembly-board';

export type StoryModel = { preset: ModelPreset; accent: string; accentAlt: string | null; identity: ModelIdentity; source?: ModelSource };
export type StoryModels = { venice: StoryModel; turin: StoryModel; memory: StoryModel; gpu: StoryModel };

const GHOST_X = [-2.25, -0.75, 0.75, 2.25];

function applyPose(group: Group | null, pose: ActorPose) {
  if (!group) return;
  group.position.set(...pose.position);
  group.rotation.set(...pose.rotation);
  group.scale.setScalar(Math.max(pose.scale, 1e-4));
  group.visible = pose.visibility > 0.01;
}

/**
 * Единая сцена главной: все экспонаты живут в одном Canvas, а их позы на каждом кадре
 * задаёт режиссёр (story/director.ts) по позиции скролла. Интро hero идёт по времени.
 */
export function StoryScene({ models, quality }: { models: StoryModels; quality: Quality }) {
  const phase = useExperience((s) => s.phase);
  const reducedMotion = usePrefersReducedMotion();

  const venice = useRef<Group>(null);
  const turin = useRef<Group>(null);
  const memory = useRef<Group>(null);
  const gpu = useRef<Group>(null);
  const pose = useRef<StoryPose | null>(null);
  const intro = useRef({ beam: 0, model: 0, traces: 0 });
  const started = useRef(false);
  const spin = useRef(-0.55);
  const streamSpeed = useRef(1);

  const controls = useMemo(
    () => ({
      venice: createRigControls(),
      turin: createRigControls(),
      memory: createRigControls(),
      gpu: createRigControls(),
    }),
    [],
  );

  // ── Четыре тусклых модуля сцены памяти: лёгкие процедурные, собираются один раз ──
  const extras = useMemo(() => {
    const dimKit = createMaterialKit(models.memory.accent);
    const ghosts = GHOST_X.map(() => buildRdimmSimple(dimKit, { dim: true }));
    return { ghosts, ghostMaterials: [dimKit.dimPcb, dimKit.dimMold] };
  }, [models.memory.accent]);

  useEffect(
    () => () => {
      for (const root of extras.ghosts) disposeModel(root);
    },
    [extras],
  );

  // ── Интро hero: по времени, стартует, когда уходит прелоадер ─────────────
  useEffect(() => {
    if (phase === 'loading' || started.current) return;
    started.current = true;
    const state = intro.current;
    if (reducedMotion) {
      Object.assign(state, { beam: 1, model: 1, traces: 1 });
      return;
    }
    const timeline = gsap
      .timeline()
      .to(state, { beam: 1, duration: 1.8, ease: 'power2.out' }, 0)
      .to(state, { model: 1, duration: 2.6, ease: 'expo.out' }, 0.35)
      .to(state, { traces: 1, duration: 1.6, ease: 'power2.out' }, 1.1);
    return () => {
      timeline.kill();
    };
  }, [phase, reducedMotion]);

  // Акценты продуктов в линейном RGB — режиссёр красит ими контровой свет сцен
  const accents = useMemo(() => {
    const rgb = (hex: string): Vec3 => new Color(hex).toArray() as Vec3;
    return { venice: rgb(models.venice.accent), memory: rgb(models.memory.accent), gpu: rgb(models.gpu.accent) };
  }, [models.venice.accent, models.memory.accent, models.gpu.accent]);

  const beamColor = useMemo(
    () => `#${new Color('#e6ecff').lerp(new Color(models.venice.accentAlt ?? models.venice.accent), 0.18).getHexString()}`,
    [models.venice.accent, models.venice.accentAlt],
  );

  useFrame((state, delta) => {
    if (!reducedMotion) spin.current += delta * 0.14;
    const aspect = state.size.width / Math.max(1, state.size.height);
    const p = direct({ clock: storyClock(), intro: intro.current, spin: spin.current, aspect, accents });
    pose.current = p;

    // Камера + лёгкий параллакс за курсором
    const parallax = reducedMotion ? 0 : 1;
    state.camera.position.set(
      p.camera.position[0] + state.pointer.x * 0.18 * parallax,
      p.camera.position[1] + state.pointer.y * 0.1 * parallax,
      p.camera.position[2],
    );
    state.camera.lookAt(...p.camera.target);

    // Экспонаты
    applyPose(venice.current, p.venice);
    applyPose(turin.current, p.turin);
    applyPose(memory.current, p.memory);
    applyPose(gpu.current, p.gpu);
    if (venice.current && !reducedMotion) {
      // Лёгкое «дыхание» экспоната в луче
      venice.current.position.y += Math.sin(state.clock.elapsedTime * 0.7) * 0.02 * p.stage.beam;
    }

    controls.venice.explode = p.venice.explode;
    const glow = controls.venice.glow;
    for (let i = 0; i < 8; i++) glow[`ccd.${i}`] = MathUtils.clamp(p.venice.lit - i, 0, 1);
    glow.iod = MathUtils.clamp(p.venice.lit - 7.5, 0, 1) * 2;
    glow.traces = Math.max(p.stage.floor, p.board.traces) * 0.7;

    controls.memory.explode = p.memory.explode;
    controls.memory.glow.tsv = p.memory.tsv;
    controls.memory.glow.edge = p.memory.edge;

    // Server Edition пассивная: вместо вентиляторов поток данных ускоряется от скорости скролла
    streamSpeed.current = MathUtils.damp(streamSpeed.current, 1 + Math.min(Math.abs(scrollState.velocity) * 5, 7), 2.5, delta);

    // Четыре тусклых модуля: ряд перед камерой, при схлопывании сходятся в центр
    const wide = aspect >= 1;
    extras.ghosts.forEach((ghost, i) => {
      ghost.visible = p.ghosts.visibility > 0.01;
      // На широком экране ряд справа от колонки текста; схлопывается туда же, где встаёт яркий модуль
      ghost.position.set(wide ? 0.75 + GHOST_X[i]! * 0.72 * p.ghosts.spread : GHOST_X[i]! * 0.42 * p.ghosts.spread, -0.3, 0.6);
      ghost.scale.setScalar((wide ? 0.62 : 0.3) * (0.4 + 0.6 * p.ghosts.spread));
    });
    for (const material of extras.ghostMaterials) material.opacity = 0.85 * p.ghosts.visibility;
  });

  const stage = () => pose.current?.stage;

  return (
    <>
      <StudioLights
        accent={models.venice.accent}
        getKey={() => intro.current.beam}
        getRim={(color) => {
          const rim = pose.current?.stage.rim;
          if (rim) color.setRGB(...rim);
        }}
      />
      <LightBeam color={beamColor} getOpacity={() => stage()?.beam ?? 0} />
      {quality !== 'low' && <Dust count={quality === 'high' ? 420 : 160} getOpacity={() => stage()?.dust ?? 0} />}
      <TraceField accent={models.venice.accent} y={-0.95} getIntensity={() => stage()?.floor ?? 0} />
      <Podium accent={models.venice.accent} getVisibility={() => stage()?.podium ?? 0} />
      {quality !== 'low' && (
        <DataStream
          count={quality === 'high' ? 520 : 200}
          color={models.gpu.accent}
          getIntensity={() => pose.current?.stream ?? 0}
          getSpeed={() => streamSpeed.current}
          getTarget={(out: Vector3) => {
            if (gpu.current) out.copy(gpu.current.position);
          }}
        />
      )}

      <group ref={venice}>
        <ProductModel {...models.venice} controls={controls.venice} />
      </group>
      <group ref={turin} visible={false}>
        <ProductModel {...models.turin} controls={controls.turin} />
      </group>
      <group ref={memory} visible={false}>
        <ProductModel {...models.memory} controls={controls.memory} />
      </group>
      <group ref={gpu} visible={false}>
        <ProductModel {...models.gpu} controls={controls.gpu} />
      </group>

      {extras.ghosts.map((ghost, i) => (
        <primitive key={`ghost-${i}`} object={ghost} visible={false} />
      ))}

      {/* Плата сцены сборки грузится после прелоадера: первому экрану она не нужна */}
      {phase !== 'loading' && (
        <Suspense fallback={null}>
          <AssemblyBoard accent={models.venice.accent} getPose={() => pose.current} />
        </Suspense>
      )}
    </>
  );
}
