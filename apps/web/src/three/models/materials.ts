import { color as palette, scene } from '@apex/ui/tokens';
import { Color, MeshPhysicalMaterial, MeshStandardMaterial, type Texture } from 'three';
import { laminateTexture } from './textures';

/**
 * Набор материалов модели. Параметры — из токенов (@apex/ui scene.materials).
 * Для узлов с подсветкой материалы создаются отдельно (фабрики), чтобы rig управлял
 * яркостью каждого кристалла независимо.
 */
export function createMaterialKit(accent: string) {
  const m = scene.materials;
  const accentColor = new Color(accent);
  const laminate = laminateTexture(7);

  const physical = (params: ConstructorParameters<typeof MeshPhysicalMaterial>[0]) => new MeshPhysicalMaterial(params);

  return {
    accent: accentColor,

    ihs: physical({ ...m.ihsMetal }),
    substrate: physical({ ...m.substrate, ...(laminate ? { map: laminate } : {}) }),
    pcb: physical({ ...m.pcb, ...(laminate ? { map: laminate } : {}) }),
    gold: physical({ ...m.goldContact }),
    /** Чёрный компаунд корпусов микросхем */
    mold: physical({ color: '#0f1014', roughness: 0.55, metalness: 0.1, clearcoat: 0.35, clearcoatRoughness: 0.4 }),
    /** Керамические конденсаторы */
    ceramic: physical({ color: '#6f5d49', roughness: 0.5, metalness: 0.05 }),
    /** Анодированный кожух GPU */
    darkMetal: physical({ color: '#17181d', roughness: 0.42, metalness: 0.85, clearcoat: 0.5, clearcoatRoughness: 0.3 }),
    aluminum: physical({ color: '#a4a9b3', roughness: 0.32, metalness: 1 }),
    plastic: physical({ color: '#0d0e12', roughness: 0.75, metalness: 0 }),
    silicon: physical({ ...m.silicon }),

    /** Кристалл с подсветкой ядер (emissiveMap — сетка ядер). */
    die: (texture: Texture | null) =>
      physical({
        ...m.silicon,
        ...(texture ? { map: texture, emissiveMap: texture } : {}),
        emissive: accentColor,
        emissiveIntensity: 0,
      }),

    /** Светящийся элемент: яркость ведёт rig через emissiveIntensity, значения > 1 ловит bloom. */
    glow: () =>
      new MeshStandardMaterial({
        color: palette.bgVoid,
        emissive: accentColor,
        emissiveIntensity: 0,
        toneMapped: false,
      }),
  };
}

export type MaterialKit = ReturnType<typeof createMaterialKit>;
