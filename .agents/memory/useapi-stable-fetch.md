---
name: apiFetch must be referentially stable (Clerk getToken is not)
description: Why an auth-token fetch wrapper caused an infinite request loop and blank screen
---

# The api fetch wrapper must be a stable reference, or effects loop forever

**Rule:** A shared `apiFetch`/`useApi` wrapper that attaches a Clerk bearer token must return a referentially STABLE function (same identity across renders). Do NOT memoize it on `[getToken]` — Clerk's `getToken` from `useAuth()` is not stable across renders. Instead store `getToken` in a ref (`getTokenRef.current = getToken`) and give `useCallback` an empty dep array.

**Why:** With `useCallback(fn, [getToken])`, `apiFetch` got a new identity every render. Any consumer with `useEffect(() => { apiFetch('/api/...').then(setState) }, [apiFetch])` re-fired on every render: fetch → setState → re-render → new apiFetch → effect re-runs → fetch … an unbounded loop (hundreds of req/sec). Two compounding symptoms: (1) the API server was flooded, and (2) each call invoked Clerk `getToken()`, blowing through the Clerk **dev-instance usage limit** so `<ClerkLoaded>` never resolved `isLoaded` and the whole app rendered a silent blank white screen (no error, no ErrorBoundary).

**How to apply:** Keep auth/token fetch wrappers stable via refs. When you see a blank Clerk screen where rendering stops right after the "Clerk loaded with development keys" warning, suspect Clerk being rate-limited by a runaway loop, not a Clerk config problem — find the effect whose dependency is an unstable callback.
