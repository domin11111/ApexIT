'use client';

import type { AdminMe } from '@apex/contracts';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { AdminApiError, adminFetch } from './api';

export const ME_KEY = ['admin', 'me'] as const;

/** Текущий пользователь; null — не вошёл. */
export function useMe() {
  return useQuery({
    queryKey: ME_KEY,
    queryFn: async () => {
      try {
        return await adminFetch<AdminMe>('/auth/me');
      } catch (error) {
        if (error instanceof AdminApiError && error.status === 401) return null;
        throw error;
      }
    },
  });
}

export function useLogout() {
  const client = useQueryClient();
  const router = useRouter();
  return async () => {
    await adminFetch('/auth/logout', 'POST', {}).catch(() => undefined);
    client.clear();
    router.replace('/admin/login');
  };
}
