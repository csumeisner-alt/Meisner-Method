---
name: Mobile pure-math testing
description: How financial math in the StockSense mobile app is factored for deterministic unit testing.
---

# Mobile pure-math testing

Pure financial math (fund fees, sell settlement, reconstructed value history,
win-rate, closed-trade aggregation) is factored out of the screen `.tsx` files
into RN-import-free modules under `artifacts/mobile/lib/`
(`paperMath.ts`, `portfolioMath.ts`). The screens (`app/paper.tsx`,
`app/portfolio.tsx`) import from these libs so the code under test IS the code
that ships.

**Why:** the math lived inline in components (confirmSell, SummaryCard, analytics
win rate) mixed with React Native imports, so it could not be imported into a
plain Node test. Duplicating it in a test would not guard the real code.

**How to apply:**
- Keep these lib modules free of any `react`/`react-native`/`expo` import so they
  stay Node-importable.
- Tests live in `artifacts/mobile/lib/__tests__/*.test.ts` using Node's built-in
  `node:test` + `node:assert/strict`. Run with `pnpm --filter @workspace/mobile run test`
  (script uses `node --experimental-strip-types --test`). Test imports use explicit
  `.ts` extensions, which is why `tsconfig.json` sets `allowImportingTsExtensions`.
- Do NOT add `"type":"module"` to the mobile package.json to silence the
  type-stripping warning — Expo config files (babel/metro) rely on CommonJS.
- Validation `typecheck` step is scoped to mobile (`typecheck:libs && --filter @workspace/mobile typecheck`)
  because a full-workspace typecheck is red from pre-existing errors in the
  unrelated `mockup-sandbox` artifact.
