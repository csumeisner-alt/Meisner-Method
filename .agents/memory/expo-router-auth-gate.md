---
name: Expo Router auth gate must keep the navigator mounted
description: Why a signed-out Expo Router app can render a blank screen, and the correct redirect pattern
---

# Expo Router auth gating — never return <Redirect> in place of the navigator

**Rule:** In an Expo Router root `_layout`, the navigator (`<Stack>` / `<Slot>` / `<Tabs>`) must render on EVERY render. Do the auth redirect imperatively (`useRouter().replace(...)` inside a `useEffect`, keyed off `useSegments()` to detect the auth group). Do NOT write an auth gate that returns `<Redirect href=... />` *instead of* the navigator.

**Why:** Expo Router needs a mounted navigator to host any route — including the sign-in route. If a gate component short-circuits and returns only `<Redirect>` (not the `<Stack>`), there is no navigator to render the redirect target, so the app shows a blank white screen with no error and no ErrorBoundary fallback. This bit us: signed-out users saw a blank screen at both `/` and `/sign-in`; clerk-js had loaded fine (dev-key warning printed), so the cause was structural, not Clerk.

**How to apply:** Gate pattern that works:
```
function AuthGate({ children }) {
  const { isSignedIn, isLoaded } = useAuth();
  const segments = useSegments();
  const router = useRouter();
  useEffect(() => {
    if (!isLoaded) return;
    const inAuthGroup = segments[0] === '(auth)';
    if (!isSignedIn && !inAuthGroup) router.replace('/(auth)/sign-in');
    else if (isSignedIn && inAuthGroup) router.replace('/');
  }, [isLoaded, isSignedIn, segments, router]);
  return <>{children}</>; // navigator ALWAYS renders
}
```
A blank Expo web screen with no console error is the tell — suspect a layout returning something other than the navigator.
