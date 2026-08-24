---
name: Paper table migration
description: Paper-trading database migrations must create the base tables, not just add columns, or standalone builds 500 on the positions endpoint.
---

**Rule:** Every migration that introduces paper-trading tables must include `CREATE TABLE IF NOT EXISTS` for the base tables (`paper_accounts`, `paper_positions`, `paper_transactions`) with all columns the API expects, plus `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` fallbacks for any columns that may be missing from older deployments.

**Why:** The original migration only added `expense_ratio` and `fee` columns. In production, the `paper_positions` table existed but was missing the `sector` column (or was absent entirely), causing `GET /api/user/paper/positions` to return 500 instead of the cached 503 retry path. Because the schema gate only catches migration failures, a half-created table produces a runtime 500 on every load.

**How to apply:** When changing paper-trading DB schema, add the table creation and column backfill statements inside `runSchemaMigrations()` in `artifacts/api-server/src/routes/user.ts` before any route relies on the new shape. Keep all paper endpoints behind `requireSchema` so the gate can return 503 while the migration is still running.
