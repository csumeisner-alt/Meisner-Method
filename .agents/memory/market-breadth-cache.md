---
name: Market heat/cold index signal
description: Product meaning and data-source tradeoff for the home market indicator.
---

Use Yahoo's `^DWCF` daily percentage move (change versus the previous close) for the home heat/cold indicator, not a sampled breadth percentage. Positive is HOT, negative is COLD, and zero is NEUTRAL. Show the signed percentage and quote time; never display the index price. This is a cap-weighted index move, not the share of stocks advancing.

**Why:** The user wants a free, simple, near-real-time total-market direction signal and accepts Yahoo's delayed index quote.

Determine whether the regular U.S. equity session is open independently of Yahoo quote refreshes. Pause the directional badge only when the quote is older than the in-session freshness limit; when the market is closed, retain the last percentage and timestamp and label it as the last session.

**Why:** A quote outage can continue through the close. Using only a cached “market open” value would incorrectly pause a prior-session quote after hours; use the official exchange calendar so holidays and early closes are respected.

**How to apply:** Refresh the quote about once a minute and retain the last successful quote through temporary Yahoo failures. Compute session status from the official calendar, not quote availability or a weekday/time approximation. Do not describe Yahoo's delay as guaranteed real-time.
