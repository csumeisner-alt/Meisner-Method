import { test } from "node:test";
import assert from "node:assert/strict";
import { buildStockRecommendation } from "./stockRecommendation.ts";

const bullishInput = {
  currentPrice: 230.36,
  support: 208.48,
  resistance: 236.54,
  week52High: 236.54,
  week52Low: 164.27,
  analystPriceTarget: 327.13,
  technicalScore: 76,
  fundamentalScore: 72,
  behavioralScore: 80,
};

test("identical market inputs always produce the same recommendation", () => {
  const first = buildStockRecommendation(bullishInput);
  const second = buildStockRecommendation(bullishInput);
  assert.deepEqual(second, first);
  assert.equal(first.action, "buy");
});

test("entry, target, and stop-loss levels are always ordered for the long-only app", () => {
  const recommendation = buildStockRecommendation(bullishInput);
  assert.ok(recommendation.stopLoss < recommendation.buyPrice);
  assert.ok(recommendation.buyPrice < recommendation.sellPrice);
});

test("invalid analyst targets are replaced with a valid upside target", () => {
  const recommendation = buildStockRecommendation({
    ...bullishInput,
    analystPriceTarget: 190,
    resistance: 220,
    week52High: 225,
  });
  assert.ok(recommendation.sellPrice > recommendation.buyPrice);
  assert.equal(recommendation.sellPrice, 258);
});

test("action comes from the weighted scores instead of generated prose", () => {
  assert.equal(buildStockRecommendation({
    ...bullishInput,
    technicalScore: 50,
    fundamentalScore: 50,
    behavioralScore: 50,
  }).action, "hold");
  assert.equal(buildStockRecommendation({
    ...bullishInput,
    technicalScore: 20,
    fundamentalScore: 35,
    behavioralScore: 30,
  }).action, "sell");
});