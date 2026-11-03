---
name: Crypto supply history provenance
description: Keep provider-backed on-chain supply history distinct from live circulating supply and max-supply share.
---

Treat Coin Metrics `SplyCur` as an on-chain current-supply series, not as a historical replay of another provider's circulating-supply field. Show its provider and metric, keep it separate from maximum-supply share, and leave missing dates as gaps rather than interpolating.

Use the shared 5% discrepancy cutoff as a material cross-provider mismatch cue, not as an unusual-issuance threshold. Yahoo's live `circulatingSupply` and Coin Metrics `SplyCur` can use different asset-specific definitions; do not invent per-asset tolerances without documented, comparable source definitions and calibration data. Preserve both reported values and explain the distinction in the warning.

**Why:** Providers use different supply definitions, and interpolating absent observations would imply data that was never reported.

**How to apply:** When adding crypto supply-history providers or chart inspection, document the metric and source, preserve actual dates and gaps, and make point controls reference only reported observations. Keep the shared cutoff framed as a source mismatch, not an issuance alarm, until asset-specific source conventions can be compared. Dense daily charts need a separate accessible observation selector; overlapping touch targets make many dates unreachable.
