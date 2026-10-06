---
name: Heat-map scheduled refresh failures
description: How bounded automatic refreshes should recognize React Query failures and avoid retry loops.
---

TanStack React Query's `refetch()` normally resolves to a query result with `isError` on request failure rather than rejecting. A scheduled refresh must inspect `isError`; handling a rejected promise as well keeps it safe if the query is configured to throw. Keep retries bounded and tied to the same active selection.

**Why:** Checking only for promise rejection silently misses ordinary React Query failures, leaving stale market-session labels in place.

**How to apply:** For automatic heat-map refreshes, examine the resolved result and any thrown error, permit at most one delayed retry, and cancel pending retries when the screen loses focus or its selected query changes.
