import type { ModelPreset } from '@apex/contracts';
import { Group } from 'three';
import type { LabelLine } from '../labels';
import { createMaterialKit } from '../materials';
import { buildCpu } from './cpu';
import { buildGpu } from './gpu';
import { rounded } from './parts';
import { buildRdimm } from './rdimm';

/** Что написать на модели: берётся из данных продукта. */
export type ModelIdentity = { brand: string; name: string; codename?: string | null };

/** Маркировка по пресету: гравировка на крышке CPU, шильдик GPU, наклейка модуля памяти. */
export function markingFor(preset: ModelPreset, identity?: ModelIdentity): LabelLine[] {
  if (!identity) return [];
  const { brand, name, codename } = identity;
  switch (preset) {
    case 'CPU_SP7':
    case 'CPU_SP5': {
      const [family = name, ...rest] = name.split(' ');
      const socket = preset === 'CPU_SP7' ? 'SP7' : 'SP5';
      return [
        { text: `${brand.toUpperCase()} ${family.toUpperCase()}`, size: 78, weight: 700, tracking: 10 },
        { text: [rest.join(' '), codename?.toUpperCase()].filter(Boolean).join(' · '), size: 40, weight: 500, tracking: 6 },
        { text: `SOCKET ${socket}`, size: 26, weight: 500, tracking: 8, mono: true },
      ];
    }
    case 'GPU_DUAL_SLOT':
      return [{ text: `${brand.toUpperCase()}  ${name.replace(/\s*Blackwell$/i, '').toUpperCase()}`, size: 118, weight: 600, tracking: 18 }];
    case 'RDIMM':
      return [
        { text: brand, size: 88, weight: 700 },
        { text: `${name} · ECC · 9200 MT/s`, size: 52, weight: 500, mono: true },
      ];
    case 'MOTHERBOARD':
      return [];
  }
}

/**
 * Процедурная модель по пресету продукта — замена GLB, пока его нет.
 * Возвращает обычный Object3D с той же разметкой узлов, что и будущий GLB (см. rig.ts).
 */
export function buildProceduralModel(preset: ModelPreset, accent: string, identity?: ModelIdentity): Group {
  const kit = createMaterialKit(accent);
  const marking = markingFor(preset, identity);
  switch (preset) {
    case 'CPU_SP7':
      return buildCpu('SP7', kit, marking);
    case 'CPU_SP5':
      return buildCpu('SP5', kit, marking);
    case 'RDIMM':
      return buildRdimm(kit, marking);
    case 'GPU_DUAL_SLOT':
      return buildGpu(kit, marking);
    case 'MOTHERBOARD': {
      // Полноценная плата появится вместе с конфигуратором (этап 6)
      const board = new Group();
      board.name = 'motherboard';
      board.add(rounded('pcb', [2, 0.03, 1.7], 0.01, kit.pcb));
      return board;
    }
  }
}

export { CPU_CCD_COUNT } from './cpu';
