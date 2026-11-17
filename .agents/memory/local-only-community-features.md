---
name: Local-only community features
description: Product constraints for community and event features that should not collect new user data or add recurring service costs.
---

Each standard Event Arena event uses a separate paper portfolio with a fresh $100,000 starting balance; the Green Stock Exchange artwork configures new Green Bull Championship events at $500,000, and Mountain Summit configures new Mountain Championship events at $250,000. Save artwork, event type, starting balance, and ranking direction with the event once; preserve legacy and completed event rules/results instead of inferring them from displayed artwork. Do not reset or overwrite regular paper accounts. The active Event Arena account cannot be reset until its event ends; show reset as locked during the event and retain the reset-handler guard. The user explicitly approved an opt-in shared Event Arena leaderboard using a stable anonymous installation ID, a user-chosen alias editable only before the event starts, and device-submitted/self-reported scores. No sign-in is required, and the results are not tamper-proof. Clearly label scores as self-reported and do not expose installation IDs, personal details, or private trade histories to other participants.

When a participant opts out, remove their score and holdings from public rankings but preserve only the event-scoped alias lock through that event, so opting back in cannot bypass the post-start alias lock. Tell the participant this retention occurs.

Shared Event Arena scores and holding details expire 30 days after each event ends. Delete the complete public leaderboard row, including its event-scoped alias lock, at that cutoff; keep local event history untouched.

Public holding summaries may include self-reported absolute market exposure as a percentage of reported Event Arena account equity and a Long/Short direction label. Never share raw share counts, prices, cost basis, or account identifiers.

**Why:** The user approved a 30-day public retention period while preserving isolated event portfolios and anonymous participation, specified that public holding allocations must not expose raw position details, and required new Green Bull rules without retroactively changing event results.

**How to apply:** Share only opt-in event identity and self-reported results. Holding summaries may show exposure percentage and side; never disclose raw share counts, prices, cost basis, or account identifiers. Keep permanent paper accounts private and separate; do not add sign-in or imply that scores are independently verified. On opt-out, clear public score/holding data while retaining the minimal alias lock until the event passes.

Lightning Round reuses the existing Event Arena portfolio; it is not a separate portfolio. Do not show a separate Lightning Round account-unavailable card or describe its portfolio as separate.

**Why:** The user clarified that Lightning Round uses the existing event portfolio, so a separate-portfolio prompt is inaccurate.

**How to apply:** Keep Lightning Round enrollment and history tied to the existing Event Arena account, and avoid UI that implies it needs another portfolio.
