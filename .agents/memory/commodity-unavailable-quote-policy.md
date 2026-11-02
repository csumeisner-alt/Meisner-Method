---
name: Unavailable commodity quote policy
description: Product behavior for commodities whose latest quote is stale or unavailable.
---

Keep catalog commodities visible as neutral hex tiles when no fresh quote is available. Separate them from live hexes with a thin horizontal divider, and never show a stale price. Use the same hex-and-divider treatment for unavailable symbols on the custom map. Never add commodities to a custom map automatically; offer a deliberate add action and allow curated commodity symbols to be saved before the next quote arrives.

**Why:** The user clarified that missing quotes should not hide instruments or block users who want to follow them, while custom-map membership must remain an explicit choice.

**How to apply:** Keep unavailable commodity display separate from priced heat-map tiles. Preserve normal duplicate, storage, and map-capacity handling when adding one; do not bypass quote checks for unrelated asset types.
