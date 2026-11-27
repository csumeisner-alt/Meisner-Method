---
name: Lightning Round order authority
description: Server-authoritative execution rules for trades during an active Lightning Round.
---

Execute every active Lightning Round fill on the API server and persist the account, positions, lots, order, and event-tagged transaction together. The client must not report a local-only fill as complete for the shared event account. Use event and participant ownership checks, verify the current quote and risk, and make retries idempotent by order ID.

**Why:** The leaderboard and final results use server-owned, event-tagged trades; client-only fills previously appeared successful without entering that history.

**How to apply:** Route both immediate market executions and later pending-order fills through the same server transaction before updating the local account.
