'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useEffect, useState, type ReactNode } from 'react';
import { SmoothScroll } from './smooth-scroll';

/**
 * MSW в браузере: включается NEXT_PUBLIC_API_MOCKING=enabled, пока нет NEXT_PUBLIC_API_URL.
 * Запросы TanStack Query ждут готовности воркера через mockingReady.
 */
const mockingEnabled =
  process.env.NEXT_PUBLIC_API_MOCKING === 'enabled' && !process.env.NEXT_PUBLIC_API_URL;

let mockingReady: Promise<void> | undefined;
export function whenMockingReady(): Promise<void> {
  if (!mockingEnabled || typeof window === 'undefined') return Promise.resolve();
  mockingReady ??= Promise.all([import('msw/browser'), import('@apex/mocks')]).then(
    async ([{ setupWorker }, { handlers }]) => {
      await setupWorker(...handlers).start({ onUnhandledRequest: 'bypass', quiet: true });
    },
  );
  return mockingReady;
}

export function AppProviders({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: { queries: { staleTime: 60_000, refetchOnWindowFocus: false } },
      }),
  );

  useEffect(() => {
    void whenMockingReady();
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <SmoothScroll>{children}</SmoothScroll>
    </QueryClientProvider>
  );
}
