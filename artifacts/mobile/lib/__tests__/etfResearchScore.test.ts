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
  peerAssetSizeComparison: null,
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

test("ETF cost score is exact at zero, category-average, and twice-average thresholds", () => {
  const scoreAt = (expenseRatio: number) =>
    calculateEtfResearchScore({
      ...completeInput,
      expenseRatio,
      categoryAverageExpenseRatio: 0.001,
    }).components.find((item) => item.id === "cost")?.score;

  assert.equal(scoreAt(0), 100);
  assert.equal(scoreAt(0.001), 50);
  assert.equal(scoreAt(0.002), 0);
  assert.equal(scoreAt(0.0021), 0);
});

test("ETF cost score is unavailable for malformed fund expense ratios", () => {
  for (const expenseRatio of [
    -0.0001,
    Number.NaN,
    Number.POSITIVE_INFINITY,
    Number.NEGATIVE_INFINITY,
  ]) {
    const result = calculateEtfResearchScore({
      ...completeInput,
      expenseRatio,
      categoryAverageExpenseRatio: 0.001,
    });
    assert.equal(
      result.components.find((item) => item.id === "cost")?.score,
      null,
      `expected unavailable cost score for expense ratio ${expenseRatio}`,
    );
    assert.equal(result.availableComponents, 4);
  }
});

test("ETF cost score is unavailable without a valid category average", () => {
  for (const categoryAverageExpenseRatio of [null, 0, -0.001, Number.NaN, Number.POSITIVE_INFINITY]) {
    const result = calculateEtfResearchScore({
      ...completeInput,
      categoryAverageExpenseRatio,
    });
    assert.equal(
      result.components.find((item) => item.id === "cost")?.score,
      null,
      `expected unavailable score for category average ${categoryAverageExpenseRatio}`,
    );
  }
});

test("ETF assets use the provider category average when available", () => {
  const result = calculateEtfResearchScore({
    ...completeInput,
    averageVolume: null,
    totalAssets: 200_000_000,
    peerAssetSizeComparison: {
      category: "Large Blend",
      categoryAverageTotalAssets: 100_000_000,
      sampleSize: null,
      sampleContext: "Yahoo category average; sample size not reported",
      source: "Yahoo Finance",
      asOf: "2026-10-29T12:00:00Z",
    },
  });
  const liquidity = result.components.find((item) => item.id === "liquidity");
  assert.equal(liquidity?.score, 100);
  assert.equal(liquidity?.peerContext?.category, "Large Blend");
  assert.equal(liquidity?.peerContext?.sampleSize, null);
  assert.equal(liquidity?.peerContext?.source, "Yahoo Finance");
  assert.match(liquidity?.detail ?? "", /provider category average/);
});

test("ETF assets retain fixed bands when the provider category average is absent", () => {
  const result = calculateEtfResearchScore({
    ...completeInput,
    averageVolume: null,
    totalAssets: 200_000_000,
  });
  const liquidity = result.components.find((item) => item.id === "liquidity");
  assert.ok(typeof liquidity?.score === "number" && liquidity.score < 100);
  assert.equal(liquidity?.peerContext, undefined);
  assert.match(liquidity?.detail ?? "", /fixed log-scale bands/);
});

test("ETF assets use fixed bands without peer context for invalid category averages", () => {
  const fallback = calculateEtfResearchScore({
    ...completeInput,
    averageVolume: null,
    totalAssets: 200_000_000,
  }).components.find((item) => item.id === "liquidity");

  for (const categoryAverageTotalAssets of [
    0,
    -1,
    Number.NaN,
    Number.POSITIVE_INFINITY,
    Number.NEGATIVE_INFINITY,
  ]) {
    const result = calculateEtfResearchScore({
      ...completeInput,
      averageVolume: null,
      totalAssets: 200_000_000,
      peerAssetSizeComparison: {
        category: "Large Blend",
        categoryAverageTotalAssets,
        sampleSize: 20,
        sampleContext: "Provider-reported category average",
        source: "Yahoo Finance",
        asOf: "2026-10-29T12:00:00Z",
      },
    });
    const liquidity = result.components.find((item) => item.id === "liquidity");
    assert.equal(
      liquidity?.score,
      fallback?.score,
      `expected fixed-band score for category asset average ${categoryAverageTotalAssets}`,
    );
    assert.equal(liquidity?.peerContext, undefined);
    assert.match(liquidity?.detail ?? "", /fixed log-scale bands/);
  }
});

