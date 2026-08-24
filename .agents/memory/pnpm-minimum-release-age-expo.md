---
name: minimumReleaseAge blocks same-day Expo SDK bumps
description: Why bumping expo to a just-released SDK patch fails install, and the sanctioned fix
---

# pnpm minimumReleaseAge vs. Expo SDK patch bumps

`pnpm-workspace.yaml` sets `minimumReleaseAge: 1440` (24h) as supply-chain defense.
Bumping `expo` to an SDK patch published **today** fails `pnpm install` with
`ERR_PNPM_NO_MATURE_MATCHING_VERSION`, because a single expo patch pulls a whole
cascade of same-day Expo-org packages (`@expo/config-plugins`, `babel-preset-expo`,
`expo-modules-core`, `expo-asset`, …), each individually age-gated.

`npx expo install` doesn't help — the Expo CLI first tries `pnpm add expo@latest`
(the newest major, also age-gated) and aborts.

**Fix:** add the trusted Expo-org patterns to `minimumReleaseAgeExclude`
(`expo`, `@expo/*`, `expo-*`, `babel-preset-expo`), then edit the version in
`package.json` and run plain `pnpm install`. This matches the documented allowlist
policy (trusted orgs like react/Meta). Remove the exclusions once the 24h window passes.

**Also:** `expo-doctor` reports pass/fail from **package.json declared versions**, not
the actually-linked tree — it can show green while `pnpm install` is still failing.
Verify the real install by requiring the package's `package.json` version in node.
