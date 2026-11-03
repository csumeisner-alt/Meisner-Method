---
name: Heat-map extended-hours schedules
description: Rules for deciding whether international equity pre-market or after-hours periods can be labeled active.
---

Treat extended-hours eligibility as venue-specific. Exchange calendars establish regular sessions but do not prove that pre-market or after-hours trading exists. Use official exchange sources to verify the exact local-time window, covered instruments, and whether a phase allows trading rather than only order entry or an auction. Do not infer windows for other exchanges or ambiguous venue aliases. If coverage is incomplete, leave the period non-active.

**Why:** Extended-session phases can differ by venue, instrument group, and session type; applying one market's timetable to an alias or adjacent venue can show a misleading active label.

**How to apply:** Before adding an exchange, verify current official schedule documentation and test both inclusive/exclusive boundaries in its local timezone, including daylight-saving transitions and exchange holidays.
