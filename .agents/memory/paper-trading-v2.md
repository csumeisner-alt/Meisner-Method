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

**Why:** Order placement can race with quote polling because React render state may lag behind the mutable refs used by the polling loop; saving a fill from render-time arrays can deduct cash while overwriting the newly-created position.

**How to apply:** Paper execution must read the latest refs, commit account/positions/lots/transactions/orders together, and serialize local cache writes so older async snapshots cannot overwrite newer fills.

## Order lifecycle and execution safeguards

Pending orders are user-editable and cancellable until filled. Their committed buying power or shares must be included in every risk check; editing excludes the existing order from its own reservation. A pending order must retain buy-side metadata until it fills.

**Why:** Without visible lifecycle controls, limit/stop orders could remain indefinitely and users could unknowingly stack commitments that later failed or were auto-cancelled.

**How to apply:** Preserve an edited order's ID and placement time, reset its trailing reference, clear edit state on dismissal, and use the latest refs for the submit-time risk check.

Limit and stop-limit execution must clamp simulated slippage to the limit price. FIFO sells should use consumed lot cost/holding time for fund fees, and legacy positions without lots need a synthetic basis lot before closing.

**Why:** Random slippage could make a limit fill worse than its limit, while aggregate-position fees and missing lots made realized P&L inconsistent with FIFO accounting.

**How to apply:** Keep these safeguards in pure engine functions and cover them with Node tests before changing the paper screen.

Order cards need their own vertical layout; they must not reuse the horizontal position-card container because the header, details, and edit/delete controls get clipped on narrow Android screens.

**Why:** The pending-order actions existed in code but were visually off-screen in the installed app, so users had no way to edit or remove orders.

**How to apply:** Keep pending-order actions full-width and visible, and persist deletion by removing the order from the local cache rather than only marking it cancelled.
