---
name: Brew token snapshot persistence
description: Durable rules for persisting the account-free Brew Token economy and idempotent quote rewards.
---

Use one versioned snapshot as the source of truth for Brew Token balances, unlocks, bottle effects, bank access, sale expiry, Dark Brew Tokens, and claimed quote-session IDs. Apply a mutation only after the complete next snapshot is persisted. If a storage write rejects, read the snapshot back and adopt it only when the serialized value matches.

**Why:** Separate AsyncStorage keys allowed a partial write to leave currency and inventory inconsistent, while an in-memory-only quote claim could be rewarded again after reload.

**How to apply:** Keep economy mutations serialized and calculate each next state from the latest committed snapshot. Migrate legacy per-field keys into the snapshot without deleting them, so an interrupted migration can retry safely.