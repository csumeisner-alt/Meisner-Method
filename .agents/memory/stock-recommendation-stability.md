---
name: Stock recommendation stability
description: Durable rules for consistent stock actions and valid entry, target, and stop-loss levels.
---

The app is long-only. Recommendation action, confidence, horizon, entry, target, and stop loss must come from deterministic market-data rules, with the invariant `stop loss < entry < target`. AI may write the educational explanation, risks, and strengths, but must not choose or override the structured recommendation.

**Why:** Independent AI generations produced different BUY/HOLD actions seconds apart and could return contradictory price levels for effectively identical market data.

**How to apply:** Keep the structured recommendation calculation outside the language-model response. Test identical inputs for identical output and reject or replace analyst targets that do not sit above the entry.