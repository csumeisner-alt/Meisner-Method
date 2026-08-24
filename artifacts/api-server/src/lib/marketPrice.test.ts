import { test } from "node:test";
import assert from "node:assert/strict";
import { parseYahooChartPrice } from "./marketPrice.ts";

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