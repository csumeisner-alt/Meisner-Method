import { useCallback } from 'react';
import { getAuthToken } from '@workspace/api-client-react';

const BASE_URL = `https://${process.env.EXPO_PUBLIC_DOMAIN}`;

/**
 * Returns an `apiFetch` wrapper that attaches a Bearer token.
 *
 * The token is resolved through the auth token getter registered on
 * `@workspace/api-client-react` (`setAuthTokenGetter`, wired up in the root
 * layout). This decouples `useApi` from Clerk entirely, so it works whether or
 * not a `ClerkProvider` is mounted — critical for the Expo Go dev path where
 * the app is previewed without logging in.
 *
 * `apiFetch` is referentially stable (empty `useCallback` deps) so that
 * `useEffect(..., [apiFetch])` consumers don't re-fire forever.
 */
export function useApi() {
  const apiFetch = useCallback(async function<T = unknown>(
    path: string,
    opts?: RequestInit,
  ): Promise<T> {
    const token = await getAuthToken();
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
