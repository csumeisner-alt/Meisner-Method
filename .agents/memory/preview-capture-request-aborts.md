---
name: Preview capture request aborts
description: Automated app screenshots can close slow API requests before the page renders their response.
---

Automated app-preview captures may finish before a slower API request. Workflow logs can then show an aborted request even when the endpoint is healthy; a later capture may render successfully from the warmed server cache.

**Why:** A mobile preview capture initially showed the heat map loading, while the request was closed during capture; the next capture showed the completed map.

**How to apply:** Treat a single aborted request during screenshot capture as inconclusive. Verify the endpoint independently, allow its cache to warm, and capture again before changing working request logic.
