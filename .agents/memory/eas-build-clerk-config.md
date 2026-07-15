---
name: EAS build Clerk + domain configuration
description: What env vars must be set in eas.json for EAS-built APKs to work with Replit-managed Clerk and the correct production API domain.
---

## Rule
EAS builds do NOT run build.js (the custom OTA bundler). They bundle JS independently via Metro using only the env vars declared in eas.json's env block. Three vars must be set in every production/preview profile:

- `EXPO_PUBLIC_DOMAIN`: the deployment URL host (e.g. `stock-analyzer-pro--npcommanderr.replit.app`)
- `EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY`: the live publishable key (safe to commit — it's public, baked into every user's bundle)
- `EXPO_PUBLIC_CLERK_PROXY_URL`: `https://<EXPO_PUBLIC_DOMAIN>/api/__clerk`

**Why:** Without these, EAS APKs will: (1) point API calls at whatever stale domain was last hardcoded, (2) try to reach Clerk's direct FAPI which has no valid TLS cert on .replit.app subdomains, causing a blank screen on launch.

**How to apply:** When eas.json is updated or a new EAS build profile is added, verify all three vars are set. The live publishable key can be extracted from the production OTA bundle via regex on the bundle JS if needed (`re.findall(r'pk_live_[A-Za-z0-9_\-]+', content)`).

**Note:** EAS CLI commands are forbidden per the Expo skill (NEVER run npx eas build, eas submit, etc.). Fix config files only; let the user trigger builds.
