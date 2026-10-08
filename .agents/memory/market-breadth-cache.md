---
name: Market heat/cold index signal
description: Product meaning and data-source tradeoff for the home market indicator.
---

Use Yahoo's `^DWCF` daily percentage move (change versus the previous close) for the home heat/cold indicator, not a sampled breadth percentage. Positive is HOT, negative is COLD, and zero is NEUTRAL. Show the signed percentage and quote time; never display the index price. This is a cap-weighted index move, not the share of stocks advancing.

**Why:** The user wants a free, simple, near-real-time total-market direction signal and accepts Yahoo's delayed index quote.

**How to apply:** Refresh about once a minute and retain the last successful quote through temporary Yahoo failures, while showing its actual quote timestamp. Do not describe Yahoo's delay as guaranteed real-time.
