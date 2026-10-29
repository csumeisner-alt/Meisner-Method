---
name: ETF analysis scenarios
description: Keep long-term ETF scenarios deterministic, sourced from historical data, and clearly distinguished from forecasts.
---

ETF outlook values are illustrative compounding scenarios derived from observed bull, bear, and sample-weighted regime returns. Show no-fee projections separately from fee-adjusted projections; fee-adjusted values stay unavailable unless a valid expense ratio was reported. AI commentary must not set or alter the scenario values. Missing historical regimes stay unavailable. When modeling recurring contributions, keep one initial share at the current quote, use an equivalent periodic rate for the selected weekly, monthly, or quarterly cadence, and deposit at each period's end.

**Why:** Long-range figures can look like precise predictions; using explicit historical assumptions keeps the calculations reproducible and makes uncertainty visible. Treating an unknown fee as zero would misrepresent the result, and a stated deposit schedule is necessary for contribution scenarios to be reproducible.

**How to apply:** Preserve the deterministic scenario calculation and show its assumptions, history window, expense-ratio treatment, selected schedule and deposit timing, and non-forecast disclaimer whenever ETF outlooks are changed.
