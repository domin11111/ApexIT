'use client';

import { useFrame, useThree } from '@react-three/fiber';
import { useMemo } from 'react';
import { AdditiveBlending, BufferGeometry, Color, Float32BufferAttribute, ShaderMaterial, Vector3 } from 'three';
import { random, sharedUniforms } from '../shared';

type DataStreamProps = {
  count: number;
  color: string;
  /** Куда втекают данные (мировые координаты видеокарты) */
  getTarget: (out: Vector3) => void;
  getIntensity: () => number;
};

/**
 * Частицы-«данные», втекающие в видеокарту слева. Траектория и ускорение — в шейдере:
 * CPU каждый кадр обновляет только цель и интенсивность.
 */
export function DataStream({ count, color, getTarget, getIntensity }: DataStreamProps) {
  const dpr = useThree((s) => s.viewport.dpr);

  const geometry = useMemo(() => {
    const rnd = random(96);
    const positions: number[] = [];
    const seeds: number[] = [];
    for (let i = 0; i < count; i++) {
      // Разброс источника: широкий «фронт» слева
      positions.push((rnd() - 0.5) * 0.6, (rnd() - 0.5) * 2.6, (rnd() - 0.5) * 1.8);
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
          uColor: { value: new Color(color).multiplyScalar(2.2) },
          uIntensity: { value: 0 },
          uPixelRatio: { value: dpr },
          uFrom: { value: new Vector3(-5.5, 0.3, 0.6) },
          uTo: { value: new Vector3() },
        },
        vertexShader: /* glsl */ `
          attribute float aSeed;
          uniform float uTime;
          uniform float uPixelRatio;
          uniform vec3 uFrom;
          uniform vec3 uTo;
          varying float vAlpha;
          void main() {
            float t = fract(uTime * (0.1 + aSeed * 0.08) + aSeed);
            // Ускорение к цели: частицы «засасывает» в карту, разброс сходится в точку
            float k = t * t;
            vec3 p = mix(uFrom + position, uTo + position * 0.08, k);
            p.y += sin(t * 6.2832 + aSeed * 30.0) * 0.12 * (1.0 - k);
            vec4 mv = modelViewMatrix * vec4(p, 1.0);
            gl_PointSize = (2.5 + aSeed * 4.5) * uPixelRatio / -mv.z * (1.0 - k * 0.5) * 10.0;
            gl_Position = projectionMatrix * mv;
            vAlpha = smoothstep(0.0, 0.12, t) * (1.0 - smoothstep(0.88, 1.0, t));
          }
        `,
        fragmentShader: /* glsl */ `
          uniform vec3 uColor;
          uniform float uIntensity;
          varying float vAlpha;
          void main() {
            float d = length(gl_PointCoord - 0.5);
            float a = smoothstep(0.5, 0.05, d) * vAlpha * uIntensity;
            gl_FragColor = vec4(uColor * a, a);
            #include <colorspace_fragment>
          }
        `,
        transparent: true,
        depthWrite: false,
        blending: AdditiveBlending,
        toneMapped: false,
      }),
    [color, dpr],
  );

  useFrame(() => {
    const intensity = getIntensity();
    material.uniforms.uIntensity!.value = intensity;
    getTarget(material.uniforms.uTo!.value as Vector3);
  });

  return <points geometry={geometry} material={material} frustumCulled={false} renderOrder={4} />;
}
