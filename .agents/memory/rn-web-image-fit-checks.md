---
name: React Native Web image fit checks
description: How to verify image resize modes in browser-rendered React Native fixtures.
---

React Native Web renders `Image` artwork as a CSS background on a visible child layer and uses a separate, visually hidden `<img>` for accessibility. When a browser fixture checks `resizeMode="contain"`, inspect the visible layer's computed `background-size`, not the hidden image's `object-fit`.

**Why:** the hidden image can report the browser default `object-fit: fill` even when the visible artwork correctly uses `background-size: contain`; testing the wrong node creates a false crop regression.

**How to apply:** locate the visible background-image layer inside the rendered `Image` and assert its computed fit property, while checking the hidden `<img>` only for source loading and accessible text.
