---
name: Local-only community features
description: Product constraints for community and event features that should not collect new user data or add recurring service costs.
---

Keep community and event participation data on-device. Each event uses a separate local portfolio with a fresh $100,000 starting balance; do not reset or overwrite regular paper accounts. The event goal is to grow the ending paper balance as much as possible; describe it as simulated and do not imply a shared leaderboard. Limit event notifications to a few useful reminders, including a midweek position update. The user does not want new data collection or additional developer service costs for these features.

**Why:** The user wants every participant to start each event equally, clearly understand that the goal is to maximize their simulated event balance, and avoid affecting existing account history, new data collection, ongoing costs, and excessive notifications.

**How to apply:** Use local storage and avoid adding backend persistence, telemetry, paid integrations, or cross-device sync unless the user explicitly changes this scope.
