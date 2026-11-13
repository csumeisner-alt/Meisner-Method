---
name: Local-only community features
description: Product constraints for community and event features that should not collect new user data or add recurring service costs.
---

Keep community and event participation data on-device. Each event uses a separate local portfolio with a fresh $100,000 starting balance; do not reset or overwrite regular paper accounts. Limit event notifications to a few useful reminders, including a midweek position update. The user does not want new data collection or additional developer service costs for these features.

**Why:** The user wants every participant to start each event equally without affecting existing account history, while avoiding new data collection, ongoing costs, and excessive notifications.

**How to apply:** Use local storage and avoid adding backend persistence, telemetry, paid integrations, or cross-device sync unless the user explicitly changes this scope.
