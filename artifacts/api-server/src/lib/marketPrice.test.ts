import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createServerMarketPriceCache,
  createServerPriceResolver,
  getRecentServerMarketPrice,
  parseYahooChartPrice,
  RECENT_SERVER_MARKET_PRICE_MAX_AGE_MS,
  rememberServerMarketPriceBatch,
} from "./marketPrice.ts";

test("server price cache normalizes symbols, rejects invalid prices, and expires old entries", () => {
  const cache = createServerMarketPriceCache(300_000, 2);
  assert.equal(cache.remember(" aapl ", 101, 10_000), true);
  assert.deepEqual(cache.get("AAPL", 310_000), {
    symbol: "AAPL",
    price: 101,
    observedAtMs: 10_000,
  });
  assert.equal(cache.get("AAPL", 310_001), null);
  assert.equal(cache.remember("AAPL", 0, 20_000), false);
  assert.equal(cache.remember("TOO LONG SYMBOL", 101, 20_000), false);
  assert.equal(cache.get("AAPL", 9_999), null, "future observations are not used");
});

test("server price resolver falls back only to a recent positive cached quote", async () => {
  const cache = createServerMarketPriceCache(RECENT_SERVER_MARKET_PRICE_MAX_AGE_MS);
  let nowMs = 1_000_000;
  const provider = async () => null;
  const resolvePrice = createServerPriceResolver(provider, cache, () => nowMs);

  cache.remember("AAPL", 102.5, nowMs - 299_000);
  assert.deepEqual(await resolvePrice("aapl"), {
    symbol: "AAPL",
    price: 102.5,
    observedAtMs: 701_000,
    source: "server-cache",
  });

  nowMs += 2_000;
  assert.equal(await resolvePrice("AAPL"), null, "the fallback expires after five minutes");
});

test("server price resolver refreshes its cache with a successful provider quote", async () => {
  const cache = createServerMarketPriceCache();
  const resolvePrice = createServerPriceResolver(async () => 103.25, cache, () => 2_000);

  assert.deepEqual(await resolvePrice("AAPL"), {
    symbol: "AAPL",
    price: 103.25,
    observedAtMs: 2_000,
    source: "provider",
  });
  assert.deepEqual(cache.get("AAPL", 2_001), {
    symbol: "AAPL",
    price: 103.25,
    observedAtMs: 2_000,
  });
});

test("successful stock quote batches warm the shared server fallback cache", () => {
  const observedAtMs = 3_000_000;
  assert.equal(rememberServerMarketPriceBatch([
    { symbol: "CACHE1", currentPrice: 104.5 },
    { symbol: "CACHE2", currentPrice: 0 },
    { symbol: "invalid symbol", currentPrice: 50 },
    { symbol: "CACHE3", currentPrice: "99" },
  ], observedAtMs), 1);
  assert.deepEqual(getRecentServerMarketPrice("cache1", observedAtMs + 1), {
    symbol: "CACHE1",
    price: 104.5,
    observedAtMs,
  });
});

test("uses Yahoo's regular market price when present", () => {
  assert.equal(
    parseYahooChartPrice({
      chart: { result: [{ meta: { regularMarketPrice: 123.45 } }] },
    }),
    123.45,
  );
});

test("falls back to the latest valid close", () => {
  assert.equal(
    parseYahooChartPrice({
      chart: {
        result: [{
          meta: {},
          indicators: { quote: [{ close: [100, null, 101.25, null] }] },
        }],
      },
    }),
    101.25,
  );
});

test("prefers an explicit pre-market price during the pre-market window", () => {
  assert.equal(
    parseYahooChartPrice({
      chart: {
        result: [{
          meta: {
            regularMarketPrice: 100,
            preMarketPrice: 101.25,
            marketState: "PRE",
            currentTradingPeriod: {
              pre: { start: 100, end: 200 },
              regular: { start: 200, end: 300 },
              post: { start: 300, end: 400 },
            },
          },
          timestamp: [150],
          indicators: { quote: [{ close: [101] }] },
        }],
      },
    }, 150),
    101.25,
  );
});

test("uses the latest extended-hours candle after the market closes", () => {
  assert.equal(
    parseYahooChartPrice({
      chart: {
        result: [{
          meta: {
            regularMarketPrice: 100,
            regularMarketTime: 250,
            marketState: "CLOSED",
          },
          timestamp: [250, 350],
          indicators: { quote: [{ close: [100, 102.5] }] },
        }],
      },
    }, 500),
    102.5,
  );
});

test("keeps the regular market price during the regular session", () => {
  assert.equal(
    parseYahooChartPrice({
      chart: {
        result: [{
          meta: {
            regularMarketPrice: 103.75,
            marketState: "REGULAR",
            currentTradingPeriod: {
              regular: { start: 100, end: 200 },
            },
          },
          timestamp: [150],
          indicators: { quote: [{ close: [103.5] }] },
        }],
      },
    }, 150),
    103.75,
  );
});

test("invalid Yahoo payloads return no price", () => {
  assert.equal(parseYahooChartPrice(null), null);
  assert.equal(parseYahooChartPrice({ chart: { result: [] } }), null);
  assert.equal(
    parseYahooChartPrice({
      chart: { result: [{ indicators: { quote: [{ close: [0, null, -1] }] } }] },
    }),
    null,
  );
});