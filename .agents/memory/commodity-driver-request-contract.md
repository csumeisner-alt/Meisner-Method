---
name: Commodity driver request contract
description: Preserve timeout, retry, and cancellation guarantees if bundled commodity-driver explanations become remote data.
---

Commodity price-driver explanations are curated local content and are independent of the market-statistics request. Keep that separation; do not invent or couple a new server endpoint solely to make the content asynchronous. If a future data source becomes remote, retain the UI timeout, retry path, and protection against responses for closed or superseded commodities.

**Why:** The available project data has no external commodity-driver provider or endpoint, while market statistics already load separately.

**How to apply:** When changing the commodity-driver source, verify whether it is still local; if introducing network access, preserve its cancellation and timeout behavior and extend the browser tests.
