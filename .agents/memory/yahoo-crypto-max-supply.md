---
name: Yahoo crypto max-supply semantics
description: How Yahoo Finance/yfinance encodes capped, uncapped, and unreported cryptocurrency maximum supply.
---

Yahoo Finance's yfinance crypto data uses a numeric `maxSupply` of `0` for assets with no fixed cap; a positive number is a reported cap. An absent or null value does not confirm uncapped supply.

**Why:** Live provider responses showed zero for ETH and DOGE and a positive value for BTC, while Yahoo's page describes a maximum supply as potentially undefined or unlimited.

**How to apply:** Treat only an explicit provider zero as the no-fixed-cap signal. Keep missing, null, non-finite, boolean, and invalid values distinct as unreported; never infer uncapped status from missing data.
