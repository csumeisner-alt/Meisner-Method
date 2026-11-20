---
name: Main-tab navigation
description: Why the five retained main screens must use a real tab navigator rather than singular native-stack navigation.
---

Keep main-screen selection in a real tab navigator. Do not restore a native stack of singular main screens, even with animations disabled.

**Why:** While investigating Android grey-screen freezes, executing the installed Expo Router stack reducer confirmed that revisiting singular screens removes and reinserts their existing native routes. That reducer explicitly warns that this operation can freeze React Native Screens. Disabling animations left that operation intact. A real tab router instead changes the active index without reordering the retained route keys.

**How to apply:** Keep detail screens in an outer stack and the five main screens in one retained tab container. Select existing tabs for main-to-main links; dismiss details to the existing container for detail-to-main links instead of pushing or replacing it. Preserve the public URLs, existing custom bottom bars, and in-memory screen state.

Router tests should exercise the installed navigation reducer, not an array that imitates expected behavior. Browser checks establish interaction and state retention, not proof that an Android-native freeze is resolved; native confirmation still requires an Android device or emulator.
