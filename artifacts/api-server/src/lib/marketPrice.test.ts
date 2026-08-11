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