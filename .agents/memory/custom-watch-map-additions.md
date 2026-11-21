---
name: Curated Watch Map additions
description: Validation boundaries for adding catalogued and free-form instruments to a custom Watch Map.
---

Persist a curated Watch Map item after the user's explicit Add action without waiting for a quote-provider validation request. Quote availability is handled separately by the map. Continue validating free-form ticker input and live stock-search results.

**Why:** Curated instruments are already selected from the supported catalog, and saving them should not depend on provider latency or a fresh quote.

**How to apply:** Keep catalog additions local-first while preserving validation for symbols that are not in the bundled catalog.
