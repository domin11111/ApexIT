import { createHash } from 'node:crypto';
import { delimiter } from 'node:path';
import { ASSET_BUDGET } from '@apex/contracts';
import { Logger, NodeIO, type Document } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { cloneDocument, dedup, getBounds, meshopt, prune, simplify, textureCompress, weld } from '@gltf-transform/functions';
import draco3d from 'draco3dgltf';
import { MeshoptDecoder, MeshoptEncoder, MeshoptSimplifier } from 'meshoptimizer';
import sharp from 'sharp';
import type { Storage } from '../storage/storage';

/*
 * Пайплайн загруженной модели (B4): проверка формата → оптимизация (Meshopt, KTX2, упрощение
 * до бюджета) → мобильный вариант → публичные файлы с хешем в имени (кэш навсегда).
 * Функция чистая относительно БД: возвращает результат, запись в Asset делает воркер.
 */

/** Ошибка содержимого файла — объясняется пользователю, повторять задачу бессмысленно */
export class ModelError extends Error {}

export type ModelStats = {
  triangles: number;
  meshes: number;
  materials: number;
  textures: number;
  /** Габариты в единицах модели */
  size: [number, number, number];
  /** Именованные узлы — для манифеста (переименование под контракт rig) и хотспотов */
  nodes: string[];
};

export type ProcessedModel = {
  source: ModelStats & { bytes: number };
  desktop: { key: string; bytes: number; triangles: number; checksum: string };
  mobile: { key: string; bytes: number; triangles: number; checksum: string };
  ktx2: boolean;
  warnings: string[];
};

/** Мобильный вариант: не больше 60 тыс. треугольников и текстуры 1024 px */
const MOBILE_TRIANGLES = 60_000;
const DESKTOP_TEXTURE = 2048;
const MOBILE_TEXTURE = 1024;

let io: Promise<NodeIO> | undefined;
/** Draco и Meshopt — и для чтения сжатых исходников, и для записи результата */
function createIO(): Promise<NodeIO> {
  return (io ??= (async () => {
    await Promise.all([MeshoptDecoder.ready, MeshoptEncoder.ready, MeshoptSimplifier.ready]);
    return new NodeIO()
      .setLogger(new Logger(Logger.Verbosity.WARN))
      .registerExtensions(ALL_EXTENSIONS)
      .registerDependencies({
        'draco3d.decoder': await draco3d.createDecoderModule(),
        'draco3d.encoder': await draco3d.createEncoderModule(),
        'meshopt.decoder': MeshoptDecoder,
        'meshopt.encoder': MeshoptEncoder,
      });
  })());
}

export function modelStats(document: Document): ModelStats {
  const root = document.getRoot();
  let triangles = 0;
  // Считаем по узлам: одна сетка в трёх узлах рисуется трижды
  for (const node of root.listNodes()) {
    for (const primitive of node.getMesh()?.listPrimitives() ?? []) {
      const count = primitive.getIndices()?.getCount() ?? primitive.getAttribute('POSITION')?.getCount() ?? 0;
      // TRIANGLES (4) — основной режим; полосы и веера почти не встречаются в GLB
      if (primitive.getMode() === 4) triangles += Math.floor(count / 3);
    }
  }
  const scene = root.getDefaultScene() ?? root.listScenes()[0];
  const bounds = scene ? getBounds(scene) : { min: [0, 0, 0], max: [0, 0, 0] };
  return {
    triangles,
    meshes: root.listMeshes().length,
    materials: root.listMaterials().length,
    textures: root.listTextures().length,
    size: [0, 1, 2].map((i) => Math.round((bounds.max[i]! - bounds.min[i]!) * 1000) / 1000) as [number, number, number],
    nodes: [...new Set(root.listNodes().map((node) => node.getName()).filter(Boolean))].slice(0, 500),
  };
}

/** KTX-Software (утилита ktx) доступна? Папку из KTX_SOFTWARE_DIR добавляем в PATH процесса. */
export async function ktxAvailable(dir: string | undefined): Promise<boolean> {
  if (dir && !process.env.PATH?.includes(dir)) process.env.PATH = `${dir}${delimiter}${process.env.PATH ?? ''}`;
  try {
    const { checkKTXSoftware } = await import('@gltf-transform/cli');
    await checkKTXSoftware(new Logger(Logger.Verbosity.SILENT));
    return true;
  } catch {
    return false;
  }
}

