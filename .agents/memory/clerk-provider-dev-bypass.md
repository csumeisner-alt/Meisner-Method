---
name: Clerk provider must always be mounted
description: Why the Expo dev "preview without login" bypass must keep ClerkProvider mounted and only relax the redirect
---

# Clerk provider + dev bypass

Clerk hooks (`useAuth`, `useSignIn`, `useSignUp`, `useSSO`, etc.) assert a surrounding
`<ClerkProvider>` and **throw** when it is absent
(`"… can only be used within the <ClerkProvider /> component."`). Any screen that
calls a Clerk hook crashes on mount if the provider was skipped.

**Rule:** mount `ClerkProvider` in ALL environments. To support a dev "preview
without logging in" mode, gate only the *forced sign-in redirect* on `__DEV__`,
never the provider itself.

**Why:** a previous dev bypass removed `ClerkProvider` in `__DEV__` but screens still
called Clerk hooks (directly and transitively via a shared `useApi`), so the first
screen threw on every Expo Go launch → "Something went wrong." Keeping the provider
mounted and only relaxing the redirect fixes the crash while preserving the preview UX
and leaving production auth untouched.

**How to apply:** if you must keep some consumer provider-free in dev, decouple it from
Clerk entirely — e.g. have `useApi` resolve its bearer token via the api-client-react
token getter (`getAuthToken`/`setAuthTokenGetter`) instead of calling `useAuth()`. Pick
one strategy (provider-always vs consumer-free) so the dev and prod paths don't drift.
