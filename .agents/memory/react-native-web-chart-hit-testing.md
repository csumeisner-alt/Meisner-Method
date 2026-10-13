---
name: React Native Web chart hit-testing
description: Reliable pointer-coordinate handling for press targets layered over SVG charts in the mobile browser preview.
---

**Rule:** When a chart uses a React Native `Pressable` as a web hit target, do not assume `nativeEvent.locationX` or `locationY` exists. Prefer finite local coordinates; on web, fall back to `pageX`/`pageY` minus `currentTarget.getBoundingClientRect()` offsets.

**Why:** In the mobile browser preview, a press event lacked local coordinates. Converting that missing value to a candle index caused the chart to throw before completing a two-point drawing.

**How to apply:** Guard and normalize coordinates at the chart hit target before calculating a candle index or price. Verify both taps in a real browser preview, not only with a TypeScript check.
