---
name: TS project references resolve to dist .d.ts, not src
description: Why a workspace package can show "no exported member" for a symbol that src clearly exports.
---

# Stale dist declarations in TS project references

In this pnpm monorepo, artifacts consume `@workspace/*` libs via TypeScript
**project references** (`references: [{ path: ../../lib/<pkg> }]`). Even though
a lib's `package.json` `exports` points at `./src/index.ts`, `tsc` type-checks
the consumer against the **referenced project's emitted declarations in `dist/`**,
not `src/`.

**Symptom:** consumer reports `TS2305: Module '@workspace/<pkg>' has no exported
member 'X'` even though `src/index.ts` clearly re-exports `X`. Meanwhile Metro /
runtime work fine because bundlers follow `exports` → `src`.

**Root cause:** the lib is `composite` + `emitDeclarationOnly`; someone edited
`src` but never regenerated `dist/*.d.ts`, so the declarations are stale.

**Fix:** rebuild the lib's declarations — `cd lib/<pkg> && npx tsc -b --force`
(dist `.d.ts` files are committed to git, so this updates tracked files). This
resolves the phantom error without touching consumer code and keeps runtime
behavior identical.

**Why:** prefer rebuilding stale declarations over rewriting the consumer to
avoid a legit exported API — the consumer wasn't wrong, the build artifact was.
**How to apply:** when a `@workspace/*` import fails to see a symbol, first
compare `lib/<pkg>/src/index.ts` against `lib/<pkg>/dist/index.d.ts` and check
mtimes before assuming the export was removed.
