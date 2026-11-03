---
name: Unavailable commodity quote policy
description: Product behavior for commodities whose latest quote is stale or unavailable.
---

Keep catalog commodities visible as neutral hex tiles when no fresh quote is available. Separate them from live hexes with a thin horizontal divider, and never show a stale price. Use the same hex-and-divider treatment for unavailable symbols on the custom map. Put an availability note above the tiles. Tapping an unavailable commodity opens its detail data, historical chart, and AI-analysis actions; do not put an add-to-custom control on the hex.

**Why:** The user clarified that unavailable quotes should remain inspectable, chartable, and analyzable, but the hex should stay focused on the instrument rather than custom-map management.

**How to apply:** Keep unavailable commodity display separate from priced heat-map tiles. Hide the current-price row when no fresh quote exists; chart history and let the existing analysis endpoint apply its own source and freshness checks. Do not add an add-to-custom button to the unavailable hex.
