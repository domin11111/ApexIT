import type { RootState } from '@react-three/fiber';

/** Общая настройка рендерера всех сцен (onCreated у Canvas). */
export function configureRenderer({ gl }: RootState) {
  // Проверка логов шейдеров — синхронный запрос к GPU на каждую программу; в продакшне она лишь тормозит первый кадр
  gl.debug.checkShaderErrors = process.env.NODE_ENV !== 'production';
}
