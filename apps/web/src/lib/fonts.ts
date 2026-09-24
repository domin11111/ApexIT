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

export const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin', 'cyrillic'],
  display: 'swap',
  variable: '--ff-jetbrains',
});
