---
name: Custom heat-map reordering
description: Keep manual ordering instant without changing quote-data identity or racing local persistence.
---

Treat a custom map's saved symbol order as local display state, not as part of quote identity. A reorder should reuse the current quote batch, update the UI immediately, and queue local writes so repeated drags can continue without waiting. Dragging one hex onto another swaps exactly those two saved positions; it does not insert and shift intervening symbols. Ordinary vertical swipes should still scroll the map, with scrolling suppressed only while an active long-press drag is underway.

**Why:** Waiting for market data or an individual storage write after each move makes manual arrangement feel blocked; overlapping writes can also persist an older order last. Insertion-style moves are inconsistent with users' expectation that the two touched hexagons exchange places, and an exclusive tile pan can trap scrolling.

**How to apply:** Keep the order array for rendering and persistence, normalize query-cache identity by the unordered symbol set, and serialize background writes. On native, use simultaneous scroll and delayed tile-drag recognition and disable scrolling only after drag activation. On web, Gesture Handler's pan detector defaults to `touch-action: none`; set its `touchAction` to `pan-y` so vertical swipes can scroll. Swap source and target indexes; if a latest write fails, restore the last confirmed snapshot without overwriting a newer reorder.
