'use client';

import type { ModelPreset } from '@apex/contracts';
import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import { Color, MathUtils, type Group } from 'three';
import { usePrefersReducedMotion } from '@/hooks/use-media-query';
import { gsap } from '@/lib/gsap';
import { scrollState, useExperience, type Quality } from '@/stores/experience';
import { ProductModel } from '../models/product-model';
import type { ModelIdentity } from '../models/procedural';
import { createRigControls } from '../models/rig';
import { LightBeam } from '../stage/beam';
import { Dust } from '../stage/dust';
import { StudioLights } from '../stage/lights';
import { TraceField } from '../stage/trace-field';

export type HeroModel = {
  preset: ModelPreset;
  accent: string;
  accentAlt: string | null;
  identity: ModelIdentity;
};

type HeroSceneProps = HeroModel & { quality: Quality };

const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);

/**
 * Сцена 1 — Hero. Тьма → сверху проявляется луч → в нём, вращаясь, поднимается процессор,
 * затем загораются дорожки на «полу». Интро стартует, когда прелоадер уходит (phase ≠ loading).
 * Скролл hero (scrollState.hero) отводит камеру назад и приглушает луч.
 */
export function HeroScene({ preset, accent, accentAlt, identity, quality }: HeroSceneProps) {
  const phase = useExperience((s) => s.phase);
  const reducedMotion = usePrefersReducedMotion();
  const model = useRef<Group>(null);
  const intro = useRef({ beam: 0, model: 0, traces: 0 });
  const started = useRef(false);
  const spin = useRef(-0.55);
  const controls = useMemo(() => createRigControls(), []);

  // Луч белый с оттенком акцента продукта
  const beamColor = useMemo(() => `#${new Color('#e6ecff').lerp(new Color(accentAlt ?? accent), 0.18).getHexString()}`, [accent, accentAlt]);

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

  useFrame((state, delta) => {
    const { model: rise, traces } = intro.current;
    const scroll = scrollState.hero;

    // Камера: на узких экранах отходим дальше, чтобы процессор помещался по ширине
    const aspect = state.size.width / Math.max(1, state.size.height);
    const baseZ = aspect < 1 ? 7.6 / Math.max(aspect, 0.5) * 0.72 : 7.6;
    // Камера чуть сверху: видно и крышку, и «пол» из дорожек под экспонатом
    state.camera.position.set(0, 1.75 + scroll * 0.6, baseZ + scroll * 2.2);
    state.camera.lookAt(0, 0.12 - scroll * 0.35, 0);

    const node = model.current;
    if (node) {
      const t = easeOut(rise);
      if (!reducedMotion) spin.current += delta * 0.14;
      // Экспонат — между заголовком и подписями, чуть ниже центра кадра
      node.position.y = MathUtils.lerp(-1.6, 0.02, t) + (reducedMotion ? 0 : Math.sin(state.clock.elapsedTime * 0.7) * 0.025 * t);
      // «Вращаясь, появляется»: пока поднимается, докручивается на лишние пол-оборота
      node.rotation.y = spin.current + (1 - t) * 3.4;
      const tiltX = 0.32 + (reducedMotion ? 0 : state.pointer.y * 0.07);
      const tiltZ = reducedMotion ? 0 : -state.pointer.x * 0.05;
      node.rotation.x = MathUtils.damp(node.rotation.x, tiltX, 3, delta);
      node.rotation.z = MathUtils.damp(node.rotation.z, tiltZ, 3, delta);
    }

    controls.glow.traces = traces * 0.7;
  });

  const beamOpacity = () => intro.current.beam * (1 - scrollState.hero * 0.75);

  return (
    <>
      <StudioLights accent={accent} getKey={() => intro.current.beam} />
      <LightBeam color={beamColor} getOpacity={beamOpacity} />
      {quality !== 'low' && <Dust count={quality === 'high' ? 420 : 160} getOpacity={beamOpacity} />}
      <TraceField accent={accent} y={-0.95} getIntensity={() => intro.current.traces * (1 - scrollState.hero * 0.6)} />
      <group ref={model} position={[0, -1.6, 0]} rotation={[0.32, 0, 0]}>
        <ProductModel preset={preset} accent={accent} identity={identity} controls={controls} scale={0.95} />
      </group>
    </>
  );
}
