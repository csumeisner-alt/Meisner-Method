---
name: Android APK release versioning
description: Release rule for directly installable Meisner Method Android preview builds.
---

Every new directly installable Android APK must increment `android.versionCode`, and the EAS `preview` profile must remain an internal-distribution APK.

**Why:** Rebuilding with the same Android build number caused Android to report only “App not installed” when updating an existing installation, even though EAS completed and the artifact downloaded successfully.

**How to apply:** Before each GitHub-backed `preview` build, increase the version code above the last installed APK and verify `eas config --platform android --profile preview` resolves to `distribution: internal` and `buildType: apk`.