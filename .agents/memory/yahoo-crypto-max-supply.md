---
name: Yahoo crypto max-supply semantics
description: How Yahoo Finance/yfinance encodes capped, uncapped, and unreported cryptocurrency maximum supply.
---

Yahoo Finance's yfinance crypto data uses a numeric `maxSupply` of `0` for assets with no fixed cap; a positive number is a reported cap. An absent or null value does not confirm uncapped supply.

CoinPaprika is used as a secondary source for maximum supply. Treat only a positive `max_supply` as a confirmed cap; its missing or zero values do not establish that a coin is uncapped. When both sources report positive but materially different caps, preserve Yahoo's value, expose the disagreement, and omit the derived circulating-share percentage.

**Why:** Live Yahoo responses showed zero for ETH and DOGE and a positive value for BTC. CoinPaprika's API docs show that unavailable fields may be empty; interpreting that as uncapped would overstate certainty, and silently using conflicting caps would make the derived share misleading.

**How to apply:** Treat only an explicit Yahoo zero as the no-fixed-cap signal. Prefer an explicit Yahoo result; fall back to a positive CoinPaprika result only when Yahoo is unreported. Keep missing, null, non-finite, boolean, and invalid values distinct as unreported, and visibly flag a material source disagreement.
