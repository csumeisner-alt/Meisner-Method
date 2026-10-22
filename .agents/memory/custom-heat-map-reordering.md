---
name: Custom heat-map reordering
description: Keep manual ordering instant without changing quote-data identity or racing local persistence.
---

Treat a custom map's saved symbol order as local display state, not as part of quote identity. A reorder should reuse the current quote batch, update the UI immediately, and queue local writes so repeated drags can continue without waiting.

**Why:** Waiting for market data or an individual storage write after each move makes manual arrangement feel blocked; overlapping writes can also persist an older order last.

**How to apply:** Keep the order array for rendering and persistence, normalize query-cache identity by the unordered symbol set, and serialize background writes. If a latest write fails, restore the last confirmed snapshot without overwriting a newer reorder.
