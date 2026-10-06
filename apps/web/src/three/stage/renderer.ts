import type { RootState } from '@react-three/fiber';
import { useExperience } from '@/stores/experience';

/**
 * Программная растеризация вместо видеокарты: SwiftShader (Chrome без GPU, виртуалки, удалённый
 * рабочий стол), llvmpipe/softpipe (Linux), «Microsoft Basic Render» (Windows без драйвера).
 */
const SOFTWARE_RENDERER = /swiftshader|llvmpipe|softpipe|software rasterizer|basic render/i;

/** Имя рендерера контекста: расширение отдаёт его без маскировки, иначе — то, что раскрывает браузер. */
export function rendererName(context: WebGLRenderingContext | WebGL2RenderingContext): string {
  const info = context.getExtension('WEBGL_debug_renderer_info');
  return String(context.getParameter(info ? info.UNMASKED_RENDERER_WEBGL : context.RENDERER) ?? '');
}

export const isSoftwareRenderer = (name: string) => SOFTWARE_RENDERER.test(name);

/** Общая настройка рендерера всех сцен (onCreated у Canvas). */
export function configureRenderer({ gl }: RootState) {
  // Проверка логов шейдеров — синхронный запрос к GPU на каждую программу; в продакшне она лишь тормозит первый кадр
  gl.debug.checkShaderErrors = process.env.NODE_ENV !== 'production';

  // Без видеокарты сцена идёт кадр в секунды и подвешивает страницу — статичные рендеры честнее.
  // Узнаём это только по созданному контексту: заранее пробный контекст стоил бы десятки мс
  if (isSoftwareRenderer(rendererName(gl.getContext()))) useExperience.getState().setWebgl('unsupported');
}
