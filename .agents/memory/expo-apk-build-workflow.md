---
name: Expo APK build workflow
description: Repeatable GitHub-backed Expo Android APK build settings for Meisner Method.
---

Build the Android APK from the Expo dashboard's GitHub build flow:

1. Use repository `csumeisner-alt/Meisner-Method`.
2. Set the base directory to `artifacts/mobile` because this is a pnpm monorepo and the Expo app's `eas.json` is inside that directory.
3. Use branch `main` or a full 40-character commit SHA. Do not use an abbreviated SHA in the Git ref field.
4. Select the exact profile `preview` with no trailing whitespace. The `preview` profile produces an Android APK; `production` produces an Android App Bundle.
5. Select the `Preview` environment and leave EAS Submit disabled.

The mobile package pins `pnpm@10.26.1`, and the Android profiles specify the `latest` EAS build image. Keep those settings in sync with the repository's frozen pnpm lockfile.