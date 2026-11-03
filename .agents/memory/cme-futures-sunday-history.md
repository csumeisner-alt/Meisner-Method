---
name: CME futures Sunday history labels
description: Yahoo's Sunday date labels for evening futures bars must be aligned to exchange trade dates without weakening freshness checks.
---

For CME/ICE futures, Yahoo may label the active Sunday-evening daily bar with Sunday's calendar date, while the exchange calendar labels the session Monday. Normalize Sunday to Monday only when that Monday session's official open occurred on Sunday. Include an upcoming session in expected-session checks only after its actual open. If Yahoo returns both Sunday and Monday bars for that session, keep the later observation.

**Why:** Silver futures (`SI=F`) returned a valid Sunday-evening bar that the weekday-only exchange session list rejected with HTTP 422. Treating every non-session date as valid would weaken stale and holiday safeguards.

**How to apply:** Use the venue calendar's session open to verify the Sunday-to-Monday mapping. Do not map Sundays across full holiday closures or include Monday before its Sunday open; leave other unmatched dates unavailable.
