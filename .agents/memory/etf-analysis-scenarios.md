---
name: ETF analysis scenarios
description: Keep long-term ETF scenarios deterministic, sourced from historical data, and clearly distinguished from forecasts.
---

ETF outlook values are illustrative compounding scenarios derived from observed bull, bear, and sample-weighted regime returns. Show no-fee projections separately from fee-adjusted projections; fee-adjusted values stay unavailable unless a valid expense ratio was reported. AI commentary must not set or alter the scenario values. Missing historical regimes stay unavailable.

**Why:** Long-range figures can look like precise predictions; using explicit historical assumptions keeps the calculations reproducible and makes uncertainty visible. Treating an unknown fee as zero would misrepresent the result.

**How to apply:** Preserve the deterministic scenario calculation and show its assumptions, history window, expense-ratio treatment, and non-forecast disclaimer whenever ETF outlooks are changed.
