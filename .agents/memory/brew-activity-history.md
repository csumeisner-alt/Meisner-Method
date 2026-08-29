---
name: Brew activity history
description: Durable rule for showing and preserving the user's Brew Token and bottle activity timeline.
---

The Brew economy snapshot is the source of truth for a bounded activity timeline covering token claims, bank actions, bottle unlocks/purchases/redemptions, toss outcomes, and theme changes. Missing history in an older snapshot must normalize to an empty list rather than invalidating the snapshot.

**Why:** Users need continuity after closing the app, while an unbounded event stream would make the small local economy snapshot grow indefinitely.

**How to apply:** Append only completed economy mutations, cap the retained history, and keep legacy snapshot migration backward-compatible.