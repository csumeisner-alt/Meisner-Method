---
name: Expo Audio foreground services
description: Keep Android foreground-service declarations out of the app unless background playback or recording is actually required.
---

This app uses Expo Audio for short foreground sound effects and voice clips, not background playback or microphone recording. Do not reintroduce Expo Audio's Android playback or recording foreground services without an explicit product requirement.

**Why:** The Expo Audio version bundled with the app declares those services in its Android library manifest by default, which can trigger Google Play foreground-service policy findings even when the app does not use them.

**How to apply:** Keep the Android manifest-merger removal directives in the app's config plugin. If Expo Audio is upgraded to a version that makes service declarations opt-in, prefer its official plugin options and verify the generated manifest no longer contains the services.
