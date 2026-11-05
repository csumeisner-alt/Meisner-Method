---
name: Commodity event and report evidence
description: Validation rules for commodity event schedules, published report values, and comparable supply-demand history.
---

Only use dated official event announcements for confirmed commodity-calendar dates. A date passing on a schedule is not, by itself, proof that a report was published. Attach previous or actual values only when they come from a matching dated observation; never infer consensus. Historical averages require multiple prior observations with matching units and reporting periods.

Use dated BLS CPI archive pages for both actual and previous values; validate the archived release date, reference month, units, and index, and leave values unavailable when a release is missing or explicitly revised. The current BLS series endpoint is current-vintage, not a historical release snapshot.

**Why:** Official schedules can change, reports can be revised or delayed, and mixing reporting periods or estimates can make commodity context look more certain than its sources support.

**How to apply:** When adding event sources or supply-and-demand series, validate source identity, affected commodity, event/release date, reporting period, units, and freshness before rendering. Keep unknown dates and unsupported values explicitly unavailable.

For USDA NASS livestock text reports, derive each observation from the report's dated table headings, not its filename alone. Cattle January 1 and July 1 counts are separate seasonal periods; compare averages only within the same reference month. In quarterly Hogs and Pigs reports, December table dates depend on the release vintage: a December release reports December dates in its two year columns, while other quarterly releases carry the previous December's data. Keep blank or `(NA)` cells aligned to their year instead of shifting a later value into the missing period.

**Why:** NASS reports can include multiple tables and changing reference-year windows; loose row matching can mistake reliability tables for inventory or assign a valid count to the wrong date.

**How to apply:** When parsing a new NASS livestock report, isolate the data table using its title and units, validate each cell against its year/quarter column, and use release dates to select the latest vintage for each reporting period.
