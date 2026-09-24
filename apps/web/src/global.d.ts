import type messages from '../messages/ru.json';
import type { routing } from './i18n/routing';

// Типизация next-intl: ключи сообщений и локали проверяются компилятором.
declare module 'next-intl' {
  interface AppConfig {
    Locale: (typeof routing.locales)[number];
    Messages: typeof messages;
  }
}
