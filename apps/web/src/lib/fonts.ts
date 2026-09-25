import { Inter, JetBrains_Mono } from 'next/font/google';

/**
 * Inter с осью оптического размера: крупные заголовки получают дисплейное начертание
 * автоматически (font-optical-sizing: auto), поэтому отдельный «Inter Display» не нужен.
 * Имена CSS-переменных совпадают с --ff-* в @apex/ui/tokens.css.
 */
export const inter = Inter({
  subsets: ['latin', 'cyrillic'],
  axes: ['opsz'],
  display: 'swap',
  variable: '--ff-inter',
});

// Моноширинный тоже с preload: подписи первого экрана набраны им, и без preload запрос шрифта
// встаёт в цепочку HTML → CSS → шрифт (FCP в мобильном профиле Lighthouse растёт на ~0,4 с)
export const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin', 'cyrillic'],
  display: 'swap',
  variable: '--ff-jetbrains',
});
