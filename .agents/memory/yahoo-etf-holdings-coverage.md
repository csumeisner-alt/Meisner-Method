---
name: Yahoo ETF holdings coverage
description: Yahoo Finance fund holdings are a partial provider snapshot and may omit the underlying report date.
---

Yahoo Finance's `FundsData.top_holdings` commonly returns ten positions and does not include the date those holdings were reported. Preserve every valid position returned by the provider, show the number of reported positions, and label the timestamp as retrieval time rather than a holdings report date. Any overlap comparison must use only these reported positions and disclose that it is not a complete portfolio comparison.

**Why:** Treating a provider retrieval timestamp as the holdings date or treating top holdings as a complete portfolio would overstate the freshness and coverage of concentration and overlap results.

**How to apply:** When adding ETF holdings features, inspect the actual provider payload, retain its available rows and weights, distinguish retrieval time from report date, and state the provider-reported coverage basis beside summaries and comparisons.
