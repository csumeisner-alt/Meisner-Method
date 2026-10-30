---
name: Post-merge Drizzle safety
description: Handle Drizzle schema pushes safely in non-interactive post-merge setup.
---

Inspect the full post-merge logs when `drizzle-kit push` runs without a TTY: it can report a populated-table data-loss warning, then fail on its interactive confirmation even when the setup callback reports success. Never add `--force` to bypass that prompt without a reviewed schema migration.

**Why:** The app's Drizzle schema was only a scaffold, while application tables were created and maintained through API-server SQL. A push proposed deleting populated tables, and the non-interactive runner did not reliably surface the CLI failure as a setup error.

**How to apply:** Before enabling an automatic Drizzle push, confirm the schema represents all app-owned tables and inspect warnings. Keep post-merge setup non-destructive until that source of truth is reviewed.
