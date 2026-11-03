---
name: Expo install-check can block validation
description: How Expo's dependency compatibility check behaves when installed Expo packages lag the expected patch version
---

# Expo install-check prompt in validation

When installed Expo packages are one patch behind the SDK's expected versions, `npx expo install --check` offers to fix the packages. In an interactive workflow, it can stay open waiting for a Y/n response; with `CI=1`, it exits nonzero and reports the outdated packages.

**Why:** An unrelated code task can appear stuck or fail its completion gate even when its tests and typechecks pass, while resolving the check may require dependency changes outside the task's scope.

**How to apply:** Check the workflow output for the package mismatch before changing code or dependencies. Upgrade only when dependency maintenance is in scope; otherwise, report the exact gate and use the documented validation-skip path only when the gate genuinely cannot be completed.