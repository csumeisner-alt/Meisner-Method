---
name: EAS build environment
description: Current environment requirements for the account-free Meisner Method EAS builds.
---

## Rule
The current mobile app is account-free and does not use Clerk. EAS profiles need the deployment domain used by the API calls; the old Clerk-specific variables are not required for the current app.

**Why:** Clerk authentication was removed from the current mobile implementation after the earlier Clerk-enabled build configuration. The previous warning described that older state, not the current production app.

**How to apply:** Before a new EAS build, verify the profile points to `stock-analyzer-pro--npcommanderr.replit.app` and check the current source before reintroducing any authentication-specific environment variables.
