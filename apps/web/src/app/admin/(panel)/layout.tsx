'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, type ReactNode } from 'react';
import { useLogout, useMe } from '@/admin/session';
import { Badge } from '@/admin/ui';
import { LogoMark } from '@/components/chrome/logo-mark';

const NAV: Array<{ href: string; label: string; adminOnly?: boolean }> = [
  { href: '/admin', label: 'Обзор' },
  { href: '/admin/leads', label: 'Заявки' },
  { href: '/admin/products', label: 'Продукты' },
  { href: '/admin/platforms', label: 'Платформы и платы' },
  { href: '/admin/assets', label: '3D-модели' },
  { href: '/admin/audit', label: 'Журнал', adminOnly: true },
  { href: '/admin/users', label: 'Пользователи', adminOnly: true },
  { href: '/admin/security', label: 'Безопасность' },
];

/** Оболочка админки: пускает только после входа и второго фактора, меню — по роли. */
export default function PanelLayout({ children }: { children: ReactNode }) {
  const me = useMe();
  const router = useRouter();
  const pathname = usePathname();
  const logout = useLogout();

  useEffect(() => {
    if (me.isSuccess && (!me.data || !me.data.mfaPassed)) router.replace('/admin/login');
  }, [me.isSuccess, me.data, router]);

  if (!me.data?.mfaPassed) {
    return <main className="grid min-h-svh place-items-center text-small text-fg-tertiary">{me.isError ? 'API недоступен' : 'Проверяем доступ…'}</main>;
  }

  const user = me.data;
  return (
    <div className="grid min-h-svh lg:grid-cols-[15rem_minmax(0,1fr)]">
      <aside className="border-b border-line p-4 lg:sticky lg:top-0 lg:h-svh lg:border-b-0 lg:border-r lg:p-6">
        <Link href="/admin" className="mb-6 flex items-center gap-3">
          <LogoMark className="size-7 text-fg" />
          <span className="font-medium">APEX Админка</span>
        </Link>
        <nav aria-label="Разделы" className="flex gap-1 overflow-x-auto lg:flex-col">
          {NAV.filter((item) => !item.adminOnly || user.role === 'ADMIN').map((item) => {
            const active = item.href === '/admin' ? pathname === '/admin' : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className="whitespace-nowrap rounded-lg px-3 py-2 text-small text-fg-secondary transition-colors hover:bg-white/5 hover:text-fg aria-[current=page]:bg-white/10 aria-[current=page]:text-fg"
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="mt-6 hidden border-t border-line pt-4 lg:block">
          <p className="truncate text-small">{user.email}</p>
          <div className="mt-2 flex items-center gap-2">
            <Badge tone={user.role === 'ADMIN' ? 'blue' : 'neutral'}>{user.role === 'ADMIN' ? 'Администратор' : 'Редактор'}</Badge>
            {!user.totpEnabled && <Badge tone="amber">без 2FA</Badge>}
          </div>
          <button type="button" onClick={() => void logout()} className="mt-4 text-small text-fg-tertiary hover:text-fg">
            Выйти
          </button>
          <Link href="/" className="mt-2 block text-small text-fg-tertiary hover:text-fg">
            На сайт ↗
          </Link>
        </div>
      </aside>
      <main className="min-w-0 p-4 lg:p-10">{children}</main>
    </div>
  );
}
