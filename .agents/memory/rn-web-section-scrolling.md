---
name: React Native Web section scrolling
description: Reliable programmatic section jumps in the mobile app's browser preview.
---

For a React Native Web section jump, measure the target and the scroll frame in the same window, combine that difference with the current scroll offset, and call `ScrollView.scrollTo` with `animated: false`.

Stable Expo Router Stack routes preserve screen-level React state, but a screen's
scroll offset can still reset when it blurs and becomes active again. Save each
scroll view's offset while focused and restore it with nonanimated `scrollTo`
after focus; use a distinct in-memory key for each screen or section.

**Why:** In the headless Expo web preview, the measured target was correct, but smooth scrolling left the report at its previous position during navigation checks; nonanimated scrolling moved it reliably. A real tab-switch check also showed selected account and section state surviving while the scroll position reset to zero.

**How to apply:** Use nonanimated scrolling for section jumps. For tab retention, keep a route-scoped offset map, update it from `onScroll` only while focused, and restore after the screen regains focus. Keep native touch scrolling unchanged.
