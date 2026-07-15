---
name: Replit mobile (Expo) artifact deployment is a QR/OTA landing page
description: What the published .replit.app URL of an Expo mobile artifact actually serves, and why the browser never shows the app
---

# The published URL of an Expo mobile artifact is NOT a website

`server/serve.js` for the mobile artifact serves:
- `GET /` with an `expo-platform` header → the OTA platform manifest JSON (for Expo Go).
- `GET /` without that header (i.e. a browser) → a static **landing page** with a QR code
  ("Download Expo Go / Scan QR Code").

So opening `https://<app>.replit.app` in a browser correctly shows a QR launcher, not the app.
This is by design for a native mobile app — do not treat the QR page as a bug or try to "fix" it
into rendering the app.

**Why:** the app is React Native with native-only modules (gesture-handler, reanimated,
solana mobile wallet adapter, keyboard-controller). A browser cannot run it; there is no meaningful
web export to serve.

**How to apply:** when a user says "I can't access my published mobile app in the browser," the real
access paths are (1) a native **APK/AAB** from EAS, or (2) **Expo Go** scanning the QR/OTA manifest.
Steer to the APK for a standalone install. Don't chase the web deployment.