test("invalid fund assets add no liquidity score or peer context", () => {
  const invalidFundAssets = [
    0,
    -1,
    Number.NaN,
    Number.POSITIVE_INFINITY,
    Number.NEGATIVE_INFINITY,
  ];
  const peerAssetSizeComparison = {
    category: "Large Blend",
    categoryAverageTotalAssets: 100_000_000,
    sampleSize: 20,
    sampleContext: "Provider-reported category average",
    source: "Yahoo Finance",
    asOf: "2026-10-29T12:00:00Z",
  };
  const volumeOnlyLiquidity = calculateEtfResearchScore({
    ...completeInput,
    totalAssets: null,
    peerAssetSizeComparison: null,
  }).components.find((item) => item.id === "liquidity");

  for (const totalAssets of invalidFundAssets) {
    const withVolume = calculateEtfResearchScore({
      ...completeInput,
      totalAssets,
      peerAssetSizeComparison,
    }).components.find((item) => item.id === "liquidity");
    assert.equal(
      withVolume?.score,
      volumeOnlyLiquidity?.score,
      `expected invalid fund assets ${totalAssets} not to change the valid volume score`,
    );
    assert.equal(withVolume?.peerContext, undefined);

    const withoutVolume = calculateEtfResearchScore({
      ...completeInput,
      averageVolume: null,
      totalAssets,
      peerAssetSizeComparison,
    }).components.find((item) => item.id === "liquidity");
    assert.equal(
      withoutVolume?.score,
      null,
      `expected invalid fund assets ${totalAssets} not to create a liquidity score`,
    );
    assert.equal(withoutVolume?.peerContext, undefined);
  }
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

test("tracking-error score is exact at both fixed-band limits", () => {
  const scoreAt = (trackingError: number) =>
    calculateEtfResearchScore({
      ...completeInput,
      trackingError,
    }).components.find((item) => item.id === "tracking")?.score;

  assert.equal(scoreAt(0), 100);
  assert.equal(scoreAt(0.05), 0);
  assert.equal(scoreAt(0.06), 0);
});

test("liquidity score is exact at the fixed volume and asset band limits", () => {
  const volumeScoreAt = (averageVolume: number) =>
    calculateEtfResearchScore({
      ...completeInput,
      averageVolume,
      totalAssets: null,
    }).components.find((item) => item.id === "liquidity")?.score;
  const assetsScoreAt = (totalAssets: number) =>
    calculateEtfResearchScore({
      ...completeInput,
      averageVolume: null,
      totalAssets,
    }).components.find((item) => item.id === "liquidity")?.score;

  assert.equal(volumeScoreAt(10_000), 0);
  assert.equal(volumeScoreAt(1_000_000), 100);
  assert.equal(assetsScoreAt(10_000_000), 0);
  assert.equal(assetsScoreAt(1_000_000_000), 100);
});

test("risk score is exact at the fixed volatility and drawdown band limits", () => {
  const volatilityScoreAt = (annualizedVolatility: number) =>
    calculateEtfResearchScore({
      ...completeInput,
      annualizedVolatility,
      maxDrawdown: null,
    }).components.find((item) => item.id === "risk")?.score;
  const drawdownScoreAt = (maxDrawdown: number) =>
    calculateEtfResearchScore({
      ...completeInput,
      annualizedVolatility: null,
      maxDrawdown,
    }).components.find((item) => item.id === "risk")?.score;

  assert.equal(volatilityScoreAt(0), 100);
  assert.equal(volatilityScoreAt(0.6), 0);
  assert.equal(volatilityScoreAt(0.7), 0);
  assert.equal(drawdownScoreAt(0), 100);
  assert.equal(drawdownScoreAt(-0.75), 0);
  assert.equal(drawdownScoreAt(-0.8), 0);
});

test("sector diversification accepts exactly 80% coverage and ignores invalid weights", () => {
  const atThreshold = calculateEtfResearchScore({
    ...completeInput,
    sectorWeights: [
      { sector: "Technology", weight: 0.4 },
      { sector: "Healthcare", weight: 0.4 },
    ],
  });
  assert.equal(atThreshold.components.find((item) => item.id === "diversification")?.score, 50);

  const belowThreshold = calculateEtfResearchScore({
    ...completeInput,
    sectorWeights: [
      { sector: "Technology", weight: 0.4 },
      { sector: "Healthcare", weight: 0.399 },
    ],
  });
  assert.equal(belowThreshold.components.find((item) => item.id === "diversification")?.score, null);

  const withInvalidWeights = calculateEtfResearchScore({
    ...completeInput,
    sectorWeights: [
      { sector: "Technology", weight: 0.4 },
      { sector: "Healthcare", weight: 0.4 },
      { sector: "Negative", weight: -0.1 },
      { sector: "Zero", weight: 0 },
      { sector: "Over 100%", weight: 1.01 },
      { sector: "Infinite", weight: Number.POSITIVE_INFINITY },
      { sector: "Not a number", weight: Number.NaN },
      { sector: "   ", weight: 0.2 },
    ],
  });
  const diversification = withInvalidWeights.components.find((item) => item.id === "diversification");
  assert.equal(diversification?.score, 50);
  assert.match(diversification?.detail ?? "", /2 provider-reported sectors/);
});

test("available components are reweighted and fewer than three keeps the score unavailable", () => {
  const threeComponents = calculateEtfResearchScore({
    ...completeInput,
    sectorWeights: [
      { sector: "Technology", weight: 0.4 },
      { sector: "Healthcare", weight: 0.4 },
    ],
    averageVolume: null,
    totalAssets: null,
    annualizedVolatility: null,
    maxDrawdown: null,
  });
  assert.equal(threeComponents.components.find((item) => item.id === "liquidity")?.score, null);
  assert.equal(threeComponents.components.find((item) => item.id === "risk")?.score, null);
  assert.equal(threeComponents.availableComponents, 3);
  assert.equal(threeComponents.score, 70);

  const twoComponents = calculateEtfResearchScore({
    ...completeInput,
    categoryAverageExpenseRatio: null,
    trackingError: null,
    sectorWeights: [],
  });
  assert.equal(twoComponents.availableComponents, 2);
  assert.equal(twoComponents.score, null);
});
