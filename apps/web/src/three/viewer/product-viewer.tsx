'use client';

import type { HotspotDto, ModelPreset } from '@apex/contracts';
import { scene, type LightingPreset } from '@apex/ui/tokens';
import { OrbitControls } from '@react-three/drei';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Suspense, useCallback, useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { Color, Vector3, type Object3D } from 'three';
import { usePrefersReducedMotion } from '@/hooks/use-media-query';
import { gsap } from '@/lib/gsap';
import type { Quality } from '@/stores/experience';
import type { ModelIdentity } from '../models/procedural';
import { ProductModel, type ModelSource } from '../models/product-model';
import { createRigControls } from '../models/rig';
import { StudioLights } from '../stage/lights';
import { LoadBridge } from '../stage/load-bridge';
import { PostFx } from '../stage/post-fx';
import { SceneClock } from '../stage/scene-clock';

type Vec3 = [number, number, number];

/** Общий вид по типу модели: процессор — сверху в три четверти, модуль и карта — спереди. */
const OVERVIEW: Record<ModelPreset, { position: Vec3; target: Vec3 }> = {
  CPU_SP7: { position: [2.3, 2.5, 3.2], target: [0, 0, 0] },
  CPU_SP5: { position: [2.3, 2.5, 3.2], target: [0, 0, 0] },
  RDIMM: { position: [0.9, 0.7, 3.1], target: [0, 0, 0] },
  GPU_DUAL_SLOT: { position: [2.1, 0.9, 3.4], target: [0, 0, 0] },
  MOTHERBOARD: { position: [2.5, 3, 3.5], target: [0, 0, 0] },
};

export type ViewerProps = {
  /** source — загруженный GLB; без него рисуется процедурная модель по preset */
  model: { preset: ModelPreset; accent: string; identity: ModelIdentity; source?: ModelSource | undefined };
  hotspots: HotspotDto[];
  exploded: boolean;
  lighting: LightingPreset;
  activeHotspot: string | null;
  onHotspot: (key: string) => void;
  /** Увеличивается — камера возвращается к общему виду */
  resetSignal: number;
  quality: Quality;
};

/** Кнопки хотспотов по ключу — сцена двигает их каждый кадр */
type MarkerMap = Map<string, HTMLButtonElement>;

/**
 * Интерактивный просмотр продукта: вращение (OrbitControls с ограничениями и затуханием),
 * зум колесом, автоповорот в простое, хотспоты с подлётом камеры, разобранный вид и пресеты света.
 *
 * Хотспоты — обычные кнопки в DOM поверх канваса (один React-корень, нормальный порядок табуляции);
 * сцена проецирует их точки на экран и пишет transform напрямую, без ре-рендеров.
 */
