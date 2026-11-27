---
name: Lightning Round order authority
description: Server-authoritative execution rules for trades during an active Lightning Round.
---

Execute every active Lightning Round fill on the API server and persist the account, positions, lots, order, and event-tagged transaction together. The client must not report a local-only fill as complete for the shared event account. Use event and participant ownership checks, verify the quote and risk, and make retries idempotent by order ID. Request a provider quote first; only if that fails, allow a successful server-fetched quote from the last five minutes, report its observation time and age limit, and never trust a client-supplied review price. Reject if neither server source has a usable quote.

**Why:** The leaderboard and final results use server-owned, event-tagged trades; client-only fills previously appeared successful without entering that history, while transient provider failures also blocked trades despite a recent server-fetched quote.

**How to apply:** Route both immediate market executions and later pending-order fills through the same server transaction before updating the local account; keep the fallback server-owned, timestamped, bounded to five minutes, and visible to the user when used.
