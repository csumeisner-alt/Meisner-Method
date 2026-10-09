---
name: Crypto supply history provenance
description: Keep provider-backed on-chain supply history distinct from live circulating supply and max-supply share.
---

Treat Coin Metrics `SplyCur` as an on-chain current-supply series, not as a historical replay of another provider's circulating-supply field. Show its provider and metric, keep it separate from maximum-supply share, and leave missing dates as gaps rather than interpolating.

**Why:** Providers use different supply definitions, and interpolating absent observations would imply data that was never reported.

**How to apply:** When adding crypto supply-history providers, document the metric and source, preserve their actual dates and gaps, and do not derive a supply series from price or market capitalization.
