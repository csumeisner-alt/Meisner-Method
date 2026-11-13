---
name: Local-only community features
description: Product constraints for community and event features that should not collect new user data or add recurring service costs.
---

Keep community and event participation data on-device. The user does not want new data collection or additional developer service costs for these features.

**Why:** The user wants to add community-facing features without expanding data collection or ongoing costs.

**How to apply:** Use local storage and avoid adding backend persistence, telemetry, paid integrations, or cross-device sync unless the user explicitly changes this scope.
