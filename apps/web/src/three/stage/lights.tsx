'use client';

import { scene, type LightingPreset } from '@apex/ui/tokens';
import { Environment, Lightformer } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { useRef } from 'react';
import type { Color, DirectionalLight, SpotLight } from 'three';

type StudioLightsProps = {
  accent: string;
  preset?: LightingPreset;
  /** Множитель ключевого света 0…1 — для «проявления» луча в интро */
  getKey?: () => number;
  /** Цвет контрового света каждый кадр (акцент продукта текущей сцены) */
  getRim?: (color: Color) => void;
};

/**
 * Тёмный выставочный зал: ключевой прожектор сверху (он же луч), мягкое заполнение,
 * контровой свет в цвете акцента продукта. Отражения на металле дают софтбоксы
 * из Lightformer — окружение строится локально, без загрузки HDRI из сети.
 */
export function StudioLights({ accent, preset = 'studio', getKey, getRim }: StudioLightsProps) {
  const cfg = scene.lighting[preset];
  const key = useRef<SpotLight>(null);
  const rim = useRef<DirectionalLight>(null);

  useFrame(() => {
    if (key.current) key.current.intensity = cfg.key * (getKey?.() ?? 1);
    if (rim.current && getRim) getRim(rim.current.color);
  });

  return (
    <>
      <ambientLight intensity={0.03} />
      <spotLight
        ref={key}
        position={[0, 7, 0.8]}
        angle={0.3}
        penumbra={0.9}
        decay={0}
        intensity={0}
        color={cfg.tint}
      />
      <directionalLight position={[-3, 1.5, 3]} intensity={cfg.fill} color="#c9d3ff" />
      <directionalLight ref={rim} position={[0.5, 1.2, -4]} intensity={cfg.rim} color={accent} />

      {/* Окружение печётся один раз, поэтому кольцо в нём нейтрально-холодное: цвет сцены даёт контровой свет */}
      <Environment resolution={256} frames={1} environmentIntensity={cfg.environmentIntensity}>
        <Lightformer form="rect" intensity={2.6} position={[0, 5, 0]} rotation-x={Math.PI / 2} scale={[6, 2.5, 1]} />
        <Lightformer form="rect" intensity={1.1} position={[-5, 1, 1]} rotation-y={Math.PI / 2} scale={[4, 1, 1]} />
        <Lightformer form="rect" intensity={1.1} position={[5, 1, 1]} rotation-y={-Math.PI / 2} scale={[4, 1, 1]} />
        <Lightformer form="ring" color="#a9b8e8" intensity={1.3} position={[0, 0.5, -6]} scale={3} />
      </Environment>
    </>
  );
}
