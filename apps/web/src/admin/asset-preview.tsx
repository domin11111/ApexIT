'use client';

import { Bounds, OrbitControls } from '@react-three/drei';
import { Canvas } from '@react-three/fiber';
import { Suspense, useMemo, useRef } from 'react';
import type { ModelManifest } from '@/three/models/glb';
import { ProductModel } from '@/three/models/product-model';
import { createRigControls } from '@/three/models/rig';
import { StudioLights } from '@/three/stage/lights';

/**
 * Живое превью загруженной модели в админке: тот же загрузчик и манифест, что на сайте.
 * preserveDrawingBuffer — чтобы кадр можно было снять в PNG/WebP для превью-картинки.
 */
export default function AssetPreview({
  url,
  manifest,
  onCanvas,
}: {
  url: string;
  manifest: ModelManifest | undefined;
  onCanvas?: (canvas: HTMLCanvasElement) => void;
}) {
  const controls = useMemo(() => createRigControls(), []);
  const reported = useRef(false);
  return (
    <Canvas
      camera={{ fov: 32, position: [2.6, 1.8, 3.4] }}
      dpr={[1, 2]}
      gl={{ preserveDrawingBuffer: true, antialias: true }}
      onCreated={({ gl }) => {
        if (!reported.current) onCanvas?.(gl.domElement);
        reported.current = true;
      }}
    >
      <color attach="background" args={['#07070a']} />
      <StudioLights accent="#8e8e93" />
      <OrbitControls makeDefault enableDamping />
      <Suspense fallback={null}>
        <Bounds fit clip observe margin={1.2}>
          <ProductModel preset="CPU_SP7" accent="#8e8e93" controls={controls} source={{ url, ...(manifest ? { manifest } : {}) }} />
        </Bounds>
      </Suspense>
    </Canvas>
  );
}
