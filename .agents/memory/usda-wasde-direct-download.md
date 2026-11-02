---
name: USDA WASDE report downloads
description: Access official historical WASDE data when the report index is blocked.
---

The USDA historical WASDE HTML index may deny server-side requests even when dated monthly CSV files under the official USDA documents path remain downloadable. Generate direct month candidates, include revision suffixes when checking, and validate the CSV's report date and content before using it.

**Why:** The index request was blocked in the runtime while the official dated CSV was accessible.

**How to apply:** New WASDE integrations should fetch official dated CSV files directly rather than scrape the index, then validate commodity, units, report date, and freshness.
