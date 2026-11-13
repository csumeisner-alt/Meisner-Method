---
name: Paper account value coverage
description: Sampling and coverage rules for paper-trading account equity charts.
---

Use hourly account-equity snapshots for dated chart ranges. Capture a value only when every held position has a valid live quote; do not substitute average cost. A dated range is available only when snapshots for that account reach the requested start and include a recent endpoint. Keep reconstructed transaction history available in ALL.

**Why:** Trade-derived points cannot represent unchanged accounts between trades, and fallback prices would imply market values that were never observed. Hourly sampling supports the requested chart windows without rapidly growing local storage.

**How to apply:** Preserve account isolation and reset boundaries. Do not infer shorter-range coverage from account age or from trade points alone.
