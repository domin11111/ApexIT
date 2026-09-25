import './globals.css';
import type { Metadata } from 'next';
import Link from 'next/link';
import { inter, jetbrainsMono } from '@/lib/fonts';

export const metadata: Metadata = {
  title: '404 — APEX // Compute Collection',
  robots: { index: false },
};

/**
 * 404 для адресов, не совпавших ни с одним маршрутом (включая пути вне локалей).
 * Рендерится без layout сайта — поэтому свой html, стили и шрифты; текст на обоих языках.
 */
export default function GlobalNotFound() {
  return (
    <html lang="ru" className={`${inter.variable} ${jetbrainsMono.variable}`}>
      <body>
        <main id="content" className="grid min-h-svh place-items-center px-[var(--layout-gutter)]">
          <div className="max-w-xl text-center">
            <p className="eyebrow mb-6">404</p>
            <h1 className="text-h1">Такой страницы нет в коллекции</h1>
            <p className="mt-4 text-body text-fg-secondary" lang="en">
              This page is not part of the collection.
            </p>
            <Link
              href="/"
              className="glass mt-10 inline-flex h-12 items-center rounded-pill px-6 text-small font-medium hover:text-accent"
            >
              На главную · Home
            </Link>
          </div>
        </main>
      </body>
    </html>
  );
}
