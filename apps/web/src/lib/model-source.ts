import type { AssetDto } from '@apex/contracts';
import type { ModelManifest } from '@/three/models/glb';
import type { ModelSource } from '@/three/models/product-model';

/**
 * GLB-варианты продукта из API → источник модели для сцены; нет GLB — сцена рисует процедурную модель.
 * Манифест (оси, имена узлов, разметка rig) хранится у десктопного варианта: его задают в админке
 * для сторонних моделей; модели из tools/blender уже следуют контракту rig и обходятся без него.
 */
export function modelSource(models: AssetDto[]): ModelSource | undefined {
  const glb = models.filter((m) => m.type === 'GLB');
  const desktop = glb.find((m) => m.variant === 'DESKTOP');
  if (!desktop) return undefined;
  const mobile = glb.find((m) => m.variant === 'MOBILE');
  const manifest = desktop.meta.manifest as ModelManifest | undefined;
  return { url: desktop.url, ...(mobile ? { mobileUrl: mobile.url } : {}), ...(manifest ? { manifest } : {}) };
}
