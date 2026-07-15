import { useCallback } from 'react';
import { useAuth } from '@clerk/expo';

const BASE_URL = `https://${process.env.EXPO_PUBLIC_DOMAIN}`;

/**
 * Returns an `apiFetch` wrapper that attaches the Clerk Bearer token.
 * The returned function is memoized and stable across renders.
 */
export function useApi() {
  const { getToken } = useAuth();

  const apiFetch = useCallback(async function<T = unknown>(
    path: string,
    opts?: RequestInit,
  ): Promise<T> {
    const token = await getToken();
    const headers = new Headers(opts?.headers as HeadersInit | undefined);
    if (token) headers.set('Authorization', `Bearer ${token}`);
    if (opts?.body && !headers.has('Content-Type')) {
      headers.set('Content-Type', 'application/json');
    }
    const res = await fetch(`${BASE_URL}${path}`, { ...opts, headers });
    if (!res.ok) {
      let msg = `HTTP ${res.status}`;
      try { const j = await res.json(); msg = j.error ?? msg; } catch {}
      throw new Error(msg);
    }
    return res.json() as Promise<T>;
  }, [getToken]);

  return { apiFetch, BASE_URL };
}
