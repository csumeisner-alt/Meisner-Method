---
name: React Native Web section jumps
description: Reliable section scrolling in Expo screens tested through React Native Web.
---

For section jumps in Expo screens, keep native layout measurements for iOS and Android, but on React Native Web derive the target offset from the target and scroll-container bounding rectangles plus the current scroll position. In browser smoke tests, make `#root` a flex container so the screen's ScrollView is constrained and actually scrollable.

**Why:** React Native Web's `onLayout().y` did not match the rendered target's scroll offset in a long analysis page, and an unconstrained test root let the ScrollView expand to content height instead of scrolling.

**How to apply:** When adding or testing scroll-to-section behavior, verify browser geometry against the rendered DOM, ensure the test root has flex layout, and retain `onLayout` offsets for native platforms.
