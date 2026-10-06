import createMiddleware from 'next-intl/middleware';
import { routing } from './i18n/routing';

// Next 16: бывший middleware.ts. Определяет локаль и переписывает / → /ru.
export default createMiddleware(routing);

export const config = {
  // Всё, кроме API, админки (она без локалей), служебных путей Next и файлов с расширением.
  // '/' отдельно: с basePath (/app/components) общий шаблон не совпадает с корнем без слэша
  matcher: ['/', '/((?!api|admin|_next|_vercel|.*\\..*).*)'],
};
