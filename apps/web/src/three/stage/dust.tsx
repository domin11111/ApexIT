'use client';

import { useFrame, useThree } from '@react-three/fiber';
import { useMemo } from 'react';
import { AdditiveBlending, BufferGeometry, Color, Float32BufferAttribute, ShaderMaterial } from 'three';
import { random, sharedUniforms } from '../shared';

type DustProps = {
  count: number;
  color?: string;
  getOpacity: () => number;
  /** Высоты конуса луча: частицы живут внутри него */
  top?: number;
  bottom?: number;
};

/**
 * Пылинки в луче. Движение целиком в вершинном шейдере (дрейф вверх с зацикливанием и лёгкое
 * покачивание), поэтому CPU каждый кадр не трогает ни одной частицы.
 */
export function Dust({ count, color = '#dfe6ff', getOpacity, top = 4.4, bottom = -1.9 }: DustProps) {
  const dpr = useThree((s) => s.viewport.dpr);
  const height = top - bottom;

  const geometry = useMemo(() => {
    const rnd = random(42);
    const positions: number[] = [];
    const seeds: number[] = [];
    for (let i = 0; i < count; i++) {
      // Равномерно по высоте, по радиусу — внутри конуса на этой высоте
      const h = rnd();
      const radius = (0.12 + (1 - h) * 1.43) * Math.sqrt(rnd()) * 0.85;
      const angle = rnd() * Math.PI * 2;
      positions.push(Math.cos(angle) * radius, h, Math.sin(angle) * radius);
      seeds.push(rnd());
    }
    const g = new BufferGeometry();
    g.setAttribute('position', new Float32BufferAttribute(positions, 3));
    g.setAttribute('aSeed', new Float32BufferAttribute(seeds, 1));
    return g;
  }, [count]);

  const material = useMemo(
    () =>
      new ShaderMaterial({
        uniforms: {
          uTime: sharedUniforms.uTime,
          uColor: { value: new Color(color) },
          uOpacity: { value: 0 },
          uPixelRatio: { value: dpr },
          uBottom: { value: bottom },
          uHeight: { value: height },
        },
        vertexShader: /* glsl */ `
          attribute float aSeed;
          uniform float uTime;
          uniform float uPixelRatio;
          uniform float uBottom;
          uniform float uHeight;
          varying float vAlpha;
          void main() {
            float h = fract(position.y + uTime * (0.006 + aSeed * 0.012));
            vec3 p = vec3(position.x, uBottom + h * uHeight, position.z);
            p.x += sin(uTime * 0.35 + aSeed * 40.0) * 0.04;
            p.z += cos(uTime * 0.28 + aSeed * 23.0) * 0.04;
            vec4 mv = modelViewMatrix * vec4(p, 1.0);
            gl_PointSize = (4.0 + aSeed * 7.0) * uPixelRatio / -mv.z;
            gl_Position = projectionMatrix * mv;
            // Гаснут у краёв по высоте, мерцают
            vAlpha = smoothstep(0.0, 0.15, h) * (1.0 - smoothstep(0.8, 1.0, h)) * (0.35 + 0.65 * abs(sin(uTime * 0.8 + aSeed * 12.0)));
          }
        `,
        fragmentShader: /* glsl */ `
          uniform vec3 uColor;
          uniform float uOpacity;
          varying float vAlpha;
          void main() {
            float d = length(gl_PointCoord - 0.5);
            float a = smoothstep(0.5, 0.0, d) * vAlpha * uOpacity * 0.6;
            gl_FragColor = vec4(uColor * a, a);
            #include <colorspace_fragment>
          }
        `,
        transparent: true,
        depthWrite: false,
        blending: AdditiveBlending,
        toneMapped: false,
      }),
    [color, dpr, bottom, height],
  );

  useFrame(() => {
    material.uniforms.uOpacity!.value = getOpacity();
  });

  return <points geometry={geometry} material={material} frustumCulled={false} renderOrder={3} />;
}
