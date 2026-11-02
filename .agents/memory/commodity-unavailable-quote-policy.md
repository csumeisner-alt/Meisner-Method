---
name: Unavailable commodity quote policy
description: Product behavior for commodities whose latest quote is stale or unavailable.
---

Keep catalog commodities visible in the Commodities map when no fresh quote is available, and clearly mark the quote as unavailable without showing a stale price. Never add them to a user's custom map automatically; offer a deliberate add action and allow curated commodity symbols to be saved before the next quote arrives.

**Why:** The user clarified that missing quotes should not hide instruments or block users who want to follow them, while custom-map membership must remain an explicit choice.

**How to apply:** Keep unavailable commodity display separate from priced heat-map tiles. Preserve normal duplicate, storage, and map-capacity handling when adding one; do not bypass quote checks for unrelated asset types.
