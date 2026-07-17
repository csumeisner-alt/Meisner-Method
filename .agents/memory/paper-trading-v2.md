---
name: Paper trading engine v2 architecture
description: Key decisions, file layout, and gotchas for the upgraded paper trading engine (orders, lots, T+2, dividends, slippage, FIFO, risk checks).
---

# Paper Trading Engine v2

## Architecture summary

- **`artifacts/mobile/lib/paperMath.ts`** — shared types (`PaperOrder`, `PaperLot`, `UnsettledItem`, extended `PaperAccount`/`PaperTransaction`). Also exports `fundFee`, `buildValueHistory`, `computeSellResult`, etc.
- **`artifacts/mobile/lib/paperEngine.ts`** — pure functions: `applySlippage`, `evaluateOrder`, `fifoSell`, `settleCash`, `creditDividends`, `checkRisk`, `fillOrder`. No React/RN imports — safe for Node test runner.
- **`artifacts/mobile/components/OrderSheet.tsx`** — bottom-sheet component for buy/sell order entry. Accepts `onConfirm(ConfirmOrderArgs)`.
- **`artifacts/mobile/app/paper.tsx`** — main screen; cache upgraded to `@stocksense/paper_v2`; adds `orders`/`lots` state; `saveAll()` helper to update all slices atomically.
- **`artifacts/api-server/src/routes/user.ts`** — `paper_orders`, `paper_lots` tables; `unsettled_items`/`last_dividend_credit` columns on `paper_accounts`; GET routes + sync extended.

## Key decisions

**Why:** Sell proceeds go into `unsettledItems` (T+2), not `account.cash`, so `account.cash` = true buying power. UI shows `CASH+T+2` label when there's unsettled cash.

**How to apply:** Any new feature that reads buying power must use `account.cash` (settled only), not `account.cash + account.unsettledCash`.

**Why:** Trailing stop trail amount is computed from `trailRef` (the high/low water mark), not from `currentPrice`. Bug was: using `currentPrice * pct` made the trigger math wrong.

**How to apply:** In `evaluateOrder`, trailing stop computes `trailAmt = ref * (trailPct / 100)`.

**Why:** `paperEngine.ts` uses `.ts` extension in its import of `paperMath.ts` so Node's `--experimental-strip-types` test runner can resolve it without TypeScript paths.

**How to apply:** Any pure-math lib file that is imported by tests must use `.ts` extension for all sibling imports.

**Why:** `syncToServer` now takes `(accts, pos, txns, orders, lots, aid)` — always pass all 6 args. Use `saveAll()` for multi-slice updates to avoid race conditions.
