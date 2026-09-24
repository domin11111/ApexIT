import { z } from 'zod';

export const LOCALES = ['ru', 'en'] as const;
export const Locale = z.enum(LOCALES);
export type Locale = z.infer<typeof Locale>;
export const DEFAULT_LOCALE: Locale = 'ru';

export const Slug = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Только a-z, 0-9 и дефисы');

/** ?locale=en — у всех публичных GET-эндпоинтов. */
export const LocaleQuery = z.object({ locale: Locale.default('ru') });
export type LocaleQuery = z.infer<typeof LocaleQuery>;

export const HexColor = z.string().regex(/^#[0-9a-f]{6}$/i, 'Цвет в формате #rrggbb');

/**
 * Точка в пространстве 3D-модели: [x, y, z].
 * Соглашение для всех моделей (и процедурных, и GLB): Y — вверх, центр модели в начале координат,
 * наибольший габарит нормирован к 2 единицам.
 */
export const Vec3 = z.tuple([z.number(), z.number(), z.number()]);
export type Vec3 = z.infer<typeof Vec3>;

/** Бюджеты 3D-ассетов (раздел F3). Проверяет воркер загрузки. */
export const ASSET_BUDGET = {
  maxModelBytes: 3 * 1024 * 1024,
  maxTriangles: 150_000,
} as const;

/** Единый формат ошибки API. */
export const ApiError = z
  .object({
    error: z.object({
      code: z.string(),
      message: z.string(),
      details: z.unknown().optional(),
      requestId: z.string().optional(),
    }),
  })
  .meta({ id: 'ApiError' });
export type ApiError = z.infer<typeof ApiError>;
