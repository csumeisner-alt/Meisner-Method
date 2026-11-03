---
name: ETF tracking monthly windows
description: Keep tracking metadata and annualized returns aligned with usable shared monthly prices.
---

ETF tracking returns use only consecutive calendar-month pairs present for both the fund and its explicit benchmark. Invalid month keys and unusable prices are excluded. Period dates bracket the first and last sampled intervals, monthly sample count is the number of included one-month returns, and annualized cumulative returns use only those sampled monthly returns. If fewer than two usable monthly returns remain, tracking comparison is unavailable.

**Why:** Treating a multi-month gap as one monthly return misstates sample counts and annualization; endpoint prices can also incorporate price changes from intervals that were not sampled.

**How to apply:** Preserve these boundaries when changing ETF tracking calculations, API metadata, or tests for sparse provider history.
