import type { AssetDto } from '@apex/contracts';
import type { ModelSource } from '@/three/models/product-model';

/** GLB-варианты продукта из API → источник модели для сцены; нет GLB — сцена рисует процедурную модель. */
export function modelSource(models: AssetDto[]): ModelSource | undefined {
  const glb = models.filter((m) => m.type === 'GLB');
  const desktop = glb.find((m) => m.variant === 'DESKTOP');
  if (!desktop) return undefined;
  const mobile = glb.find((m) => m.variant === 'MOBILE');
  return { url: desktop.url, ...(mobile ? { mobileUrl: mobile.url } : {}) };
}
