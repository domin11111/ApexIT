'use client';

import { createPortal, useThree } from '@react-three/fiber';
import { useEffect, useLayoutEffect, useMemo, useState, type ReactNode } from 'react';
import {
  HalfFloatType,
  Mesh,
  NoToneMapping,
  PerspectiveCamera,
  PMREMGenerator,
  Scene,
  WebGLRenderTarget,
  type Material,
  type WebGLRenderer,
} from 'three';

/** Внутренности PMREMGenerator (three 0.186), нужные для заблаговременной компиляции его шейдеров. */
type PmremInternals = {
  _setSize?: (cubeSize: number) => void;
  _allocateTargets?: () => WebGLRenderTarget;
  _ggxMaterial?: Material | null;
  _lodMeshes?: Mesh[];
};

const nextFrame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

/**
 * Шейдеры, которыми PMREMGenerator сворачивает сцену в карту окружения: GGX-фильтр (большой цикл —
 * в ANGLE/D3D11 его синхронная сборка стоит сотни мс) и материалы самих софтбоксов.
 * compileAsync собирает их в фоне (KHR_parallel_shader_compile). Компилируем с той же целью рендера
 * и без тонмаппинга — как их потом рисует генератор, иначе ключи программ не совпадут.
 */
async function precompile(gl: WebGLRenderer, pmrem: PMREMGenerator, virtual: Scene, size: number) {
  const internals = pmrem as unknown as PmremInternals;
  const camera = new PerspectiveCamera();
  const target = new WebGLRenderTarget(1, 1, { type: HalfFloatType });
  const previous = gl.getRenderTarget();
  const toneMapping = gl.toneMapping;
  const pending: Array<Promise<unknown>> = [];

  gl.setRenderTarget(target);
  gl.toneMapping = NoToneMapping;
  pending.push(gl.compileAsync(virtual, camera));
  // Нет внутренних методов (другая версия three) — просто соберём окружение как есть
  if (internals._setSize && internals._allocateTargets) {
    internals._setSize(size);
    internals._allocateTargets().dispose();
    // Геометрия — та же, что у генератора: наличие атрибута position входит в ключ программы
    // (собственный _compileMaterial у PMREMGenerator берёт пустую геометрию и потому промахивается)
    const geometry = internals._lodMeshes?.[0]?.geometry;
    if (internals._ggxMaterial && geometry) pending.push(gl.compileAsync(new Mesh(geometry, internals._ggxMaterial), camera));
  }
  gl.toneMapping = toneMapping;
  gl.setRenderTarget(previous);

  // Драйвер может так и не сообщить о готовности — тогда соберём как есть, но не позже чем через 4 с
  await Promise.race([Promise.all(pending), new Promise((resolve) => setTimeout(resolve, 4000))]);
  target.dispose();
}

/**
 * Окружение из софтбоксов (Lightformer), свёрнутое в PMREM без длинной задачи на главном потоке.
 * Замена drei <Environment frames={1}>: тот отдаёт кубическую карту, и three сворачивает её
 * синхронно при первой компиляции материалов — вместе со сборкой GGX-шейдера это ~300 мс «замерзания».
 *
 * Готовность — промис в scene.userData.environmentReady: Warmup ждёт его, чтобы материалы модели
 * собрались уже с картой окружения (иначе ключи программ изменятся и сборка повторится при показе).
 */
export function StudioEnvironment({
  intensity,
  resolution = 256,
  children,
}: {
  intensity: number;
  resolution?: number;
  children: ReactNode;
}) {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  const virtual = useMemo(() => new Scene(), []);
  const [ready] = useState(() => {
    let resolve = () => {};
    const promise = new Promise<void>((r) => {
      resolve = r;
    });
    return { promise, resolve };
  });

  // Layout-эффект срабатывает раньше пассивных: Warmup увидит промис при первом же запуске
  useLayoutEffect(() => {
    scene.userData.environmentReady = ready.promise;
  }, [scene, ready]);

  useEffect(() => {
    let cancelled = false;
    let target: WebGLRenderTarget | null = null;
    const pmrem = new PMREMGenerator(gl);

    void (async () => {
      // Софтбоксы смонтированы в виртуальную сцену порталом — к следующему кадру они на месте
      await nextFrame();
      await precompile(gl, pmrem, virtual, resolution);
      if (cancelled) return;
      target = pmrem.fromScene(virtual, 0, 0.1, 100, { size: resolution });
      scene.environment = target.texture;
      ready.resolve();
    })();

    return () => {
      cancelled = true;
      if (target && scene.environment === target.texture) scene.environment = null;
      target?.dispose();
      pmrem.dispose();
    };
  }, [gl, scene, virtual, resolution, ready]);

  useEffect(() => {
    scene.environmentIntensity = intensity;
  }, [scene, intensity]);

  return createPortal(children, virtual);
}
