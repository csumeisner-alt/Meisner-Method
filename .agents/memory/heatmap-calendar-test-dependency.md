---
name: Heat-map calendar test dependency
description: Explains why calendar-backed Python heat-map tests can fail when the runtime lacks exchange_calendars.
---

The heat-map's exchange-calendar lookup catches import failures and returns no calendar. In an environment without `exchange_calendars`, equity and CME futures session checks therefore return `unknown`, and next-open calculations return no timestamp; ICE commodity schedule tests do not need that package. The workspace Python runtime can lack the package even when it is already listed in `pyproject.toml` and `uv.lock`; installing the declared package through Replit's package manager populates the runtime environment.

**Why:** A missing runtime install caused unrelated heat-map tests to fail without an import traceback, even though the project dependency was already declared.

**How to apply:** When calendar-backed session tests fail broadly with `unknown`, check whether the active `python3` can import `exchange_calendars`. If the project already declares it, install/sync that dependency through package management before changing scheduling logic.
