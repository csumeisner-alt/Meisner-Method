---
name: react-native-web TextInput needs real keystrokes in Playwright tests
description: Why fill() shows empty-field validation errors on RN-web forms and how to test them
---

# Testing react-native-web TextInputs: type, don't fill()

**Rule:** When a Playwright-based tester drives a react-native-web `<TextInput>`, it must type character-by-character (real key presses / `pressSequentially`), not Playwright `fill()`.

**Why:** react-native-web maps user input to `onChangeText` via specific synthetic events. `fill()` sets the DOM `value` but does not trigger `onChangeText`, so React state stays empty and controlled-form validation reports "Required"/"invalid" even though the DOM shows the value. This produced a false-positive "portfolio add-trade is broken" bug report; retesting with real typing passed.

**How to apply:** In test plans for Expo/RN-web forms, explicitly instruct: focus the field and type each character. Treat "validation says empty but the field visibly shows text" as a test-harness artifact, not necessarily an app bug — confirm with real keystrokes before changing form code.
