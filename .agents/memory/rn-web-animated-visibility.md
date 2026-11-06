---
name: React Native Web animated visibility
description: Avoid unmounting animated UI when it crashes the browser preview.
---

When hiding an animated analysis card, replacing its subtree caused the React Native Web preview to blank with `ReferenceError: global is not defined` during animation cleanup. Keeping the subtree mounted and toggling its display avoids the crash.

**Why:** The current web smoke harness exposed an unmount/animation cleanup incompatibility that did not appear in typechecking.

**How to apply:** If a hide/show state change unmounts an animated subtree and the web preview blanks, keep it mounted and hide it with display styling; verify the hide/show interaction in the browser harness.
