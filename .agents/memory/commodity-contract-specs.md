---
name: Commodity quote units and notional
description: Preserve futures exchange quote scales when displaying commodity prices and converting contract value.
---

Keep commodity prices in their exchange quote units for display. For dollar-notional calculations, multiply the quote by the verified standard contract size and convert cents to dollars where needed.

**Why:** Yahoo Finance commodity futures history is passed through numerically by the market-data adapter; cent-quoted contracts such as corn appear in U.S. cents (Yahoo labels the quote currency USX). Treating those figures as dollars makes estimated contract notionals 100 times too large.

**How to apply:** When adding or changing supported futures, verify the exchange quotation and contract unit, preserve the raw quote scale in the UI, store the dollar conversion factor with the contract metadata, and test both cents- and dollar-quoted examples.
