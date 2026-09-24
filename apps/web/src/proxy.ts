import createMiddleware from 'next-intl/middleware';
import { routing } from './i18n/routing';

// Next 16: бывший middleware.ts. Определяет локаль и переписывает / → /ru.
export default createMiddleware(routing);

export const config = {
  // Всё, кроме API, служебных путей Next и файлов с расширением (в т.ч. mockServiceWorker.js)
  matcher: '/((?!api|_next|_vercel|.*\\..*).*)',
};
