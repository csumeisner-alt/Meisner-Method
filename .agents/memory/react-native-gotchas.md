---
name: React Native / Expo mobile gotchas
description: Non-obvious crash sources in the StockSense Expo app (easing API, Expo Go native modules)
---

## `Easing.sin`, not `Easing.sine`
React Native's `Easing` has NO `sine` member — the smooth easing is `Easing.sin`.
Writing `Easing.inOut(Easing.sine)` compiles-ish but passes `undefined` into
`inOut`, and the animation throws the moment it runs (at component mount).
**Why:** this caused repeated hard crashes on the celebration overlay that JS
try/catch around audio did NOT fix — the throw was in the `Animated` easing, not audio.
**How to apply:** any `Easing.<name>` must be a real member (sin, quad, cubic,
poly, exp, circle, bounce, back, elastic, ease, linear, bezier). tsc catches this
(`Property 'sine' does not exist on type 'EasingStatic'`) — run `tsc --noEmit`
before assuming a mount crash is native.

## Expo Go can hard-crash on expo-audio native player
`createAudioPlayer` / `setAudioModeAsync` (expo-audio) handed a remote stream can
crash in Expo Go (native module set is fixed there). JS try/catch can't stop a
native crash. Gate it: `Constants.appOwnership === 'expo'` → use `expo-speech`
(`Speech.speak`) which is reliable in Expo Go; only lazy-`import('expo-audio')` in
real/EAS builds. Also expo-audio's `setAudioModeAsync` uses `playsInSilentMode` /
`allowsRecording` (NOT the expo-av `...IOS` names).
**How to apply:** remote-audio playback only works in the EAS build; Expo Go always
falls back to on-device speech.
