import assert from "node:assert/strict";
import test from "node:test";
import { summarizeHeatMap } from "../heatMapMetrics.ts";

test("heat-map treats the full neutral band as neutral and keeps it in the denominator", () => {
  const summary = summarizeHeatMap([
    { price: 10, priceChangePercent: 1 },
    { price: 10, priceChangePercent: 1 },
    { price: 10, priceChangePercent: 0.25 },
    { price: 10, priceChangePercent: -0.25 },
  ]);
  assert.deepEqual(summary, { tone: "NEUTRAL", positive: 2, negative: 0, neutral: 2, quoted: 4 });
});

test("heat-map calls a map HOT or COLD at exactly 55 percent of valid quotes", () => {
  const hot = summarizeHeatMap([
    ...Array.from({ length: 11 }, () => ({ price: 10, priceChangePercent: 0.26 })),
    ...Array.from({ length: 9 }, () => ({ price: 10, priceChangePercent: -1 })),
  ]);
  const cold = summarizeHeatMap([
    ...Array.from({ length: 11 }, () => ({ price: 10, priceChangePercent: -0.26 })),
    ...Array.from({ length: 9 }, () => ({ price: 10, priceChangePercent: 1 })),
  ]);
  assert.equal(hot.tone, "HOT");
  assert.equal(cold.tone, "COLD");
});

test("heat-map ignores invalid quotes and handles a single mover", () => {
  const summary = summarizeHeatMap([
    { price: 10, priceChangePercent: 0.26 },
    { price: 0, priceChangePercent: -2 },
    { price: Number.NaN, priceChangePercent: 1 },
  ]);
  assert.deepEqual(summary, { tone: "HOT", positive: 1, negative: 0, neutral: 0, quoted: 1 });
  assert.equal(summarizeHeatMap([]).tone, "NEUTRAL");
});