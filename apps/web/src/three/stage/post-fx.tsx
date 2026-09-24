'use client';

import { scene } from '@apex/ui/tokens';
import { useThree } from '@react-three/fiber';
import { Bloom, ChromaticAberration, EffectComposer, SMAA, ToneMapping, Vignette } from '@react-three/postprocessing';
import { ToneMappingMode } from 'postprocessing';
import { useEffect, useMemo } from 'react';
import { ACESFilmicToneMapping, HalfFloatType, NoToneMapping, Vector2 } from 'three';
import type { Quality } from '@/stores/experience';

/**
 * Постобработка. Рендер идёт в HDR-буфер (HalfFloat), тонмаппинг ACES — последним эффектом,
 * поэтому bloom видит «честные» значения > 1 и светятся только эмиссивные элементы.
 * high — bloom + хроматическая аберрация по краям + виньетка + SMAA;
 * medium — без bloom и аберрации (телефоны, просадка FPS); low — без постобработки.
 */
export function PostFx({ quality }: { quality: Quality }) {
  const gl = useThree((s) => s.gl);
  const aberration = useMemo(() => new Vector2(0.0007, 0.0007), []);

  useEffect(() => {
    // Без композера тонмаппинг делает сам рендерер
    gl.toneMapping = quality === 'low' ? ACESFilmicToneMapping : NoToneMapping;
    return () => {
      gl.toneMapping = ACESFilmicToneMapping;
    };
  }, [gl, quality]);

  if (quality === 'low') return null;

  if (quality === 'medium') {
    return (
      <EffectComposer multisampling={0} frameBufferType={HalfFloatType} enableNormalPass={false}>
        <Vignette offset={0.28} darkness={0.78} />
        <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
        <SMAA />
      </EffectComposer>
    );
  }

  return (
    <EffectComposer multisampling={0} frameBufferType={HalfFloatType} enableNormalPass={false}>
      <Bloom
        mipmapBlur={scene.bloom.mipmapBlur}
        intensity={scene.bloom.intensity}
        luminanceThreshold={scene.bloom.luminanceThreshold}
        luminanceSmoothing={scene.bloom.luminanceSmoothing}
      />
      <ChromaticAberration offset={aberration} radialModulation modulationOffset={0.4} />
      <Vignette offset={0.28} darkness={0.78} />
      <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
      <SMAA />
    </EffectComposer>
  );
}
