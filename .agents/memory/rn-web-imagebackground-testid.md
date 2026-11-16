---
name: React Native Web ImageBackground tests
description: Keep browser test selectors on the visible content container around ImageBackground.
---

In React Native Web browser tests, put `testID` on a wrapping `View` around `ImageBackground`, not directly on the `ImageBackground` component. Its test ID may land on the positioned image layer, which does not contain the overlaid text or controls.

**Why:** Assertions against the image layer can find the background but miss the visible card content and geometry.

**How to apply:** When a browser test needs to inspect text, size, or controls on an `ImageBackground` card, select a parent `View` with the test ID.
