import assert from "node:assert/strict";
import test from "node:test";
import { getFomcRateMovement } from "../fomcRateMovement.ts";

const EVENT_DATE = "2026-10-28";
const CURRENT_URL = "https://www.federalreserve.gov/newsevents/pressreleases/monetary20261028a.htm";
const PRIOR_URL = "https://www.federalreserve.gov/newsevents/pressreleases/monetary20260916a.htm";

function range(value: number, upperBound: number, date: string, url: string) {
  return {
    value,
    upperBound,
    units: "percent, federal funds target range",
    source: {
      title: "Federal Reserve FOMC statement",
      url,
      publicationDate: date,
    },
  };
}

function event(previous: ReturnType<typeof range> | null, actual: ReturnType<typeof range> | null) {
  return {
    name: "Federal Reserve FOMC meeting",
    eventDate: EVENT_DATE,
    status: "completed" as const,
    values: { previous, actual },
  };
}

test("FOMC rate movement follows both sourced target-range bounds", () => {
  assert.equal(getFomcRateMovement(event(
    range(3.5, 3.75, "2026-09-16", PRIOR_URL),
    range(3.75, 4, EVENT_DATE, CURRENT_URL),
  )), "raised");
  assert.equal(getFomcRateMovement(event(
    range(3.75, 4, "2026-09-16", PRIOR_URL),
    range(3.75, 4, EVENT_DATE, CURRENT_URL),
  )), "held");
  assert.equal(getFomcRateMovement(event(
    range(4, 4.25, "2026-09-16", PRIOR_URL),
    range(3.75, 4, EVENT_DATE, CURRENT_URL),
  )), "lowered");
});

test("FOMC rate movement is unavailable when either dated official range is invalid", () => {
  const validPrior = range(3.5, 3.75, "2026-09-16", PRIOR_URL);
  const validActual = range(3.75, 4, EVENT_DATE, CURRENT_URL);
  assert.equal(getFomcRateMovement(event(null, validActual)), null);
  assert.equal(getFomcRateMovement(event(validPrior, null)), null);
  assert.equal(getFomcRateMovement(event(
    range(3.5, 3.75, "2026-10-01", PRIOR_URL),
    validActual,
  )), null, "the publication date must match the official statement URL");
  assert.equal(getFomcRateMovement(event(
    validPrior,
    range(3.75, 4, "2026-10-27", CURRENT_URL),
  )), null, "the actual statement must be dated on the event date");
  assert.equal(getFomcRateMovement(event(
    validPrior,
    range(3.75, 4, EVENT_DATE, "https://example.com/monetary20261028a.htm"),
  )), null, "both statements must be official Federal Reserve pages");
});

test("FOMC rate movement is unavailable for inconsistent target-range changes", () => {
  assert.equal(getFomcRateMovement(event(
    range(3.5, 3.75, "2026-09-16", PRIOR_URL),
    range(3.75, 3.75, EVENT_DATE, CURRENT_URL),
  )), null);
  assert.equal(getFomcRateMovement({
    ...event(
      range(3.5, 3.75, "2026-09-16", PRIOR_URL),
      range(3.75, 4, EVENT_DATE, CURRENT_URL),
    ),
    status: "upcoming",
  }), null);
});
