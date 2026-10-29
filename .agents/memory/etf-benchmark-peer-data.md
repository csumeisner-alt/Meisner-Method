---
name: ETF benchmarks and peer comparisons
description: Source and disclose ETF benchmarks and category comparisons without inventing a peer sample.
---

Only show a fund benchmark when the provider explicitly identifies it; never substitute SPY or infer an index from the fund category. Yahoo Finance reports category averages for expense ratio and total net assets, but not category distributions for average volume, sector concentration, volatility, or drawdown. Use only a provider-reported baseline, and disclose its category, source, retrieval time, and sample context even when the sample size is unavailable. Keep fixed-band or unavailable scores for metrics without a peer baseline.

**Why:** A broad-market index may not match a fund's strategy, and unsupported category comparisons can make a score appear more comparable than the source supports.

**How to apply:** For ETF comparison features, keep benchmark tracking conditional on an explicit provider benchmark and shared return history. Treat Yahoo's category total-net-assets average as a size baseline only; preserve unavailable peer metrics and sample context in the API and UI.
