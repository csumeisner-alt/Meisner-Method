---
name: Paper-trading fee/cash-flow consistency
description: Any cost applied to a paper trade's net P&L must also flow through cash and the value-history reconstruction, or equity metrics drift.
---

# Paper-trading fee / cash-flow consistency

When you add any per-trade cost (fund fee, commission, spread) to StockSense paper trading in `artifacts/mobile/app/paper.tsx`, it must be applied in **three** places that all derive the account's equity independently:

1. The transaction's displayed net P&L (`realizedPnL - fee`) and analytics/win-rate.
2. The live account **cash** update in `confirmSell` — credit `total - fee`, not `total`.
3. `buildValueHistory()` — it *reconstructs* cash from the transaction log to draw the growth chart; on SELL it must credit `tx.total - (tx.fee ?? 0)`.

**Why:** During Task #35 the fee was recorded on the transaction and shown in net P&L, but cash was still credited the full proceeds. Result: account value, total return, and the growth chart all overstated performance versus the stated fee model — a blocking correctness bug caught in code review. The final point of `buildValueHistory` uses live `currentCash` (correct) while intermediate points re-derive from transactions, so missing the fee there makes only the *history* wrong, which is easy to overlook.

**How to apply:** Treat "shown in net P&L" and "moved real cash" as two separate obligations. Grep for every place that sums `tx.total` or updates `account.cash` on a sell and make sure the cost is subtracted in each. Same principle applies to the real-portfolio tab if it ever reconstructs equity from cash flows.
