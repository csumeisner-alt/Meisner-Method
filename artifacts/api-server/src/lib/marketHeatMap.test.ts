import assert from "node:assert/strict";
import test from "node:test";
import {
  heatMapCacheKey,
  heatMapRequestCacheKey,
  isHeatMapCategory,
  isHeatMapPeriod,
  isHeatMapQuote,
  isHeatMapResponse,
  isHeatMapSector,
  normalizeHeatMapSymbols,
} from "./marketHeatMap.ts";

test("heat-map category validation accepts only supported maps", () => {
  assert.equal(isHeatMapCategory("stocks"), true);
  assert.equal(isHeatMapCategory("custom"), true);
  assert.equal(isHeatMapCategory("options"), false);
});

test("heat-map periods and cache keys include the selected historical range", () => {
  assert.equal(isHeatMapPeriod("1d"), true);
  assert.equal(isHeatMapPeriod("max"), true);
  assert.equal(isHeatMapPeriod("2y"), false);
  assert.equal(isHeatMapSector("Real Estate"), true);
  assert.equal(isHeatMapSector("Unknown"), false);
  assert.equal(heatMapRequestCacheKey("stocks", "1d", []), "stocks:1d:");
  assert.equal(heatMapRequestCacheKey("stocks", "1y", []), "stocks:1y:");
  assert.equal(heatMapRequestCacheKey("custom", "max", ["AAPL"]), "custom:max:AAPL");
  assert.equal(
    heatMapRequestCacheKey("custom", "max", ["MSFT", "AAPL"]),
    heatMapRequestCacheKey("custom", "max", ["AAPL", "MSFT"]),
  );
  assert.notEqual(
    heatMapRequestCacheKey("stocks", "1d", [], "Real Estate"),
    heatMapRequestCacheKey("stocks", "1d", [], "Technology"),
  );
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
    returnPercent: -0.25,
    returnBasis: "adjusted_total_return",
    returnUnavailableReason: null,
    historyStartDate: "2010-01-04",
    priceTimestamp: 1_760_000_000,
    marketSession: "closed",
    nextRegularOpenTimestamp: null,
    assetType: "stock",
    sector: "Technology",
    exchange: "NASDAQ",
    exchangeTimezone: "America/New_York",
    marketCapUsd: 2_000_000_000_000,
    annualizedVolatilityPercent: 22.5,
    riskBand: "Moderate Conservative",
  };
  assert.equal(isHeatMapQuote(quote), true);
  assert.equal(isHeatMapQuote({ ...quote, price: Number.NaN }), false);
  assert.equal(isHeatMapQuote({ ...quote, nextRegularOpenTimestamp: Number.NaN }), false);
  assert.equal(isHeatMapQuote({ ...quote, nextRegularOpenTimestamp: undefined }), false);
  assert.equal(isHeatMapQuote({ ...quote, exchangeTimezone: undefined }), false);
  assert.equal(
    isHeatMapResponse({
      category: "stocks",
      period: "1d",
      requestedSector: null,
      quotes: [quote],
      unavailableSymbols: [],
      updatedAt: 1_760_000_000,
    }, "stocks", "1d"),
    true,
  );
  assert.equal(
    isHeatMapResponse({
      category: "stocks",
      period: "1d",
      requestedSector: null,
      quotes: [{ ...quote, price: 0 }],
      unavailableSymbols: [],
      updatedAt: 1_760_000_000,
    }, "stocks", "1d"),
    false,
  );
});

test("heat-map responses reject stale or undated continuous-futures quotes", () => {
  const updatedAt = 2_000_000_000;
  const futuresQuote = {
    symbol: "ES=F",
    name: "E-mini S&P 500",
    price: 5_000,
    priceChangePercent: 0.2,
    returnPercent: 0.2,
    returnBasis: "price_return_proxy",
    returnUnavailableReason: null,
    historyStartDate: null,
    priceTimestamp: updatedAt - 5 * 60,
    marketSession: "regular",
    nextRegularOpenTimestamp: null,
    assetType: "future",
    sector: null,
    exchange: null,
    exchangeTimezone: null,
    marketCapUsd: null,
    annualizedVolatilityPercent: null,
    riskBand: null,
  };
  const response = (quote: typeof futuresQuote | (typeof futuresQuote & { priceTimestamp: null })) => ({
    category: "futures",
    period: "1d",
    requestedSector: null,
    quotes: [quote],
    unavailableSymbols: [],
    updatedAt,
  });

  assert.equal(isHeatMapResponse(response(futuresQuote), "futures"), true);
  assert.equal(
    isHeatMapResponse(
      { ...response(futuresQuote), quotes: [{ ...futuresQuote, priceTimestamp: updatedAt - 24 * 60 * 60 - 1 }] },
      "futures",
    ),
    false,
  );
  assert.equal(isHeatMapResponse(response({ ...futuresQuote, priceTimestamp: null }), "futures"), false);
});

test("sector-expanded responses must match the selected sector", () => {
  const response = {
    category: "stocks",
    period: "1d",
    requestedSector: "Real Estate",
    quotes: [],
    unavailableSymbols: [],
    updatedAt: 1_760_000_000,
  };
  assert.equal(isHeatMapResponse(response, "stocks", "1d", "Real Estate"), true);
  assert.equal(isHeatMapResponse(response, "stocks", "1d", "Technology"), false);
  assert.equal(isHeatMapResponse({ ...response, requestedSector: null }, "stocks", "1d", "Real Estate"), false);
});