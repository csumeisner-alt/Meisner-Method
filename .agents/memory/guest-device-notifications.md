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

Android remote push also requires the Firebase client configuration to be bundled into the native app via Expo's `android.googleServicesFile`; a JavaScript bundle refresh cannot add this native initialization to an already-installed APK.

**Why:** Without the Firebase Android app registration for the exact package, `getExpoPushTokenAsync()` fails with “Default FirebaseApp is not initialized” before the API registration request runs.

**How to apply:** Keep the package registration and `google-services.json` in the mobile artifact, validate their package names match, and require a new native Android build before testing remote notifications.

The alert worker must avoid bursting quote-provider subprocesses: fetch unique symbols sequentially, retry transient quote failures, and log the concrete failure before leaving an alert pending.

**Why:** Production quote endpoints worked individually while concurrent worker fetches were all skipped as unavailable, so Expo was never called and the app gave no useful indication of the server-side failure.

**How to apply:** Preserve pending alerts when price data is unavailable, but serialize provider calls and retry before incrementing `skippedNoPrice`; publish the API worker after changing this path.

The background worker must use a price-only provider path, not the app's richer quote path: yfinance metadata lookups can exceed the worker timeout even when a current price is available.

**Why:** The published worker was timing out in `fetch_quote.py` while the public quote endpoint eventually returned a price; this prevented the worker from ever contacting Expo.

**How to apply:** Keep alert evaluation independent of metadata enrichment, and verify the published logs reference the price-only path after publishing. An in-process timer in an autoscaling API is also not a durable scheduler; production alert checks should eventually move to an always-on or scheduled worker.

Expo can return HTTP 200 while rejecting a real Android token with `InvalidCredentials`; this indicates missing or invalid EAS FCM server credentials, not a mobile permission or database problem.

**Why:** A direct send using a token stored from production returned an error ticket with `InvalidCredentials`, proving the request reached Expo but could not authenticate the Android delivery provider.

**How to apply:** Configure an FCM v1 Firebase service-account credential on the EAS project/profile. The bundled `google-services.json` is only the client config and must not be substituted for the service-account credential.

Expo push tickets with `status: ok` confirm that Expo accepted a payload, not that the phone displayed it; same-cycle alerts should be sent as one batch with each ticket handled independently.

**Why:** Two alerts for one Android installation were both accepted by the worker, but only one appeared on the device. The provider recommends batching messages, and the current acceptance metric cannot prove device delivery.

**How to apply:** Keep alert identity in each payload, batch up to Expo's per-request limit, retry only the ticket that is transient or malformed, and treat push receipts as the authoritative downstream delivery signal.