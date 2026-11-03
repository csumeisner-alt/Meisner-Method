---
name: Expo Metro shared catalog paths
description: Metro cannot reliably bundle the project's shared JSON catalog from outside the mobile artifact boundary.
---

Keep JSON imported by the Expo app inside `artifacts/mobile`; API code can read the same file by path and copy it beside its packaged Python fetcher.

**Why:** An Android Expo export failed to resolve a workspace-root JSON file that TypeScript and Node tests resolved successfully.

**How to apply:** When sharing a JSON catalog between the mobile app and API code, keep the canonical file within the mobile artifact and verify both Expo export and the API package's copied catalog.
