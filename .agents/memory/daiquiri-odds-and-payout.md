---
name: Dave Ramsey Daiquiri odds and payout
description: Preserve the requested Central Bank Daiquiri effect, including its intentionally non-complementary displayed odds.
---

Dave Ramsey Daiquiri is a separate, one-spin Brew Token effect: the machine uses a 45% win probability, displays the requested “45% win / 65% loss” wording, and doubles only the winning award.

**Why:** The requested 45% win and 65% loss labels do not form complementary probabilities, but they are intentional product copy and should not be “corrected” in the UI. The actual random decision uses the 45% win probability.

**How to apply:** Keep its persisted inventory and armed state independent from Quick Revive. Do not allow both effects to arm the same spin; clear the Daiquiri state after the next resolved spin, regardless of outcome.