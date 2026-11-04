---
name: React Native Web section scrolling
description: Reliable programmatic section jumps in the mobile app's browser preview.
---

For a React Native Web section jump, measure the target and the scroll frame in the same window, combine that difference with the current scroll offset, and call `ScrollView.scrollTo` with `animated: false`.

**Why:** In the headless Expo web preview, the measured target was correct, but smooth scrolling left the report at its previous position during navigation checks; nonanimated scrolling moved it reliably.

**How to apply:** Use this for programmatic section navigation and browser smoke tests. Keep native touch scrolling unchanged.
