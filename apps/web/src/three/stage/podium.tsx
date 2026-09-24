'use client';

import { scene } from '@apex/ui/tokens';
import { useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import { MeshPhysicalMaterial, type Group } from 'three';
import { buildTraceGeometry, createTraceMaterial, type TracePath } from '../traces';

const RADIUS = 2.5;

function circle(radius: number, segments = 96): TracePath {
  return Array.from({ length: segments + 1 }, (_, i) => {
    const angle = (i / segments) * Math.PI * 2;
    return [Math.cos(angle) * radius, Math.sin(angle) * radius] as [number, number];
  });
}

/** Подиум сцены поколений: тёмный глянцевый диск с бегущей по кромке дорожкой. */
export function Podium({ accent, getVisibility, y = -0.7 }: { accent: string; getVisibility: () => number; y?: number }) {
  const group = useRef<Group>(null);
  // Почти не металлический: иначе диск целиком отражает цветной контровой софтбокс
  const top = useMemo(
    () =>
      new MeshPhysicalMaterial({
        color: scene.materials.substrate.color,
        roughness: 0.55,
        metalness: 0.15,
        clearcoat: 0.6,
        clearcoatRoughness: 0.25,
        transparent: true,
        opacity: 0,
      }),
    [],
  );
  const ringGeometry = useMemo(() => buildTraceGeometry([circle(RADIUS - 0.06), circle(RADIUS - 0.22)], 0.014, 5), []);
  const ring = useMemo(() => createTraceMaterial({ color: accent, intensity: 0, spacing: 3.2, speed: 0.25 }), [accent]);

  useFrame(() => {
    const visibility = getVisibility();
    top.opacity = visibility;
    ring.uniforms.uIntensity!.value = visibility;
    if (group.current) group.current.visible = visibility > 0.01;
  });

  return (
    <group ref={group} position={[0, y, 0]}>
      <mesh material={top}>
        <cylinderGeometry args={[RADIUS, RADIUS * 1.02, 0.08, 96]} />
      </mesh>
      <mesh geometry={ringGeometry} material={ring} position={[0, 0.041, 0]} renderOrder={1} />
    </group>
  );
}
