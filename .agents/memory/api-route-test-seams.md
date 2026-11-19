---
name: API route test seams
description: How to test API endpoint response behavior before the server bundle exists.
---

**Rule:** When source-run tests cannot load a route because its `.js` imports resolve only after bundling, extract the injectable response handler into a focused module and test it through HTTP. If the regression is specifically route registration, bundle the actual route barrel for the HTTP test; testing only an extracted handler will not catch a missing `router.use()`.

**Why:** Native TypeScript source tests could not resolve the route's build-target `.js` imports before the API bundle existed, although the production bundle built correctly.

**How to apply:** Keep production route wiring pointed at the extracted handler, inject provider and AI dependencies in endpoint tests, and verify the complete HTTP response contract. For registration coverage, bundle the barrel into a temporary module and request the mounted routes with inputs that exit before provider access.
