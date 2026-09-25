'use client';

import { scene } from '@apex/ui/tokens';
import { Canvas } from '@react-three/fiber';
import { Suspense } from 'react';
import { useExperience, type Quality } from '@/stores/experience';
import { LoadBridge } from './stage/load-bridge';
import { PostFx, usesComposer } from './stage/post-fx';
import { DPR, QualityMonitor } from './stage/quality';
import { configureRenderer } from './stage/renderer';
import { SceneClock } from './stage/scene-clock';
import { SceneVignette } from './stage/scene-vignette';
import { Warmup } from './stage/warmup';
import { StoryScene, type StoryModels } from './story/story-scene';

/**
 * Единая WebGL-сцена главной: фиксирована на весь вьюпорт под HTML-секциями.
 * Скролл секций управляет сценой через scrollState, сам canvas событий не перехватывает.
 */
export default function HomeExperience({ models, ceiling }: { models: StoryModels; ceiling: Quality }) {
  const quality = useExperience((s) => s.quality);
  const setSceneWarm = useExperience((s) => s.setSceneWarm);

  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 z-[var(--z-canvas)]">
      <Canvas
        onCreated={configureRenderer}
        dpr={DPR[quality]}
        // Контекст создаётся один раз: MSAA — если устройство не тянет композер (его SMAA) изначально
        gl={{ antialias: !usesComposer(ceiling), alpha: false, powerPreference: 'high-performance', stencil: false }}
        camera={{ fov: 28, near: 0.1, far: 60, position: [0, 1.75, 7.6] }}
      >
        <color attach="background" args={[scene.clearColor]} />
        <fog attach="fog" args={[scene.clearColor, 10, 24]} />
        <SceneClock />
        <LoadBridge />
        <QualityMonitor ceiling={ceiling} />
        <Suspense fallback={null}>
          <Warmup offscreen={usesComposer(quality)} onReady={() => setSceneWarm(true)}>
            <StoryScene models={models} quality={quality} />
          </Warmup>
        </Suspense>
        <PostFx quality={quality} />
      </Canvas>
      {!usesComposer(quality) && <SceneVignette />}
    </div>
  );
}
