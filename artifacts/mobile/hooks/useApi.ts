import { useCallback, useRef } from 'react';
import { useAuth } from '@clerk/expo';

const BASE_URL = `https://${process.env.EXPO_PUBLIC_DOMAIN}`;

/**
 * Returns an `apiFetch` wrapper that attaches the Clerk Bearer token.
 *
 * IMPORTANT: `apiFetch` must be referentially stable for the lifetime of the
 * component. Clerk's `getToken` is NOT stable across renders, so we read it
 * through a ref and give `useCallback` an empty dependency array. If `apiFetch`
 * changed identity every render, any `useEffect(..., [apiFetch])` that calls it
 * and then setState would re-fire forever — an infinite request loop.
 */
export function useApi() {
  const { getToken } = useAuth();
  const getTokenRef = useRef(getToken);
  getTokenRef.current = getToken;

  const apiFetch = useCallback(async function<T = unknown>(
    path: string,
    opts?: RequestInit,
  ): Promise<T> {
    const token = await getTokenRef.current();
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
  }, []);

  return { apiFetch, BASE_URL };
}
