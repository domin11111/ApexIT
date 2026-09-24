'use client';

import { useFrame } from '@react-three/fiber';
import { useMemo } from 'react';
import { AdditiveBlending, Color, DoubleSide, ShaderMaterial } from 'three';
import { sharedUniforms } from '../shared';

type LightBeamProps = {
  color: string;
  /** Непрозрачность 0…1, читается каждый кадр */
  getOpacity: () => number;
  top?: number;
  bottom?: number;
};

/**
 * Луч прожектора сверху: открытый конус с аддитивным шейдером.
 * Ярче в центре (там, где поверхность смотрит на камеру) и у источника, мягко гаснет книзу.
 */
export function LightBeam({ color, getOpacity, top = 4.4, bottom = -1.9 }: LightBeamProps) {
  const height = top - bottom;
  const material = useMemo(
    () =>
      new ShaderMaterial({
        uniforms: {
          uTime: sharedUniforms.uTime,
          uColor: { value: new Color(color) },
          uOpacity: { value: 0 },
        },
        vertexShader: /* glsl */ `
          varying vec3 vNormalW;
          varying vec3 vPositionW;
          varying float vHeight;
          void main() {
            vHeight = uv.y;
            vec4 world = modelMatrix * vec4(position, 1.0);
            vPositionW = world.xyz;
            vNormalW = normalize(mat3(modelMatrix) * normal);
            gl_Position = projectionMatrix * viewMatrix * world;
          }
        `,
        fragmentShader: /* glsl */ `
          uniform float uTime;
          uniform vec3 uColor;
          uniform float uOpacity;
          varying vec3 vNormalW;
          varying vec3 vPositionW;
          varying float vHeight;
          void main() {
            vec3 viewDir = normalize(cameraPosition - vPositionW);
            float facing = abs(dot(normalize(vNormalW), viewDir));
            float core = pow(facing, 2.4);
            float along = smoothstep(0.0, 0.55, vHeight) * (0.3 + 0.7 * vHeight);
            float shimmer = 0.9 + 0.1 * sin(uTime * 1.3 + vPositionW.y * 2.7);
            float alpha = core * along * shimmer * uOpacity * 0.42;
            gl_FragColor = vec4(uColor * alpha, alpha);
            #include <colorspace_fragment>
          }
        `,
        transparent: true,
        depthWrite: false,
        blending: AdditiveBlending,
        side: DoubleSide,
        toneMapped: false,
      }),
    [color],
  );

  useFrame(() => {
    material.uniforms.uOpacity!.value = getOpacity();
  });

  return (
    <mesh position={[0, bottom + height / 2, 0]} material={material} renderOrder={2}>
      <cylinderGeometry args={[0.12, 1.55, height, 64, 1, true]} />
    </mesh>
  );
}
