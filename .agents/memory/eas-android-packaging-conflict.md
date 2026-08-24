---
name: EAS Android mergeReleaseJavaResource failure
description: How to diagnose and fix a Gradle "N files found with path META-INF/..." packaging conflict in EAS Android builds
---

# EAS Android build fails at `:app:mergeReleaseJavaResource`

EAS surfaces this only as `EAS_BUILD_UNKNOWN_GRADLE_ERROR` ("Gradle build failed with unknown error").
The real cause is buried in the build log. Fetch the signed log URL from
`eas build:list --json` → `logFiles[0]`, then search it for `FAILURE:` /
`What went wrong` / `mergeReleaseJavaResource FAILED`. The actionable message looks like:

```
2 files found with path 'META-INF/versions/9/OSGI-INF/MANIFEST.MF' from inputs:
  - com.squareup.okhttp3:logging-interceptor:...
  - org.jspecify:jspecify:...
```

Two transitive jars ship the same non-code resource and Android's resource merger refuses to pick one.

**Fix:** add a packaging rule via the `expo-build-properties` config plugin in `app.json`:
`android.packagingOptions.pickFirst` listing the conflicting path(s). Keep a broad set of
common META-INF conflicts (LICENSE/NOTICE/DEPENDENCIES/*.kotlin_module) to avoid whack-a-mole.

**Why:** managed Expo has no `android/` dir to hand-edit `build.gradle`; the plugin injects the
gradle `packaging {}` block during prebuild. `pickFirst` (not `exclude`) is safest — it keeps one
copy rather than dropping the resource entirely.

**How to apply:** the "unknown gradle error" is never really unknown — always pull the full log and
grep for the FAILURE block before changing anything. A build that fails at merge/lint got through
compilation, so it is a packaging/config issue, not a code issue.
