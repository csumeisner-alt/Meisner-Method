---
name: ICE Dollar Index sessions
description: Venue-specific session and baseline holiday rules for the ICE U.S. Dollar Index futures symbol DX=F.
---

Treat DX=F as an ICE Futures U.S. contract, not a CME FX future or an ICE commodity. ICE's product page specifies 8:00 p.m.–5:00 p.m. ET Sunday–Friday, with Sunday opening at 6:00 p.m. ET for Monday's trade date. ICE's annual calendar identifies New Year's Day and Christmas as full closures for the Dollar Index; other holidays may have modified hours announced in exchange notices. CME calendars, CME group overrides, and CME holiday cutoffs must not determine DX=F sessions.

**Why:** Applying CME's Good Friday closure or Juneteenth cutoff to DX=F produces incorrect labels, and its Sunday open differs from the CME futures schedule.

**How to apply:** Keep DX=F routing isolated to its ICE session logic. Check full-day closure against the ICE trade date, including the preceding evening session; handle date-specific early closes only through the separately maintained ICE notice process.

Sources:
- https://www.ice.com/products/194/us-dollar-index-futures
- https://www.ice.com/publicdocs/futures_us/exchange_notices/ICE_Futures_US_Exchange_Notice_2026_Holiday_Calendar_20260609.pdf
