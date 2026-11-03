---
name: React Native Web alerts
description: React Native Web silently ignores Alert.alert, so essential browser confirmations need a web-specific path.
---

**Rule:** In the current project’s React Native Web implementation, `Alert.alert` is an empty stub. Check this behavior again after dependency updates; use a browser confirmation or custom web dialog for essential web actions while preserving native alerts.

**Why:** The portfolio delete flow silently failed in the browser because its confirmation depended on `Alert.alert`.

**How to apply:** When adding or debugging `Alert.alert` in this Expo app, check the web implementation and provide a web-specific path for actions that must work in the browser preview.
