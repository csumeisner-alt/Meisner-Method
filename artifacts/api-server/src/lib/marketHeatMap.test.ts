import assert from "node:assert/strict";
import test from "node:test";
import {
  heatMapCacheKey,
  isHeatMapCategory,
  isHeatMapQuote,
  isHeatMapResponse,
  normalizeHeatMapSymbols,
} from "./marketHeatMap.ts";

test("heat-map category validation accepts only supported maps", () => {
  assert.equal(isHeatMapCategory("stocks"), true);
  assert.equal(isHeatMapCategory("custom"), true);
  assert.equal(isHeatMapCategory("options"), false);
});

test("custom symbols normalize case, remove duplicates, and accept common market suffixes", () => {
  assert.deepEqual(normalizeHeatMapSymbols(["aapl,MSFT", "AAPL", "BRK.B", "GC=F", "BTC-USD"]), {
    symbols: ["AAPL", "MSFT", "BRK.B", "GC=F", "BTC-USD"],
    invalid: false,
  });
});

test("custom symbol lists reject malformed symbols and more than forty entries", () => {
  assert.equal(normalizeHeatMapSymbols(["AAPL", "bad/symbol"]).invalid, true);
  assert.equal(normalizeHeatMapSymbols(Array.from({ length: 41 }, (_, i) => `T${i}`)).invalid, true);
});

test("cache keys distinguish categories and custom symbol sets", () => {
  assert.equal(heatMapCacheKey("stocks", []), "stocks:");
  assert.equal(heatMapCacheKey("custom", ["AAPL", "MSFT"]), "custom:AAPL,MSFT");
});

test("quote and response validators reject missing, stale-shaped, or non-finite data", () => {
  const quote = {
    symbol: "AAPL",
    name: "Apple",
    price: 200,
    priceChangePercent: -0.25,
    priceTimestamp: 1_760_000_000,
    marketSession: "closed",
    assetType: "stock",
    sector: "Technology",
  };
  assert.equal(isHeatMapQuote(quote), true);
  assert.equal(isHeatMapQuote({ ...quote, price: Number.NaN }), false);
  assert.equal(
    isHeatMapResponse({
      category: "stocks",
      quotes: [quote],
      unavailableSymbols: [],
      updatedAt: 1_760_000_000,
    }, "stocks"),
    true,
  );
  assert.equal(
    isHeatMapResponse({
      category: "stocks",
      quotes: [{ ...quote, price: 0 }],
      unavailableSymbols: [],
      updatedAt: 1_760_000_000,
    }, "stocks"),
    false,
  );
});