import { loadCollection } from '@apex/collection';
import { ASSET_BUDGET, type ModelPreset } from '@apex/contracts';
import { InstancedMesh, Mesh, type BufferGeometry, type MeshPhysicalMaterial, type Object3D } from 'three';
import { describe, expect, it } from 'vitest';
import { applyRig, collectRig, createRigControls, nodeNames } from '../rig';
import { buildProceduralModel } from './index';

function triangles(root: Object3D): number {
  let total = 0;
  root.traverse((node) => {
    if (!(node instanceof Mesh)) return;
    const geometry = node.geometry;
    const perInstance = (geometry.index ? geometry.index.count : geometry.attributes.position!.count) / 3;
    total += perInstance * (node instanceof InstancedMesh ? node.count : 1);
  });
  return total;
}

const collection = loadCollection();
const PRESETS: ModelPreset[] = ['CPU_SP7', 'CPU_SP5', 'RDIMM', 'GPU_DUAL_SLOT'];

describe('процедурные модели', () => {
  it.each(collection.products.map((p) => [p.slug, p] as const))('%s: есть все узлы хотспотов', (_slug, product) => {
    const names = nodeNames(buildProceduralModel(product.modelPreset, product.accentColor));
    const anchors = product.hotspots.flatMap((h) => (h.anchorNode ? [h.anchorNode] : []));
    expect(anchors.length).toBeGreaterThan(0);
    for (const anchor of anchors) expect(names.has(anchor), anchor).toBe(true);
  });

  it.each(PRESETS)('%s укладывается в бюджет треугольников', (preset) => {
    expect(triangles(buildProceduralModel(preset, '#ffffff'))).toBeLessThan(ASSET_BUDGET.maxTriangles);
  });

  it('число чиплетов совпадает с данными коллекции', () => {
    const ccds = (preset: ModelPreset) => [...nodeNames(buildProceduralModel(preset, '#fff'))].filter((n) => /^ccd_\d+$/.test(n)).length;
    expect(ccds('CPU_SP7')).toBe(8); // Venice: 8 CCD × 32 ядра
    expect(ccds('CPU_SP5')).toBe(12); // EPYC 9965: 12 CCD × 16 ядер
  });

  it('разлёт: крышка процессора уходит вверх и в сторону, собранное положение восстанавливается', () => {
    const root = buildProceduralModel('CPU_SP7', '#fff');
    const rig = collectRig(root);
    const ihs = root.getObjectByName('ihs')!;
    const controls = createRigControls({ explode: 1 });
    applyRig(rig, controls, 0.016);
    expect(ihs.position.y).toBeGreaterThan(0.5);
    expect(ihs.position.x).toBeGreaterThan(0.5);
    controls.explode = 0;
    applyRig(rig, controls, 0.016);
    expect(ihs.position.toArray()).toEqual([0, 0, 0]);
  });

  it('подсветка: канал ccd.N управляет только своим чиплетом', () => {
    const root = buildProceduralModel('CPU_SP7', '#fff');
    const rig = collectRig(root);
    applyRig(rig, createRigControls({ glow: { 'ccd.2': 1 } }), 0.016);
    const intensity = (name: string) =>
      (root.getObjectByName(name) as Mesh<BufferGeometry, MeshPhysicalMaterial>).material.emissiveIntensity;
    expect(intensity('ccd_2')).toBeGreaterThan(0);
    expect(intensity('ccd_1')).toBe(0);
  });

  it('GPU — пассивная Server Edition: без вентиляторов, кожух и радиатор разбираются', () => {
    const root = buildProceduralModel('GPU_DUAL_SLOT', '#fff');
    const rig = collectRig(root);
    expect(rig.spin).toHaveLength(0);
    expect(rig.explode.map((part) => part.node.name).sort()).toEqual(['heatsink', 'shroud']);
  });
});
