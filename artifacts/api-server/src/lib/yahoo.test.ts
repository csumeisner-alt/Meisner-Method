import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeDividendYield } from "./dividendYield.ts";
import { normalizeYahooQuoteCurrency, validateCommodityQuoteSnapshot } from "./commodityQuoteData.ts";

const approx = (actual: number, expected: number) => {
  assert.ok(Math.abs(actual - expected) < 1e-10, `${actual} ≈ ${expected}`);
};

test("normalizeDividendYield converts percent-like NVDA data to 0.43%", () => {
  approx(normalizeDividendYield(0.43, 1, 230.36), 0.0043);
});

test("normalizeDividendYield preserves decimal provider data", () => {
  approx(normalizeDividendYield(0.0073, 3.64, 499.7), 0.0073);
  approx(normalizeDividendYield(0.0241), 0.0241);
});

test("normalizeDividendYield handles missing yield from the declared rate", () => {
  approx(normalizeDividendYield(null, 1, 230.36), 1 / 230.36);
});

test("commodity quote snapshots require nonzero prior-price math and reject inconsistent changes", () => {
  assert.deepEqual(
    validateCommodityQuoteSnapshot({
      currentPrice: 105,
      priceChange: 5,
      priceChangePercent: 5,
    }, "GC=F"),
    { currentPrice: 105, priceChange: 5, priceChangePercent: 5 },
  );
  for (const quote of [
    { currentPrice: 105, priceChange: 5 },
    { currentPrice: 105, priceChange: 5, priceChangePercent: 0 },
    { currentPrice: 5, priceChange: 5, priceChangePercent: 0 },
    { currentPrice: 0, priceChange: 0, priceChangePercent: 0 },
  ]) {
    assert.throws(() => validateCommodityQuoteSnapshot(quote, "GC=F"));
  }
});

test("Yahoo commodity currencies expose cents as USC without changing other asset currencies", () => {
  assert.equal(normalizeYahooQuoteCurrency("ZC=F", "USX"), "USC");
  assert.equal(normalizeYahooQuoteCurrency("HE=F", "USD"), "USC");
  assert.equal(normalizeYahooQuoteCurrency("GC=F", "USD"), "USD");
  assert.equal(normalizeYahooQuoteCurrency("AAPL", "CAD"), "CAD");
});