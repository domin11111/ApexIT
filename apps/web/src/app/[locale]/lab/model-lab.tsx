'use client';

import type { ModelPreset } from '@apex/contracts';
import { scene, type LightingPreset } from '@apex/ui/tokens';
import { OrbitControls } from '@react-three/drei';
import { Canvas } from '@react-three/fiber';
import { useTranslations } from 'next-intl';
import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import type { Object3D } from 'three';
import { buildProceduralModel, CPU_CCD_COUNT, type ModelIdentity } from '@/three/models/procedural';
import { ProductModel, type ModelSource } from '@/three/models/product-model';
import { createRigControls, nodeNames } from '@/three/models/rig';
import { StudioLights } from '@/three/stage/lights';
import { PostFx } from '@/three/stage/post-fx';
import { SceneClock } from '@/three/stage/scene-clock';

type LabProduct = { slug: string; label: string; preset: ModelPreset; accent: string; identity: ModelIdentity; source?: ModelSource };

const HOTSPOT_NODES = /^(ihs|ccd_\d+|iod_\d+|contacts|dram_stack_\d+|rcd|pmic|spd|gpu_die|vram|heatsink|pcie_edge|io_bracket|socket|dimm_slot_\d+|pcie_slot_\d+)$/;

export function ModelLab({ products }: { products: LabProduct[] }) {
  const t = useTranslations('lab');
  const [slug, setSlug] = useState(products[0]?.slug ?? '');
  const [explode, setExplode] = useState(0);
  const [glow, setGlow] = useState(0.6);
  const [spin, setSpin] = useState(true);
  const [lighting, setLighting] = useState<LightingPreset>('studio');
  const [glb, setGlb] = useState(true);
  const [glbNodes, setGlbNodes] = useState<string[]>([]);
  const product = products.find((p) => p.slug === slug) ?? products[0];
  const source = glb ? product?.source : undefined;

  // Один изменяемый объект на всё время жизни лаборатории — модель читает его каждый кадр
  const [controls] = useState(() => createRigControls());
  useEffect(() => {
    controls.explode = explode;
    controls.spin = spin ? 9 : 0;
    controls.glow = { ccd: glow, iod: glow * 0.6, traces: glow, tsv: glow, die: glow, vram: glow * 0.5, lightbar: glow };
  }, [controls, explode, spin, glow]);

  // Узлы для хотспотов: у GLB — из загруженной модели, у процедурной — из построенной заново
  const onRoot = useCallback((root: Object3D) => setGlbNodes([...nodeNames(root)]), []);
  const anchors = useMemo(() => {
    if (!product) return [];
    const names = source ? glbNodes : [...nodeNames(buildProceduralModel(product.preset, product.accent))];
    return names.filter((n) => HOTSPOT_NODES.test(n)).sort();
  }, [product, source, glbNodes]);

  if (!product) return null;

  return (
    <div className="relative h-full">
      <Canvas dpr={[1, 2]} camera={{ fov: 30, position: [2.6, 1.8, 4.2] }} gl={{ antialias: false }}>
        <color attach="background" args={[scene.clearColor]} />
        <SceneClock />
        <StudioLights accent={product.accent} preset={lighting} />
        <Suspense fallback={null}>
          <ProductModel
            key={`${product.slug}:${source ? 'glb' : 'procedural'}`}
            preset={product.preset}
            accent={product.accent}
            identity={product.identity}
            source={source}
            controls={controls}
            onRoot={source ? onRoot : undefined}
          />
        </Suspense>
        <OrbitControls enableDamping makeDefault minDistance={1.6} maxDistance={9} />
        <PostFx quality="high" />
      </Canvas>

      <aside className="glass absolute left-[var(--layout-gutter)] top-[calc(var(--layout-header-h)+1rem)] w-80 space-y-5 p-5 text-small">
        <h1 className="text-h3">{t('title')}</h1>

        <fieldset className="space-y-2">
          <legend className="eyebrow mb-2">{t('preset')}</legend>
          {products.map((p) => (
            <label key={p.slug} className="flex items-center gap-2">
              <input type="radio" name="model" checked={p.slug === slug} onChange={() => setSlug(p.slug)} />
              {p.label} <span className="font-mono text-caption text-fg-tertiary">{p.preset}</span>
            </label>
          ))}
        </fieldset>

        <label className="block space-y-1">
          <span className="eyebrow">{t('explode')} · {explode.toFixed(2)}</span>
          <input className="w-full" type="range" min={0} max={1} step={0.01} value={explode} onChange={(e) => setExplode(Number(e.target.value))} />
        </label>
        <label className="block space-y-1">
          <span className="eyebrow">{t('glow')} · {glow.toFixed(2)}</span>
          <input className="w-full" type="range" min={0} max={1} step={0.01} value={glow} onChange={(e) => setGlow(Number(e.target.value))} />
        </label>
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={spin} onChange={(e) => setSpin(e.target.checked)} />
          {t('spin')}
        </label>
        {product.source && (
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={glb} onChange={(e) => setGlb(e.target.checked)} />
            {t('glb')} <span className="font-mono text-caption text-fg-tertiary">{product.source.url.split('/').pop()}</span>
          </label>
        )}
        <label className="block space-y-1">
          <span className="eyebrow">{t('lighting')}</span>
          <select className="w-full rounded-sm bg-elevated px-2 py-1" value={lighting} onChange={(e) => setLighting(e.target.value as LightingPreset)}>
            {Object.keys(scene.lighting).map((preset) => (
              <option key={preset}>{preset}</option>
            ))}
          </select>
        </label>

        <div>
          <p className="eyebrow mb-2">{t('nodes')}</p>
          <p className="font-mono text-caption leading-relaxed text-fg-secondary">{anchors.join(' · ')}</p>
          {product.preset.startsWith('CPU') && (
            <p className="mt-2 font-mono text-caption text-fg-tertiary">
              CCD × {CPU_CCD_COUNT[product.preset === 'CPU_SP7' ? 'SP7' : 'SP5']}
            </p>
          )}
        </div>
      </aside>
    </div>
  );
}
