---
name: Live Event Arena leaderboards
description: Product expectations and privacy boundaries for refreshing opted-in Event Arena standings.
---

**Rule:** The purpose of Event Arena leaderboards is for opted-in participants to see all players' current standings, refreshing every two minutes or when someone manually refreshes. Regular-event account snapshots must remain scoped to that isolated event account; never expose raw share counts or unrelated account activity. For active Lightning Rounds, a score is live only when the server recalculates it from event-recorded fills and usable current quotes; any participant-submitted fallback must be labeled stale even if its timestamp is recent.

**Why:** The user explicitly stated this is the point of the leaderboards and described the two-minute and manual refresh expectations.

**How to apply:** When changing leaderboard refresh, refresh every participant from available event-scoped data, bypass the automatic interval on a manual refresh, mark stale scores clearly—including Lightning entries without a server score—and keep private valuation data out of public responses.

**Rule:** When Lightning Round returns tie, rank by the stable participant identifier after the return value; do not use aliases or refresh timestamps as tie-breakers for saved ranks.

**Why:** Aliases can change between worker refreshes, which must not make tied participants appear to pass each other in saved history.

**How to apply:** Keep the active-history and final-result ranking queries aligned, and never expose the private identifier as part of public leaderboard data.
