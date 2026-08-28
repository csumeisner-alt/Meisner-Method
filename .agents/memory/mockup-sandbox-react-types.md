---
name: Mockup sandbox React types
description: Why the mockup sandbox pins React type packages independently from the workspace catalog
---

The mockup sandbox must use `@types/react` 19.1.x and the matching `@types/react-dom` 19.1.x while its runtime React remains 19.1.0. Do not blindly switch these package entries to the workspace-wide 19.2 catalog versions.

**Why:** React 19.2 type definitions are not structurally interchangeable with the 19.1 definitions used by some preview dependencies. TypeScript then reports false incompatibilities for ordinary DOM refs even though the components render correctly.

**How to apply:** When changing sandbox dependencies or regenerating its lockfile, preserve the explicit 19.1 type pins and verify `pnpm --filter @workspace/mockup-sandbox run typecheck`.