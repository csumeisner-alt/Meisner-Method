---
name: Brew activity history
description: Durable rule for showing and preserving the user's Brew Token and bottle activity timeline.
---

The Brew economy snapshot is the source of truth for a bounded activity timeline covering token claims, bank actions, bottle unlocks/purchases/redemptions, toss outcomes, and theme changes. Missing history in an older snapshot must normalize to an empty list rather than invalidating the snapshot.

**Why:** Users need continuity after closing the app, while an unbounded event stream would make the small local economy snapshot grow indefinitely.

**How to apply:** Append only completed economy mutations, cap the retained history, and keep legacy snapshot migration backward-compatible.

Once a bottle is unlocked, tapping its inspection control should open its animation preview without buying or redeeming it. The preview must not change token balance, inventory, or armed effects.

**Why:** the user asked to let users preview every unlocked bottle animation without spending or consuming a bottle.

**How to apply:** route inspection taps only to preview state and the preview-location animation; keep purchase and redemption handlers separate.