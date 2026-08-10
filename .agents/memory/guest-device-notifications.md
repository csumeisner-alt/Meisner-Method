---
name: Guest device notifications
description: Price alerts use an anonymous installation ID and current Expo push token so guests can receive Android notifications without accounts.
---

Guest price alerts are routed through a stable locally stored installation ID. The API stores the installation's current Expo push token separately from alerts, and the worker uses the latest token when delivering.

**Why:** The app is intentionally account-free; tying alert delivery to Clerk users made the existing permission/token flow return 401 for guests and silently prevented delivery.

**How to apply:** Request Android permission in the alert flow, register/update the token before enabling Save, offer an Android Settings fallback after denial, and re-check permission when the app returns from Settings. Standalone EAS builds are required for real remote push testing.

Registration failures must preserve the concrete token/configuration/API error instead of collapsing everything into a generic retry message. The Android build must include the EAS project ID when requesting the Expo token.

**Why:** A granted Android permission does not guarantee that Expo returned a token or that the token was accepted by the anonymous registration endpoint; hiding that distinction made “Try Again” impossible to diagnose.

**How to apply:** Validate the project ID and token before POSTing, require `{ ok: true }`, and render the returned error detail in the alert modal.