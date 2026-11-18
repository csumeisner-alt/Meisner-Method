---
name: Browser query mock stability
description: Prevent effect loops in browser fixtures that mock query hooks and refresh callbacks.
---

When a browser fixture mocks a query hook, keep callback identities such as `refetch` stable across renders if the component uses them in a `useEffect` or `useCallback` dependency list.

**Why:** A new callback on every mocked render can repeatedly restart refresh effects and make empty states look permanently loading, which hides the UI behavior the test is meant to verify.

**How to apply:** Cache mock callbacks by query key or define them at module scope, then model loading and error results separately from callback identity.
