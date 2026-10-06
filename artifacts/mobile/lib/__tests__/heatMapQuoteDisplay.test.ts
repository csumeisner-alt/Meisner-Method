import assert from "node:assert/strict";
import test from "node:test";
import {
  formatHeatMapNextOpen,
  formatHeatMapQuoteAge,
  getHeatMapSessionLabel,
  getHeatMapRegularOpenRefreshTimestamp,
  getNextHeatMapRegularOpenTimestamp,
  HEAT_MAP_CRYPTO_REFRESH_INTERVAL_MS,
  HEAT_MAP_CRYPTO_RESUME_STALE_AFTER_SECONDS,
  HEAT_MAP_REGULAR_SESSION_REFRESH_INTERVAL_MS,
  isDisplayableHeatMapQuote,
  shouldRefreshCryptoHeatMapOnResume,
  shouldRefreshHeatMapDuringRegularSession,
} from "../heatMapQuoteDisplay.ts";

test("heat-map labels each quote session distinctly", () => {
  assert.deepEqual(
    (["regular", "pre_market", "after_hours", "closed", "unknown"] as const).map(getHeatMapSessionLabel),
    ["Regular", "Pre-market", "After-hours", "Last close", "Unknown"],
  );
});

test("heat-map schedules the earliest upcoming regular open for closed and after-hours stock quotes", () => {
  const now = 1_800_000_000;
  assert.equal(getNextHeatMapRegularOpenTimestamp([
    { assetType: "stock", marketSession: "closed", nextRegularOpenTimestamp: now + 120 },
    { assetType: "etf", marketSession: "after_hours", nextRegularOpenTimestamp: now + 60 },
    { assetType: "stock", marketSession: "regular", nextRegularOpenTimestamp: now + 1 },
    { assetType: "cryptocurrency", marketSession: "closed", nextRegularOpenTimestamp: now + 2 },
    { assetType: "stock", marketSession: "closed", nextRegularOpenTimestamp: now - 1 },
    { assetType: "stock", marketSession: "closed", nextRegularOpenTimestamp: null },
  ], now), now + 60);
  assert.equal(getNextHeatMapRegularOpenTimestamp([], now), null);
});

test("heat-map retains the scheduled refresh deadline after a missed regular open", () => {
  const open = 1_800_000_000;
  assert.equal(getHeatMapRegularOpenRefreshTimestamp([
    { assetType: "stock", marketSession: "closed", nextRegularOpenTimestamp: open - 60 },
    { assetType: "etf", marketSession: "after_hours", nextRegularOpenTimestamp: open + 60 },
    { assetType: "stock", marketSession: "regular", nextRegularOpenTimestamp: open - 120 },
    { assetType: "cryptocurrency", marketSession: "closed", nextRegularOpenTimestamp: open - 180 },
    { assetType: "stock", marketSession: "closed", nextRegularOpenTimestamp: null },
  ]), open - 60);
  assert.equal(getHeatMapRegularOpenRefreshTimestamp([]), null);
});

test("heat-map refreshes stocks and ETFs on a one-minute cadence only during their regular session", () => {
  assert.equal(HEAT_MAP_REGULAR_SESSION_REFRESH_INTERVAL_MS, 60_000);
  assert.equal(shouldRefreshHeatMapDuringRegularSession("stocks", [
    { assetType: "stock", marketSession: "regular" },
  ]), true);
  assert.equal(shouldRefreshHeatMapDuringRegularSession("etfs", [
    { assetType: "etf", marketSession: "regular" },
  ]), true);
  assert.equal(shouldRefreshHeatMapDuringRegularSession("custom", [
    { assetType: "etf", marketSession: "regular" },
  ]), true);
  assert.equal(shouldRefreshHeatMapDuringRegularSession("stocks", [
    { assetType: "stock", marketSession: "after_hours" },
  ]), false);
  assert.equal(shouldRefreshHeatMapDuringRegularSession("etfs", [
    { assetType: "etf", marketSession: "closed" },
  ]), false);
  assert.equal(shouldRefreshHeatMapDuringRegularSession("commodities", [
    { assetType: "stock", marketSession: "regular" },
  ]), false);
  assert.equal(shouldRefreshHeatMapDuringRegularSession("cryptocurrency", [
    { assetType: "cryptocurrency", marketSession: "regular" },
  ]), false);
});

