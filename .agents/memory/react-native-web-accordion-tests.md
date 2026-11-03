---
name: React Native Web accordion tests
description: Browser-test approach for accordion state in the Expo web runtime.
---

When browser-testing React Native Web accordions, assert whether the real evidence content is rendered rather than relying only on the header's `aria-expanded` attribute.

**Why:** In the current React Native Web runtime, a Pressable with `accessibilityRole="button"` and `accessibilityState={{ expanded }}` did not expose an `aria-expanded` attribute in the rendered DOM. The conditional content accurately reflected the collapsed and expanded state.

**How to apply:** Render the actual screen at the target mobile viewport, confirm evidence text is absent before interaction, click the visible testID header, then confirm the evidence appears and disappears on the next click.
