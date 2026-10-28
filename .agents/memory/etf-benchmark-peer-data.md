---
name: ETF benchmarks and peer costs
description: Source and disclose ETF benchmark and category cost comparisons without inferring a benchmark or peer sample.
---

Only show a fund benchmark when the provider explicitly identifies it; never substitute SPY or infer an index from the fund category. A provider-defined category-average expense ratio can be used as a peer-cost reference, but disclose its category, source, retrieval date, and whether the peer sample size is unavailable.

**Why:** A broad-market index may not match a fund's strategy, and a category average without sample details can look more comparable than the source supports.

**How to apply:** For ETF comparison features, keep benchmark tracking conditional on an explicit provider benchmark and shared return history. Preserve unavailable values and sample context in the API and UI.
