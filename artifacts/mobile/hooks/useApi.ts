import { useCallback } from 'react';
const BASE_URL = `https://${process.env.EXPO_PUBLIC_DOMAIN}`;

/**
 * Error thrown by `apiFetch` for non-2xx responses. Carries the HTTP status
 * so callers can distinguish auth failures (401), temporary server
 * unavailability (503), and genuine network/server errors.
 */
export class ApiError extends Error {
  constructor(message: string, public readonly status: number) {
    super(message);
    this.name = 'ApiError';
  }
}

/**
 * Returns a guest-safe API wrapper. Public market-data routes continue to work
 * normally; user-scoped calls are intentionally best-effort and fall back to
 * local mobile state rather than opening an account or showing a login wall.
 *
 * `apiFetch` is referentially stable (empty `useCallback` deps) so that
 * `useEffect(..., [apiFetch])` consumers don't re-fire forever.
 */
export function useApi() {
  const apiFetch = useCallback(async function<T = unknown>(
    path: string,
    opts?: RequestInit,
  ): Promise<T> {
    const headers = new Headers(opts?.headers as HeadersInit | undefined);
    if (opts?.body && !headers.has('Content-Type')) {
      headers.set('Content-Type', 'application/json');
    }
    const res = await fetch(`${BASE_URL}${path}`, { ...opts, headers });
    if (!res.ok) {
      let msg = `HTTP ${res.status}`;
      try { const j = await res.json(); msg = j.error ?? msg; } catch {}
      throw new ApiError(msg, res.status);
    }
    return res.json() as Promise<T>;
  }, []);

  return { apiFetch, BASE_URL };
}
