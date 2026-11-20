---
name: Event Arena notification policy
description: Reminder frequency, recoverable local preferences, and compatibility with older Android builds.
---

**Rule:** Provide three scheduled reminders per regular event and eligible Lightning Round, and keep the enable/disable control usable after a preference-server or scheduling error.

**Why:** The user reported Android scheduling failing with `org.json.JSONObject`, explicitly requested three notifications for each event format, and asked to retain the toggle.

**How to apply:** Keep local scheduling independent of remote-push registration. Save unsynced local choices durably and never replace them with stale server preferences on restart. Preserve permission handling, retry, duplicate prevention, and event-only cancellation.

**Rule:** Avoid object-valued notification data in locally scheduled Android reminders while supporting already-installed older builds; preserve reminder metadata in a deterministic identifier instead.

**Why:** Older native notification implementations can fail while serializing `JSONObject` data into their persisted schedule. Changing date formats alone does not remove that serialization path, and a newer JavaScript SDK does not repair native code in an existing APK.

**How to apply:** Continue recognizing legacy metadata-bearing notifications for cleanup. Do not claim physical delivery was verified based only on payload/controller tests; that requires a real Android build and device.
