import '../globals.css';
import { color } from '@apex/ui/tokens';
import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import { AdminProviders } from '@/admin/providers';
import { inter, jetbrainsMono } from '@/lib/fonts';

export const metadata: Metadata = {
  title: { default: 'Админка', template: '%s — APEX Админка' },
  // Закрытый раздел: не индексируется и не попадает в предпросмотры
  robots: { index: false, follow: false },
};

export const viewport: Viewport = { themeColor: color.bgVoid, colorScheme: 'dark' };

/** Отдельный корневой layout: без локалей, прелоадера, плавного скролла и 3D-сцены сайта. */
export default function AdminRootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ru" className={`${inter.variable} ${jetbrainsMono.variable}`}>
      <body>
        <AdminProviders>{children}</AdminProviders>
      </body>
    </html>
  );
}
