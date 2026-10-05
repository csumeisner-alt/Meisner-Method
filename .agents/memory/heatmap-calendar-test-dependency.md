---
name: Heat-map calendar test dependency
description: Explains why calendar-backed Python heat-map tests can fail when the runtime lacks exchange_calendars.
---

The heat-map's exchange-calendar lookup catches import failures and returns no calendar. In an environment without `exchange_calendars`, equity and CME futures session checks therefore return `unknown`, and next-open calculations return no timestamp; ICE commodity schedule tests do not need that package.

**Why:** This Python runtime did not have the optional calendar library installed, causing many unrelated tests in the heat-map module to fail without an import traceback.

**How to apply:** When calendar-backed session tests fail broadly with `unknown`, check whether `exchange_calendars` is installed before changing their scheduling logic.
