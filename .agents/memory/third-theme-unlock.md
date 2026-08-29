---
name: Third-theme unlock
description: Rules for revealing, unlocking, persisting, and activating the Hybrid Neon Gucci theme.
---

The Hybrid Neon Gucci theme stays completely undisclosed until the user has earned at least one Dark Brew Token. It unlocks at 10,000 Dark Brew Tokens, and its active state belongs in the serialized Brew economy snapshot.

**Why:** The reveal itself is part of the reward progression, while snapshot persistence prevents the earned theme choice from drifting away from the economy that unlocked it.

**How to apply:** Show progress only after the first Dark Brew Token. Reject activation below 10,000, preserve compatibility with older snapshots by defaulting the theme flag to false, and ensure only one of default, Patriot, or Hybrid Neon Gucci is active.