/** Цветовые текстуры — ETC1S (компактно), данные (нормали, шероховатость) — UASTC (без артефактов). */
async function compressTextures(document: Document, size: number, ktx2: boolean): Promise<void> {
  if (document.getRoot().listTextures().length === 0) return;
  if (!ktx2) {
    await document.transform(textureCompress({ encoder: sharp, resize: [size, size] }));
    return;
  }
  const { toktx, Mode } = await import('@gltf-transform/cli');
  await document.transform(
    toktx({ encoder: sharp, mode: Mode.ETC1S, slots: /^(baseColor|emissive)/, resize: [size, size], quality: 192 }),
    toktx({ encoder: sharp, mode: Mode.UASTC, slots: /^(normal|occlusion|metallicRoughness)/, resize: [size, size], level: 2 }),
  );
}

const checksum = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');

export async function processModel({
  assetId,
  sourceKey,
  storage,
  ktxDir,
}: {
  assetId: string;
  sourceKey: string;
  storage: Storage;
  ktxDir: string | undefined;
}): Promise<ProcessedModel> {
  const bytes = await storage.get(sourceKey);
  const nodeIO = await createIO();

  let document: Document;
  try {
    document = await nodeIO.readBinary(bytes);
  } catch (err) {
    throw new ModelError(`Файл не читается как glTF 2.0 (GLB): ${(err as Error).message}`);
  }

  const source = { ...modelStats(document), bytes: bytes.byteLength };
  if (source.meshes === 0 || source.triangles === 0) throw new ModelError('В файле нет геометрии');

  const warnings: string[] = [];
  await document.transform(dedup(), prune(), weld());

  const mobile = cloneDocument(document);
  const ktx2 = await ktxAvailable(ktxDir);
  if (!ktx2) warnings.push('KTX-Software не найден — текстуры не сжаты в KTX2');

  // Десктоп: упрощаем только сверх бюджета треугольников
  if (source.triangles > ASSET_BUDGET.maxTriangles) {
    await document.transform(
      simplify({ simplifier: MeshoptSimplifier, ratio: ASSET_BUDGET.maxTriangles / source.triangles, error: 0.001 }),
    );
    warnings.push(`Треугольников было ${source.triangles} — упрощено до бюджета ${ASSET_BUDGET.maxTriangles}`);
  }
  await compressTextures(document, DESKTOP_TEXTURE, ktx2);
  await document.transform(meshopt({ encoder: MeshoptEncoder, level: 'medium' }));

  // Мобильный: жёстче по треугольникам и текстурам
  if (source.triangles > MOBILE_TRIANGLES) {
    await mobile.transform(simplify({ simplifier: MeshoptSimplifier, ratio: MOBILE_TRIANGLES / source.triangles, error: 0.01 }));
  }
  await compressTextures(mobile, MOBILE_TEXTURE, ktx2);
  await mobile.transform(meshopt({ encoder: MeshoptEncoder, level: 'high' }));

  const [desktopBytes, mobileBytes] = await Promise.all([nodeIO.writeBinary(document), nodeIO.writeBinary(mobile)]);
  if (desktopBytes.byteLength > ASSET_BUDGET.maxModelBytes) {
    warnings.push(`После сжатия ${(desktopBytes.byteLength / 1048576).toFixed(1)} МБ — больше бюджета 3 МБ`);
  }

  // Хеш в имени: файл по адресу никогда не меняется — CDN и браузер кэшируют навсегда
  const upload = async (variant: 'desktop' | 'mobile', data: Uint8Array, triangles: number) => {
    const sum = checksum(data);
    const key = `public/models/${assetId}/${variant}-${sum.slice(0, 12)}.glb`;
    await storage.put(key, data, 'model/gltf-binary', 'public, max-age=31536000, immutable');
    return { key, bytes: data.byteLength, triangles, checksum: sum };
  };

  return {
    source,
    desktop: await upload('desktop', desktopBytes, modelStats(document).triangles),
    mobile: await upload('mobile', mobileBytes, modelStats(mobile).triangles),
    ktx2,
    warnings,
  };
}
