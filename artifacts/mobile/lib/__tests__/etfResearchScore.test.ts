import assert from "node:assert/strict";
import test from "node:test";
import { calculateEtfResearchScore } from "../etfResearchScore.ts";

const completeInput = {
  expenseRatio: 0.0005,
  categoryAverageExpenseRatio: 0.001,
  trackingError: 0.01,
  sectorWeights: [
    { sector: "Technology", weight: 0.4 },
    { sector: "Healthcare", weight: 0.3 },
    { sector: "Financial Services", weight: 0.2 },
    { sector: "Consumer Cyclical", weight: 0.1 },
  ],
  averageVolume: 100_000,
  totalAssets: 100_000_000,
  annualizedVolatility: 0.2,
  maxDrawdown: -0.2,
};

test("ETF profile score is deterministic and exposes every component", () => {
  const result = calculateEtfResearchScore(completeInput);
  assert.equal(result.availableComponents, 5);
  assert.ok(result.score !== null && result.score >= 0 && result.score <= 100);
  assert.deepEqual(result.components.map((item) => item.id), [
    "cost",
    "tracking",
    "diversification",
    "liquidity",
    "risk",
  ]);
  assert.equal(result.components[0]?.score, 75);
  assert.equal(result.components[1]?.score, 80);
});

test("ETF cost score improves when expense ratio is lower than its category average", () => {
  const belowAverage = calculateEtfResearchScore({
    ...completeInput,
    expenseRatio: 0.0004,
  }).components[0]?.score;
  const aboveAverage = calculateEtfResearchScore({
    ...completeInput,
    expenseRatio: 0.0015,
  }).components[0]?.score;
  assert.ok(belowAverage !== null && aboveAverage !== null && belowAverage > aboveAverage);
});

test("missing peer data is excluded and incomplete sector coverage is not scored", () => {
  const result = calculateEtfResearchScore({
    ...completeInput,
    categoryAverageExpenseRatio: null,
    trackingError: null,
    sectorWeights: [
      { sector: "Technology", weight: 0.3 },
      { sector: "Healthcare", weight: 0.2 },
    ],
  });
  assert.equal(result.components[0]?.score, null);
  assert.equal(result.components[1]?.score, null);
  assert.equal(result.components[2]?.score, null);
  assert.equal(result.score, null);
  assert.equal(result.availableComponents, 2);
});
