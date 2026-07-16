---
name: Schema migration readiness gate (api-server)
description: How columns added after table creation are migrated safely, and the rule for endpoints referencing them.
---

# Schema migration readiness gate

Columns added to existing tables (e.g. `expense_ratio` on `paper_positions`,
`fee` on `paper_transactions`) are applied by idempotent `ALTER TABLE ... ADD
COLUMN IF NOT EXISTS` migrations run once at server boot in the api-server user
routes. The migration promise is cached; on failure it is logged loudly via the
pino `logger` (not swallowed by `console.error`) and the cached promise is
cleared so the next request retries.

**Rule:** any endpoint whose SQL references a newly-added column MUST sit behind
the `requireSchema` middleware, which awaits the migration and returns a
retryable 503 while it is still failing.

**Why:** a fire-and-forget migration (`void ensureSchema()`) let requests land
during boot — or after a silent ALTER failure — and query a half-migrated
schema, so paper trade reads/writes errored right after an app update.

**How to apply:** when you add another after-the-fact column, add its ALTER to
the migration and add `requireSchema` to every route selecting/inserting it.
