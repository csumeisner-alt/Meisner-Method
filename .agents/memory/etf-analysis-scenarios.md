---
name: ETF analysis scenarios
description: Keep long-term ETF scenarios deterministic, sourced from historical data, and clearly distinguished from forecasts.
---

ETF outlook values are illustrative compounding scenarios derived from observed bull, bear, and sample-weighted regime returns. Normalize every fund to a $100 initial investment so projections are comparable regardless of share price. Show no-fee projections separately from fee-adjusted projections; fee-adjusted values stay unavailable unless a valid expense ratio was reported. AI commentary must not set or alter the scenario values. Missing historical regimes stay unavailable. When modeling recurring contributions, apply the same contribution amount and cadence per fund, use an equivalent periodic rate for the selected weekly, monthly, or quarterly cadence, and deposit at each period's end.

Keep the selected contribution cadence across ETF analyses on the device; default to monthly when no valid saved cadence is available. The per-deposit amount remains editable per analysis.

**Why:** A common $100 starting amount makes fund scenarios comparable across different share prices. Explicit historical assumptions keep long-range figures reproducible and make uncertainty visible; treating an unknown fee as zero misrepresents the result.

**How to apply:** Preserve the deterministic scenario calculation and show its assumptions, history window, expense-ratio treatment, selected schedule and deposit timing, and non-forecast disclaimer whenever ETF outlooks are changed.
