---
name: Expo package/SDK mismatch crashes standalone builds only
description: Wrong-SDK expo-* package versions crash the APK at launch but work fine in Expo Go; how to detect and prevent.
---

**Rule:** Every `expo-*` package must match the version in `expo/bundledNativeModules.json` for the installed SDK. A package from a newer SDK line (e.g. expo-notifications 57.x on SDK 54, which expects ~0.32.x) compiles fine on EAS but crashes the standalone app instantly at launch — expo-modules-core instantiates ALL native modules during Android `Application.onCreate`, before any JS or error boundary.

**Why:** Expo Go bundles its own SDK-matched native modules and ignores installed native code, so dev testing NEVER catches this. The broken APK "keeps stopping" with zero JS-level symptoms.

**How to apply:**
- After any mobile dependency change run `cd artifacts/mobile && npx expo install --check` (registered as validation command `expo-deps`). Must be clean before an EAS build.
- Diagnose suspected native crashes by diffing APKs (they're zips): `unzip`, then compare `lib/arm64-v8a/*.so` lists, `grep -c "expo/modules/<name>" classes*.dex`, and `strings assets/index.android.bundle` — reveals which build first included a native module.
- `strings` on Hermes bytecode merges entries; grep substrings on the raw bundle, not exact lines.

**EAS CLI detachment quirk:** background `nohup ... &` from a ShellExec dies with the shell session — the log file even vanishes. Use `setsid nohup ... </dev/null > log 2>&1 &` and verify the log file exists after ~8s before returning.
