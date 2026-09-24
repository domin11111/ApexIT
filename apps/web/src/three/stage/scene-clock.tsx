'use client';

import { useFrame } from '@react-three/fiber';
import { sharedUniforms } from '../shared';

/** Одно время на все шейдеры сцены. */
export function SceneClock() {
  useFrame(({ clock }) => {
    sharedUniforms.uTime.value = clock.elapsedTime;
  });
  return null;
}
