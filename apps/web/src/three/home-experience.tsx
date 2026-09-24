'use client';

import { scene } from '@apex/ui/tokens';
import { Canvas } from '@react-three/fiber';
import { Suspense } from 'react';
import { useExperience, type Quality } from '@/stores/experience';
import { HeroScene, type HeroModel } from './scenes/hero-scene';
import { LoadBridge } from './stage/load-bridge';
import { PostFx } from './stage/post-fx';
import { DPR, QualityMonitor } from './stage/quality';
import { SceneClock } from './stage/scene-clock';

/**
 * Единая WebGL-сцена главной: фиксирована на весь вьюпорт под HTML-секциями.
 * Скролл секций управляет сценой через scrollState, сам canvas событий не перехватывает.
 * Сцены 2–7 добавятся на этапе 4 поверх того же Canvas.
 */
export default function HomeExperience({ hero, ceiling }: { hero: HeroModel; ceiling: Quality }) {
  const quality = useExperience((s) => s.quality);

  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 z-[var(--z-canvas)]">
      <Canvas
        dpr={DPR[quality]}
        gl={{ antialias: false, alpha: false, powerPreference: 'high-performance', stencil: false }}
        camera={{ fov: 28, near: 0.1, far: 60, position: [0, 0.55, 7.6] }}
      >
        <color attach="background" args={[scene.clearColor]} />
        <fog attach="fog" args={[scene.clearColor, 9, 22]} />
        <SceneClock />
        <LoadBridge />
        <QualityMonitor ceiling={ceiling} />
        <Suspense fallback={null}>
          <HeroScene {...hero} quality={quality} />
        </Suspense>
        <PostFx quality={quality} />
      </Canvas>
    </div>
  );
}
