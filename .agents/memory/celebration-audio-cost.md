---
name: Celebration audio cost model
description: Product constraint for trade-celebration voice playback.
---

Trade-celebration voice feedback should use bundled recordings rather than a network text-to-speech service.

**Why:** The product should remain free at runtime and must not incur a per-play voice/API charge.

**How to apply:** Keep the approved phrases as local app assets. Expo Go may use on-device speech when native playback is unavailable, while standalone builds should play the bundled recordings first.