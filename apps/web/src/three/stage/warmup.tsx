'use client';

import { useThree } from '@react-three/fiber';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  WebGLRenderTarget,
  type Group,
  type Material,
  type Mesh,
  type Object3D,
  type Texture,
} from 'three';

/** Дольше ждать фоновую компиляцию нет смысла: лучше один тяжёлый кадр, чем модель, которая не появилась. */
const COMPILE_TIMEOUT_MS = 4000;

/** Квант работы за кадр: на телефоне с 4-кратно медленным CPU это ~30 мс — ещё не «длинная задача». */
const SLICE_MS = 8;

const timeout = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
/** Следующий кадр: каждая порция работы — в своей задаче, без длинных блокировок главного потока. */
const nextFrame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

/** Всё, что three рисует материалом: для каждого объекта строится своя шейдерная программа. */
function collectRenderables(root: Group): Object3D[] {
  const out: Object3D[] = [];
  root.traverse((object) => {
    const o = object as Object3D & { isMesh?: boolean; isPoints?: boolean; isLine?: boolean; isSprite?: boolean };
    if (o.isMesh || o.isPoints || o.isLine || o.isSprite) out.push(object);
  });
  return out;
}

/** Счётчик кванта: true — время кадра вышло, пора уступить поток. */
function sliceTimer() {
  let start = performance.now();
  return {
    expired: () => performance.now() - start > SLICE_MS,
    reset: () => {
      start = performance.now();
    },
  };
}

function collectTextures(root: Group): Texture[] {
  const textures = new Set<Texture>();
  root.traverse((object) => {
    const material = (object as Mesh).material as Material | Material[] | undefined;
    if (!material) return;
    for (const m of Array.isArray(material) ? material : [material]) {
      for (const value of Object.values(m)) {
        if (value && (value as Texture).isTexture) textures.add(value as Texture);
      }
    }
  });
  return [...textures];
}

/**
 * Прогрев содержимого сцены перед показом. Без него первый кадр с моделью — одна длинная задача:
 * синхронная компиляция всех шейдеров и загрузка всех текстур на GPU (сотни мс на телефоне).
 *
 * 1. Текстуры загружаются на GPU (initTexture) квантами по ~8 мс за кадр.
 * 2. Шейдеры компилируются через compileAsync — тоже квантами: сборка исходников программ идёт
 *    на главном потоке, а саму компиляцию с KHR_parallel_shader_compile драйвер делает в фоне,
 *    мы лишь опрашиваем готовность.
 * 3. Только после этого группа становится видимой, и первый кадр с моделью уже дешёвый.
 *
 * offscreen — сцена рисуется в буфер постобработки: у таких программ другой ключ кэша
 * (линейный цвет, без тонмаппинга), поэтому компилируем их с тем же видом цели рендера.
 */
export function Warmup({
  children,
  offscreen,
  onReady,
}: {
  children: ReactNode;
  offscreen: boolean;
  onReady?: () => void;
}) {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  const camera = useThree((s) => s.camera);
  const group = useRef<Group>(null);
  const [ready, setReady] = useState(false);
  const done = useRef(false);
  const readyCallback = useRef(onReady);
  useEffect(() => {
    readyCallback.current = onReady;
  });

  useEffect(() => {
    const root = group.current;
    // Смена качества после показа не должна снова прятать модель
    if (!root || done.current) return;
    let cancelled = false;

    void (async () => {
      const slice = sliceTimer();
      for (const texture of collectTextures(root)) {
        if (cancelled) return;
        gl.initTexture(texture);
        if (slice.expired()) {
          await nextFrame();
          slice.reset();
        }
      }
      // Карта окружения собирается асинхронно (StudioEnvironment): материалы компилируем уже с ней
      const environment = scene.userData.environmentReady as Promise<void> | undefined;
      if (environment) await Promise.race([environment, timeout(COMPILE_TIMEOUT_MS)]);
      await nextFrame();
      if (cancelled) return;

      const target = offscreen ? new WebGLRenderTarget(1, 1) : null;
      // compile() внутри compileAsync синхронный: на это время группа (и ещё не прогретые внешние Warmup)
      // видимы — иначе их источники света не попадут в ключ программ, и шейдеры соберутся заново при показе
      const compile = (object: Object3D) => {
        const previous = gl.getRenderTarget();
        gl.setRenderTarget(target);
        const shown: Object3D[] = [];
        for (let node: Object3D | null = root; node; node = node.parent) {
          if (!node.visible && node.userData.warmup) {
            node.visible = true;
            shown.push(node);
          }
        }
        const pending = gl.compileAsync(object, camera, scene);
        for (const node of shown) node.visible = false;
        gl.setRenderTarget(previous);
        return pending;
      };

      const pending: Array<Promise<unknown>> = [];
      slice.reset();
      for (const object of collectRenderables(root)) {
        if (cancelled) return;
        pending.push(compile(object));
        if (slice.expired()) {
          await nextFrame();
          slice.reset();
        }
      }
      // Предохранитель: драйвер может так и не сообщить о готовности — тогда показываем как есть
      await Promise.race([Promise.all(pending), timeout(COMPILE_TIMEOUT_MS)]);
      target?.dispose();

      if (cancelled) return;
      // Ещё кадр: программы, собранные в фоне, «доезжают» до первого использования
      await nextFrame();
      if (cancelled) return;
      done.current = true;
      setReady(true);
      readyCallback.current?.();
    })();

    return () => {
      cancelled = true;
    };
  }, [gl, scene, camera, offscreen]);

  return (
    <group ref={group} visible={ready} userData={{ warmup: true }}>
      {children}
    </group>
  );
}
