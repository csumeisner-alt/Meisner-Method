import assert from "node:assert/strict";
import test from "node:test";
import {
  formatHeatMapQuoteAge,
  getHeatMapSessionLabel,
  isDisplayableHeatMapQuote,
} from "../heatMapQuoteDisplay.ts";

test("heat-map labels each quote session distinctly", () => {
  assert.deepEqual(
    (["regular", "pre_market", "after_hours", "closed", "unknown"] as const).map(getHeatMapSessionLabel),
    ["Regular", "Pre-market", "After-hours", "Last close", "Unknown"],
  );
});

test("heat-map quote ages stay compact across minutes, hours, and days", () => {
  const now = 1_800_000_000;
  assert.equal(formatHeatMapQuoteAge(now - 20, now), "Just now");
  assert.equal(formatHeatMapQuoteAge(now - 11 * 60, now), "11m ago");
  assert.equal(formatHeatMapQuoteAge(now - 4 * 60 * 60, now), "4h ago");
  assert.equal(formatHeatMapQuoteAge(now - 2 * 24 * 60 * 60, now), "2d ago");
  assert.equal(formatHeatMapQuoteAge(null, now), "Time unavailable");
});

test("heat-map excludes missing and stale quotes, with a shorter crypto freshness window", () => {
  const now = 1_800_000_000;
  assert.equal(isDisplayableHeatMapQuote({ priceTimestamp: null, assetType: "stock" }, now), false);
  assert.equal(isDisplayableHeatMapQuote({ priceTimestamp: now - 121 * 60 * 60, assetType: "stock" }, now), false);
  assert.equal(isDisplayableHeatMapQuote({ priceTimestamp: now - 49 * 60 * 60, assetType: "cryptocurrency" }, now), false);
  assert.equal(isDisplayableHeatMapQuote({ priceTimestamp: now - 47 * 60 * 60, assetType: "cryptocurrency" }, now), true);
  assert.equal(isDisplayableHeatMapQuote({ priceTimestamp: now, assetType: "stock" }, now), true);
});