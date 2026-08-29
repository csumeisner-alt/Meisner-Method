---
name: Dave Ramsey Daiquiri odds and payout
description: Preserve the confirmed Central Bank Daiquiri odds and payout behavior.
---

Dave Ramsey Daiquiri is a separate, one-spin Brew Token effect: the machine uses complementary 45% win / 55% loss probabilities and doubles only the winning award.

**Why:** The confirmed product rule is a binary toss with a 45% win chance and a 55% loss chance. Keeping the displayed odds and random decision aligned prevents players from seeing impossible totals.

**How to apply:** Keep its persisted inventory and armed state independent from Quick Revive. Do not allow both effects to arm the same spin; clear the Daiquiri state after the next resolved spin, regardless of outcome.