export default function ProductViewer(props: ViewerProps) {
  const container = useRef<HTMLDivElement>(null);
  const [inView, setInView] = useState(true);

  // Ушли вниз к характеристикам — не тратим GPU на невидимую сцену
  useEffect(() => {
    const el = container.current;
    if (!el) return;
    const observer = new IntersectionObserver(([entry]) => setInView(Boolean(entry?.isIntersecting)), { rootMargin: '100px' });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const overview = OVERVIEW[props.model.preset];
  const markers = useRef<MarkerMap>(new Map());

  return (
    <div ref={container} className="absolute inset-0 overflow-hidden" data-lenis-prevent>
      <Canvas
        frameloop={inView ? 'always' : 'never'}
        dpr={props.quality === 'high' ? [1, 2] : [1, 1.5]}
        gl={{ antialias: false, alpha: false, powerPreference: 'high-performance', stencil: false }}
        camera={{ fov: 32, near: 0.05, far: 40, position: overview.position }}
      >
        <color attach="background" args={[scene.clearColor]} />
        <SceneClock />
        <LoadBridge />
        <ViewerScene {...props} markers={markers} />
        <PostFx quality={props.quality} />
      </Canvas>
      <div className="pointer-events-none absolute inset-0">
        {props.hotspots.map((hotspot, i) => (
          <button
            key={hotspot.key}
            ref={(el) => {
              if (el) markers.current.set(hotspot.key, el);
              else markers.current.delete(hotspot.key);
            }}
            type="button"
            onClick={() => props.onHotspot(hotspot.key)}
            aria-label={hotspot.title}
            aria-pressed={hotspot.key === props.activeHotspot}
            // До первой проекции кнопка скрыта — не мигает в левом верхнем углу
            style={{ opacity: 0 }}
            className="absolute left-0 top-0 -ml-4 -mt-4 grid size-8 place-items-center rounded-full border border-fg/60 bg-void/60 font-mono text-caption text-fg backdrop-blur-sm transition-[scale,background-color] duration-[var(--dur-base)] will-change-transform hover:scale-110 aria-pressed:scale-110 aria-pressed:bg-accent aria-pressed:text-void"
          >
            <span aria-hidden className="absolute inset-0 rounded-full border border-accent opacity-40 motion-safe:animate-ping" />
            {i + 1}
          </button>
        ))}
      </div>
    </div>
  );
}

function ViewerScene({ model, hotspots, exploded, lighting, activeHotspot, resetSignal, markers }: ViewerProps & { markers: RefObject<MarkerMap> }) {
  const reducedMotion = usePrefersReducedMotion();
  const controls = useMemo(() => createRigControls(), []);
  const camera = useThree((s) => s.camera);
  const size = useThree((s) => s.size);
  // OrbitControls с makeDefault доступны из состояния R3F — без импорта типов three-stdlib
  const orbit = useThree((s) => s.controls) as unknown as { target: Vector3; update: () => void } | null;
  const overview = OVERVIEW[model.preset];

  // ── Модель и якоря хотспотов ──────────────────────────────────────────────
  const anchors = useRef(new Map<string, { node: Object3D; rest: Vector3 }>());
  const onRoot = useCallback(
    (root: Object3D) => {
      root.updateMatrixWorld(true);
      anchors.current.clear();
      for (const hotspot of hotspots) {
        const node = hotspot.anchorNode ? root.getObjectByName(hotspot.anchorNode) : undefined;
        if (node) anchors.current.set(hotspot.key, { node, rest: node.getWorldPosition(new Vector3()) });
      }
    },
    [hotspots],
  );

  /** Точка хотспота сейчас: авторская позиция + смещение его узла при разборке. */
  const hotspotPoint = useCallback((hotspot: HotspotDto, out: Vector3) => {
    out.set(...hotspot.position);
    const anchor = anchors.current.get(hotspot.key);
    if (anchor) out.add(anchor.node.getWorldPosition(new Vector3()).sub(anchor.rest));
    return out;
  }, []);

  // ── Разобранный вид и подсветка внутренностей ────────────────────────────
  useEffect(() => {
    const tween = gsap.to(controls, { explode: exploded ? 1 : 0, duration: reducedMotion ? 0 : 1.4, ease: 'expo.inOut' });
    return () => {
      tween.kill();
    };
  }, [controls, exploded, reducedMotion]);

  useFrame(() => {
    const e = controls.explode;
    controls.glow = { ccd: e, iod: e * 0.6, tsv: e, die: e * 0.8, vram: e * 0.5, traces: 0.35 + e * 0.5, edge: 0.5 };
  });

  // ── Хотспоты: проекция точек на экран ─────────────────────────────────────
  const projected = useMemo(() => new Vector3(), []);
  useFrame(() => {
    const e = controls.explode;
    for (const hotspot of hotspots) {
      const el = markers.current.get(hotspot.key);
      if (!el) continue;
      hotspotPoint(hotspot, projected).project(camera);
      const x = (projected.x * 0.5 + 0.5) * size.width;
      const y = (-projected.y * 0.5 + 0.5) * size.height;
      el.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0)`;
      // Детали под крышкой видны только в разобранном виде, крышка — только в собранном; за камерой — скрыты
      const shown = hotspot.visibility === 'EXPLODED' ? e : hotspot.visibility === 'ASSEMBLED' ? 1 - e : 1;
      const visibility = projected.z > 1 ? 0 : shown;
      el.style.opacity = String(visibility);
      el.style.pointerEvents = visibility > 0.5 ? 'auto' : 'none';
      el.tabIndex = visibility > 0.5 ? 0 : -1;
    }
  });

  // ── Камера: подлёт к хотспоту / возврат к общему виду ─────────────────────
  const flight = useRef<{ active: boolean; key: string | null }>({ active: false, key: null });
  useEffect(() => {
    flight.current = { active: true, key: activeHotspot };
  }, [activeHotspot, resetSignal]);

  const goal = useMemo(() => ({ position: new Vector3(), target: new Vector3() }), []);
  useFrame((_, delta) => {
    const orbitControls = orbit;
    if (!orbitControls || !flight.current.active) return;
    const hotspot = hotspots.find((h) => h.key === flight.current.key);
    if (hotspot) {
      hotspotPoint(hotspot, goal.target);
      // Камера держит авторское смещение относительно детали — и следует за ней при разборке
      goal.position.copy(goal.target).add(new Vector3(...hotspot.cameraPosition).sub(new Vector3(...hotspot.position)));
    } else {
      // Узкое окно (телефон, портрет) — камера отходит дальше, чтобы длинная модель влезла по ширине
      const aspect = size.width / size.height;
      goal.position.set(...overview.position).multiplyScalar(aspect < 1.2 ? Math.min(1.8, 1.2 / aspect) : 1);
      goal.target.set(...overview.target);
    }
    const k = reducedMotion ? 1 : 1 - Math.exp(-delta * 3.2);
    camera.position.lerp(goal.position, k);
    orbitControls.target.lerp(goal.target, k);
    orbitControls.update();
    // Долетели — отдаём камеру пользователю
    if (camera.position.distanceTo(goal.position) < 0.01 && controls.explode % 1 === 0) flight.current.active = false;
  });

  // ── Автоповорот в простое ─────────────────────────────────────────────────
  const [idle, setIdle] = useState(true);
  const idleTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const onStart = () => {
    flight.current.active = false;
    clearTimeout(idleTimer.current);
    setIdle(false);
  };
  const onEnd = () => {
    clearTimeout(idleTimer.current);
    idleTimer.current = setTimeout(() => setIdle(true), 4000);
  };
  useEffect(() => () => clearTimeout(idleTimer.current), []);

  const rim = useMemo(() => new Color(model.accent), [model.accent]);

  return (
    <>
      <StudioLights accent={model.accent} preset={lighting} getRim={(color) => color.copy(rim)} rimFollowsCamera />
      <OrbitControls
        makeDefault
        enableDamping
        dampingFactor={0.08}
        enablePan={false}
        minDistance={1.4}
        maxDistance={7}
        minPolarAngle={0.12}
        maxPolarAngle={Math.PI * 0.85}
        autoRotate={idle && !activeHotspot && !reducedMotion}
        autoRotateSpeed={0.5}
        onStart={onStart}
        onEnd={onEnd}
      />
      {/* GLB грузится асинхронно: свет и камера работают сразу, модель появляется по готовности */}
      <Suspense fallback={null}>
        <ProductModel {...model} controls={controls} onRoot={onRoot} />
      </Suspense>
    </>
  );
}