test("crypto heat-map refreshes on resume only when its quote batch is stale", () => {
  const now = 1_800_000_000;
  const freshBatch = now - HEAT_MAP_CRYPTO_RESUME_STALE_AFTER_SECONDS + 1;
  const staleBatch = now - HEAT_MAP_CRYPTO_RESUME_STALE_AFTER_SECONDS;

  assert.equal(HEAT_MAP_CRYPTO_RESUME_STALE_AFTER_SECONDS, 5 * 60);
  assert.equal(shouldRefreshCryptoHeatMapOnResume("cryptocurrency", freshBatch, now), false);
  assert.equal(shouldRefreshCryptoHeatMapOnResume("cryptocurrency", staleBatch, now), true);
  assert.equal(shouldRefreshCryptoHeatMapOnResume("cryptocurrency", null, now), true);
  assert.equal(shouldRefreshCryptoHeatMapOnResume("stocks", staleBatch, now), false);
});

test("crypto heat-map uses a bounded one-minute foreground refresh cadence", () => {
  assert.equal(HEAT_MAP_CRYPTO_REFRESH_INTERVAL_MS, 60_000);
});

test("heat-map quote ages stay compact across minutes, hours, and days", () => {
  const now = 1_800_000_000;
  assert.equal(formatHeatMapQuoteAge(now - 20, now), "Just now");
  assert.equal(formatHeatMapQuoteAge(now - 11 * 60, now), "11m ago");
  assert.equal(formatHeatMapQuoteAge(now - 4 * 60 * 60, now), "4h ago");
  assert.equal(formatHeatMapQuoteAge(now - 2 * 24 * 60 * 60, now), "2d ago");
  assert.equal(formatHeatMapQuoteAge(null, now), "Time unavailable");
});

test("heat-map next-open time uses the listed exchange timezone and includes the next session date", () => {
  const nextOpen = Date.parse("2024-12-02T14:30:00Z") / 1000;
  assert.equal(
    formatHeatMapNextOpen(nextOpen, "after_hours", "etf", "America/New_York", 1_700_000_000),
    "Next open: Dec 2\n9:30 AM EST",
  );
  assert.equal(
    formatHeatMapNextOpen(nextOpen, "closed", "stock", "America/New_York", 1_700_000_000),
    "Next open: Dec 2\n9:30 AM EST",
  );
});

test("heat-map next-open time is omitted when not applicable or unavailable", () => {
  const nextOpen = Date.parse("2024-12-02T14:30:00Z") / 1000;
  assert.equal(formatHeatMapNextOpen(nextOpen, "regular", "stock", "America/New_York", 1_700_000_000), null);
  assert.equal(formatHeatMapNextOpen(nextOpen, "closed", "cryptocurrency", "America/New_York", 1_700_000_000), null);
  assert.equal(formatHeatMapNextOpen(null, "closed", "stock", "America/New_York", 1_700_000_000), null);
  assert.equal(formatHeatMapNextOpen(Number.NaN, "closed", "stock", "America/New_York", 1_700_000_000), null);
  assert.equal(formatHeatMapNextOpen(nextOpen, "closed", "stock", "America/New_York", nextOpen), null);
  assert.equal(formatHeatMapNextOpen(nextOpen, "closed", "stock", null, 1_700_000_000), null);
});

test("heat-map excludes missing and stale quotes, with a shorter crypto freshness window", () => {
  const now = 1_800_000_000;
  assert.equal(isDisplayableHeatMapQuote({ priceTimestamp: null, assetType: "stock" }, now), false);
  assert.equal(isDisplayableHeatMapQuote({ priceTimestamp: now - 121 * 60 * 60, assetType: "stock" }, now), false);
  assert.equal(isDisplayableHeatMapQuote({ priceTimestamp: now - 49 * 60 * 60, assetType: "cryptocurrency" }, now), false);
  assert.equal(isDisplayableHeatMapQuote({ priceTimestamp: now - 47 * 60 * 60, assetType: "cryptocurrency" }, now), true);
  assert.equal(isDisplayableHeatMapQuote({ priceTimestamp: now, assetType: "stock" }, now), true);
});