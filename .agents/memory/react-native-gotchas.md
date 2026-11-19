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

## react-native-keyboard-controller crashes Expo Go at startup
`<KeyboardProvider>` (react-native-keyboard-controller) is a THIRD-PARTY native
module NOT in the Expo Go runtime. Mounting it at the app root (`_layout.tsx`)
makes Expo Go show a blank/splash screen forever on launch — looks like a Clerk
or fonts hang, but it's the native module. `KeyboardAwareScrollView` from the same
lib crashes any screen that uses it in Expo Go too.
**Why:** Expo Go bundles a fixed native module set; only Expo SDK modules
(reanimated, gesture-handler, svg, safe-area-context, expo-audio) are present.
Community native modules are not.
**How to apply:** wrap such providers/components in a compat shim that skips them
when `Platform.OS === 'web' || Constants.appOwnership === 'expo'` and only
`require()`s the native module on the native path (use `import type` for types so
the module is never loaded in Expo Go/web). Full functionality requires a
dev-client or standalone (APK/AAB) build, not Expo Go. When an app has custom
native deps, "work in dev" = a **development build**, not Expo Go.

## Expo Go can hard-crash on expo-audio native player
`createAudioPlayer` / `setAudioModeAsync` (expo-audio) handed a remote stream can
crash in Expo Go (native module set is fixed there). JS try/catch can't stop a
native crash. Gate it: `Constants.appOwnership === 'expo'` → use `expo-speech`
(`Speech.speak`) which is reliable in Expo Go; only lazy-`import('expo-audio')` in
real/EAS builds. Also expo-audio's `setAudioModeAsync` uses `playsInSilentMode` /
`allowsRecording` (NOT the expo-av `...IOS` names).
**How to apply:** remote-audio playback only works in the EAS build; Expo Go always
falls back to on-device speech.

## Keep explicit refs off a React Native Web `GestureDetector` child
In React Native Web with React 19, `GestureDetector`'s web wrapper inspects its
immediate child with RNGH's `isRNSVGNode`. Giving that child an explicit `ref`
causes the helper to read the deprecated `element.ref` property and log a React
error. Keep the direct child ref-free (for example, wrap a scroll view in a
`View`) and put the imperative scroll ref on the nested scroll view.
**Why:** Adding a retained-scroll ref to the Analyze screen's direct gesture child
reproduced the React 19 error in the browser preview.
**How to apply:** Use that ref-free wrapper on **web only**, and verify the browser
console. On native Android, a `Gesture.Native()` used to coordinate scrolling
must attach directly to the actual ScrollView, not a plain wrapper. Branch the
gesture's immediate child by platform while retaining the same scroll content.
**Why the distinction matters:** A wrapper that avoids the React 19 browser
warning prevents the native scroll handler from owning the real Android scroll
view; browser correctness does not establish native gesture correctness.

## Long-hold vertical drags inside the browser scroller
Web `touch-action: pan-y` preserves ordinary scrolling but permits the browser to
cancel a vertical drag with `pointercancel`, even after a long hold has activated
the application's drag. Changing touch-action after activation is too late.
**Why:** Repeated browser touch checks showed the ghost disappearing on the first
move; a non-passive capturing touchmove listener on the actual scroller resolved
the cancellation without blocking ordinary pre-hold scrolling.
**How to apply:** Install the listener before touch-down, call `preventDefault`
only while the drag-active ref is true, and clear that ref on every completion,
cancellation, blur, item change, and unmount. Do not cancel a simultaneous pan
merely because the long-press recognizer exceeded its movement limit.

## CDP touch fixtures need realistic tap timing
With React Native Web, CDP-emulated taps sent as immediate `touchStart` and
`touchEnd` pairs may not synthesize a press reliably after a long sequence of
gestures and viewport changes. Give a tap a short down interval (about 35 ms).
After a successful PanResponder swipe, allow its 250 ms click-suppression window
to expire before testing a separate tap.
**Why:** the event target received touch events but its PressResponder did not
activate under the instantaneous fixture input; realistic press timing made the
same screen interaction deterministic in repeated and full-suite browser runs.
**How to apply:** use CDP touch for swipe behavior, model a nonzero duration for
tap behavior, and keep a short settling interval when validating a distinct tap
after a completed swipe. Do not change application responder ownership merely to
compensate for zero-duration test input.

After a fixture changes React state and immediately targets a newly rendered
control, poll for that control before clicking it. A second evaluate call is not
a render-completion barrier.
**Why:** a heat-map test occasionally looked for a commodity detail tile before
the quote update had committed; waiting for the selector removed the race.
**How to apply:** after async or state-driven fixture updates, wait for the
specific rendered control or expected content, then perform the interaction.
