'use client';

import { useFrame } from '@react-three/fiber';
import { useMemo } from 'react';
import { buildTraceGeometry, createTraceMaterial, generateTraces } from '../traces';

type TraceFieldProps = {
  accent: string;
  getIntensity: () => number;
  y?: number;
  count?: number;
};

/**
 * «Пол» зала — печатные дорожки, расходящиеся из-под экспоната. Импульсы бегут от центра
 * наружу; дальше 2–5 единиц узор растворяется в темноте.
 */
export function TraceField({ accent, getIntensity, y = -1.3, count = 64 }: TraceFieldProps) {
  const geometry = useMemo(
    () => buildTraceGeometry(generateTraces({ count, seed: 2026, inner: 0.9, outer: 5.5, step: 0.24 }), 0.014, 7),
    [count],
  );
  const material = useMemo(
    () => createTraceMaterial({ color: accent, intensity: 0, spacing: 2.4, speed: 0.22, fade: [1.8, 5] }),
    [accent],
  );

  useFrame(() => {
    material.uniforms.uIntensity!.value = getIntensity();
  });

  return <mesh geometry={geometry} material={material} position={[0, y, 0]} renderOrder={1} />;
}
