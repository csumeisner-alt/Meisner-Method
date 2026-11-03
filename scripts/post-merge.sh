#!/bin/bash
set -euo pipefail
pnpm install --frozen-lockfile
# Application tables are owned by API-server SQL, while lib/db/src/schema/index.ts
# is only a scaffold. Drizzle push would treat those populated tables as unknown
# and propose dropping them, so do not run it automatically after task merges.
echo "Skipping Drizzle push: application tables are not represented in the Drizzle schema."
