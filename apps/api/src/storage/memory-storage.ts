import type { Storage } from './storage';

/** Хранилище в памяти для тестов: тот же интерфейс, что у S3. */
export function createMemoryStorage(base = 'http://assets.test'): Storage & { objects: Map<string, { body: Uint8Array; contentType: string }> } {
  const objects = new Map<string, { body: Uint8Array; contentType: string }>();
  return {
    objects,
    presignPut: async (key) => `${base}/upload/${key}?signature=test`,
    size: async (key) => objects.get(key)?.body.byteLength ?? null,
    async get(key) {
      const object = objects.get(key);
      if (!object) throw new Error(`Нет объекта ${key}`);
      return object.body;
    },
    async put(key, body, contentType) {
      objects.set(key, { body, contentType });
    },
    async delete(keys) {
      for (const key of keys) objects.delete(key);
    },
    publicUrl: (key) => `${base}/${key}`,
  };
}
