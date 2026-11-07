import assert from "node:assert/strict";
import test from "node:test";
import {
  buildEtfScoreHistory,
  calculateEtfResearchScore,
  clearEtfScoreSnapshots,
  createEtfScoreSnapshot,
  findComparableEtfScoreChange,
  parseEtfScoreSnapshots,
  persistEtfScoreSnapshot,
  removeEtfScoreSnapshot,
  restoreEtfScoreSnapshot,
} from "../etfResearchScore.ts";

const completeInput = {
  expenseRatio: 0.0005,
  categoryAverageExpenseRatio: 0.001,
  riskAdjustedReturn: 0.5,
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
    "performance",
    "diversification",
    "liquidity",
    "risk",
  ]);
  assert.equal(result.components[0]?.score, 75);
  assert.equal(result.components[1]?.score, 75);
  assert.deepEqual(result.components.map((item) => item.weight), [25, 20, 20, 15, 10]);
  assert.equal(result.components.reduce((sum, item) => sum + item.weight, 0), 90);
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

test("invalid average volume adds no liquidity score or changes asset scoring", () => {
  const invalidAverageVolumes = [
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
  const validAssetInputs = [
    { totalAssets: 200_000_000, peerAssetSizeComparison },
    { totalAssets: 200_000_000, peerAssetSizeComparison: null },
  ];

  for (const assetInput of validAssetInputs) {
    const assetOnlyLiquidity = calculateEtfResearchScore({
      ...completeInput,
      ...assetInput,
      averageVolume: null,
    }).components.find((item) => item.id === "liquidity");

    for (const averageVolume of invalidAverageVolumes) {
      const result = calculateEtfResearchScore({
        ...completeInput,
        ...assetInput,
        averageVolume,
      });
      const liquidity = result.components.find((item) => item.id === "liquidity");
      assert.equal(
        liquidity?.score,
        assetOnlyLiquidity?.score,
        `expected invalid average volume ${averageVolume} not to change asset scoring`,
      );
      assert.deepEqual(liquidity?.peerContext, assetOnlyLiquidity?.peerContext);
    }
  }

  for (const averageVolume of invalidAverageVolumes) {
    const liquidity = calculateEtfResearchScore({
      ...completeInput,
      averageVolume,
      totalAssets: null,
    }).components.find((item) => item.id === "liquidity");
    assert.equal(
      liquidity?.score,
      null,
      `expected invalid average volume ${averageVolume} not to create a liquidity score`,
    );
  }
});

test("liquidity explanation identifies scored figures and marks invalid inputs unavailable", () => {
  const detailFor = (averageVolume: number | null, totalAssets: number | null) =>
    calculateEtfResearchScore({
      ...completeInput,
      averageVolume,
      totalAssets,
    }).components.find((item) => item.id === "liquidity")?.detail ?? "";

  const bothInputs = detailFor(100_000, 200_000_000);
  assert.match(bothInputs, /average daily shares: 100,000 shares; fund assets: \$200,000,000/);

  const volumeOnly = detailFor(100_000, null);
  assert.match(volumeOnly, /average daily shares: 100,000 shares; fund assets: Unavailable/);

  const assetsOnly = detailFor(null, 200_000_000);
  assert.match(assetsOnly, /average daily shares: Unavailable; fund assets: \$200,000,000/);

  for (const averageVolume of [0, -1, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
    assert.match(detailFor(averageVolume, 200_000_000), /average daily shares: Unavailable/);
    assert.doesNotMatch(detailFor(averageVolume, 200_000_000), /average daily shares: 0 shares/);
  }

  for (const totalAssets of [0, -1, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
    assert.match(detailFor(100_000, totalAssets), /fund assets: Unavailable/);
    assert.doesNotMatch(detailFor(100_000, totalAssets), /fund assets: \$0/);
  }
});

test("missing peer data is excluded and incomplete sector coverage is not scored", () => {
  const result = calculateEtfResearchScore({
    ...completeInput,
    categoryAverageExpenseRatio: null,
    riskAdjustedReturn: null,
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

test("risk-adjusted performance is available without a benchmark and uses bounded fixed bands", () => {
  const scoreAt = (riskAdjustedReturn: number) =>
    calculateEtfResearchScore({
      ...completeInput,
      riskAdjustedReturn,
    }).components.find((item) => item.id === "performance")?.score;

  assert.equal(scoreAt(-1), 0);
  assert.equal(scoreAt(0), 50);
  assert.equal(scoreAt(1), 100);
  assert.equal(scoreAt(2), 100);

  const performance = calculateEtfResearchScore(completeInput).components.find((item) => item.id === "performance");
  assert.equal(performance?.score, 75);
  assert.match(performance?.detail ?? "", /annualized return divided by annualized volatility/i);
  assert.match(performance?.detail ?? "", /0% risk-free proxy/);
  assert.doesNotMatch(performance?.detail ?? "", /Sharpe ratio/i);
  assert.match(performance?.detail ?? "", /not peer-relative/i);
});

test("missing and invalid risk-adjusted returns are excluded and remaining weights normalize", () => {
  for (const riskAdjustedReturn of [null, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
    const result = calculateEtfResearchScore({
      ...completeInput,
      riskAdjustedReturn,
    });
    assert.equal(result.components.find((item) => item.id === "performance")?.score, null);
    assert.equal(result.availableComponents, 4);
    assert.ok(result.score !== null);
    const availableWeight = result.components
      .filter((component) => component.score !== null)
      .reduce((sum, component) => sum + component.weight, 0);
    assert.equal(availableWeight, 70);
    const normalizedWeights = result.components
      .filter((component) => component.score !== null)
      .map((component) => component.weight / availableWeight * 100);
    assert.ok(Math.abs(normalizedWeights.reduce((sum, weight) => sum + weight, 0) - 100) < 1e-10);
  }
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
  assert.equal(threeComponents.score, 67);

  const twoComponents = calculateEtfResearchScore({
    ...completeInput,
    categoryAverageExpenseRatio: null,
    riskAdjustedReturn: null,
    sectorWeights: [],
  });
  assert.equal(twoComponents.availableComponents, 2);
  assert.equal(twoComponents.score, null);
});

test("ETF score history starts without showing a previous score", () => {
  const result = calculateEtfResearchScore(completeInput);
  const current = createEtfScoreSnapshot({
    symbol: "SPY",
    score: result.score,
    components: result.components,
    sourceContexts: Object.fromEntries(
      result.components.filter((component) => component.score !== null).map((component) => [component.id, `provider:${component.id}`]),
    ),
    inputAsOf: Object.fromEntries(
      result.components.filter((component) => component.score !== null).map((component) => [component.id, ["2026-10-29T12:00:00Z"]]),
    ),
    recordedAt: "2026-10-30T12:00:00Z",
  });

  assert.equal(findComparableEtfScoreChange(current, []).status, "first-analysis");
  assert.equal(
    findComparableEtfScoreChange(current, current ? [current] : []).status,
    "first-analysis",
    "repeated rendering of the exact same analysis must not create a false zero-point delta",
  );
});

test("ETF score history rejects stale source inputs", () => {
  const result = calculateEtfResearchScore(completeInput);
  const stale = createEtfScoreSnapshot({
    symbol: "SPY",
    score: result.score,
    components: result.components,
    sourceContexts: Object.fromEntries(
      result.components.filter((component) => component.score !== null).map((component) => [component.id, `provider:${component.id}`]),
    ),
    inputAsOf: Object.fromEntries(
      result.components.filter((component) => component.score !== null).map((component) => [component.id, ["2026-09-01T12:00:00Z"]]),
    ),
    recordedAt: "2026-10-30T12:00:00Z",
  });

  assert.equal(stale, null);
  assert.equal(findComparableEtfScoreChange(stale, []).status, "stale-inputs");
});

test("saved benchmark-method snapshots remain visible but are not comparable to new scores", () => {
  const result = calculateEtfResearchScore(completeInput);
  const snapshotFor = (recordedAt: string) => createEtfScoreSnapshot({
    symbol: "SPY",
    score: result.score,
    components: result.components,
    sourceContexts: Object.fromEntries(
      result.components.filter((component) => component.score !== null).map((component) => [component.id, `provider:${component.id}`]),
    ),
    inputAsOf: Object.fromEntries(
      result.components.filter((component) => component.score !== null).map((component) => [component.id, ["2026-10-29T12:00:00Z"]]),
    ),
    recordedAt,
  });
  const priorRiskAdjustedSnapshot = snapshotFor("2026-10-30T12:00:00Z");
  const current = snapshotFor("2026-11-05T12:00:00Z");
  assert.ok(priorRiskAdjustedSnapshot);
  assert.ok(current);

  const legacyData = JSON.parse(JSON.stringify(priorRiskAdjustedSnapshot)) as Record<string, unknown>;
  delete legacyData.methodology;
  const ids = legacyData.componentIds as string[];
  legacyData.componentIds = ids.map((id) => id === "performance" ? "tracking" : id);
  for (const field of ["componentScores", "sourceContexts", "inputAsOf"]) {
    const values = legacyData[field] as Record<string, unknown>;
    values.tracking = values.performance;
    delete values.performance;
  }
  const parsedLegacy = parseEtfScoreSnapshots(JSON.stringify([legacyData]));
  assert.equal(parsedLegacy.length, 1, "legacy history remains stored and readable");
  assert.equal(parsedLegacy[0]?.methodology, undefined, "old snapshots remain unmodified");
  assert.equal(findComparableEtfScoreChange(current, [parsedLegacy[0]!]).status, "methodology-changed");

  const datedHistory = buildEtfScoreHistory("SPY", current, [parsedLegacy[0]!]);
  assert.deepEqual(datedHistory.map((entry) => entry.status), ["baseline", "methodology-changed"]);
});

test("ETF score history does not compare changed component coverage", () => {
  const previousResult = calculateEtfResearchScore(completeInput);
  const currentResult = calculateEtfResearchScore({
    ...completeInput,
    annualizedVolatility: null,
    maxDrawdown: null,
  });
  const snapshotFor = (
    result: ReturnType<typeof calculateEtfResearchScore>,
    recordedAt: string,
    asOf: string,
  ) => createEtfScoreSnapshot({
    symbol: "SPY",
    score: result.score,
    components: result.components,
    sourceContexts: Object.fromEntries(
      result.components.filter((component) => component.score !== null).map((component) => [component.id, `provider:${component.id}`]),
    ),
    inputAsOf: Object.fromEntries(
      result.components.filter((component) => component.score !== null).map((component) => [component.id, [asOf]]),
    ),
    recordedAt,
  });
  const previous = snapshotFor(previousResult, "2026-10-20T12:00:00Z", "2026-10-19T12:00:00Z");
  const current = snapshotFor(currentResult, "2026-10-30T12:00:00Z", "2026-10-29T12:00:00Z");

  assert.equal(findComparableEtfScoreChange(current, previous ? [previous] : []).status, "not-comparable");
});

test("ETF score history shows a delta for fresh matching coverage and sources", () => {
  const previousResult = calculateEtfResearchScore(completeInput);
  const currentResult = calculateEtfResearchScore({
    ...completeInput,
    expenseRatio: 0.0008,
  });
  const snapshotFor = (
    result: ReturnType<typeof calculateEtfResearchScore>,
    recordedAt: string,
    asOf: string,
  ) => createEtfScoreSnapshot({
    symbol: "SPY",
    score: result.score,
    components: result.components,
    sourceContexts: Object.fromEntries(
      result.components.filter((component) => component.score !== null).map((component) => [component.id, `provider:${component.id}`]),
    ),
    inputAsOf: Object.fromEntries(
      result.components.filter((component) => component.score !== null).map((component) => [component.id, [asOf]]),
    ),
    recordedAt,
  });
  const previous = snapshotFor(previousResult, "2026-10-20T12:00:00Z", "2026-10-19T12:00:00Z");
  const current = snapshotFor(currentResult, "2026-10-30T12:00:00Z", "2026-10-29T12:00:00Z");
  const change = findComparableEtfScoreChange(current, previous ? [previous] : []);

  assert.equal(change.status, "available");
  if (change.status === "available") {
    assert.equal(change.previousScore, previousResult.score);
    assert.equal(change.change, (currentResult.score ?? 0) - (previousResult.score ?? 0));
    assert.equal(change.previousRecordedAt, "2026-10-20T12:00:00.000Z");
  }
});

test("ETF score history keeps different data sources from appearing comparable", () => {
  const result = calculateEtfResearchScore(completeInput);
  const snapshotFor = (recordedAt: string, asOf: string, source: string) => createEtfScoreSnapshot({
    symbol: "SPY",
    score: result.score,
    components: result.components,
    sourceContexts: Object.fromEntries(
      result.components.filter((component) => component.score !== null).map((component) => [component.id, `${source}:${component.id}`]),
    ),
    inputAsOf: Object.fromEntries(
      result.components.filter((component) => component.score !== null).map((component) => [component.id, [asOf]]),
    ),
    recordedAt,
  });
  const previous = snapshotFor("2026-10-20T12:00:00Z", "2026-10-19T12:00:00Z", "provider-a");
  const current = snapshotFor("2026-10-30T12:00:00Z", "2026-10-29T12:00:00Z", "provider-b");

  assert.equal(findComparableEtfScoreChange(current, previous ? [previous] : []).status, "not-comparable");
});

test("ETF score history does not compare a stale historical snapshot", () => {
  const result = calculateEtfResearchScore(completeInput);
  const snapshotFor = (recordedAt: string, asOf: string) => createEtfScoreSnapshot({
    symbol: "SPY",
    score: result.score,
    components: result.components,
    sourceContexts: Object.fromEntries(
      result.components.filter((component) => component.score !== null).map((component) => [component.id, `provider:${component.id}`]),
    ),
    inputAsOf: Object.fromEntries(
      result.components.filter((component) => component.score !== null).map((component) => [component.id, [asOf]]),
    ),
    recordedAt,
  });
  const previous = snapshotFor("2024-10-20T12:00:00Z", "2024-10-19T12:00:00Z");
  const current = snapshotFor("2026-10-30T12:00:00Z", "2026-10-29T12:00:00Z");

  assert.equal(findComparableEtfScoreChange(current, previous ? [previous] : []).status, "stale-history");
});

test("dated ETF score history reports changes only between adjacent comparable analyses", () => {
  const result = calculateEtfResearchScore(completeInput);
  const snapshotFor = (
    recordedAt: string,
    asOf: string,
    options: { missingRisk?: boolean; source?: string; score?: number } = {},
  ) => {
    const components = options.missingRisk
      ? result.components.map((component) => component.id === "risk" ? { ...component, score: null } : component)
      : result.components;
    return createEtfScoreSnapshot({
      symbol: "SPY",
      score: options.score ?? result.score,
      components,
      sourceContexts: Object.fromEntries(
        components.filter((component) => component.score !== null)
          .map((component) => [component.id, `${options.source ?? "provider"}:${component.id}`]),
      ),
      inputAsOf: Object.fromEntries(
        components.filter((component) => component.score !== null).map((component) => [component.id, [asOf]]),
      ),
      recordedAt,
    });
  };
  const first = snapshotFor("2026-10-10T12:00:00Z", "2026-10-09T12:00:00Z", { score: 70 });
  const changedSource = snapshotFor("2026-10-20T12:00:00Z", "2026-10-19T12:00:00Z", { source: "provider-b" });
  const third = snapshotFor("2026-10-30T12:00:00Z", "2026-10-29T12:00:00Z", { source: "provider-b", score: 82 });
  const history = buildEtfScoreHistory("SPY", third, [first, changedSource].filter(
    (snapshot): snapshot is NonNullable<typeof snapshot> => snapshot !== null,
  ));

  assert.deepEqual(history.map((entry) => entry.status), ["baseline", "not-comparable", "available"]);
  assert.equal(history[2]?.change, (third?.score ?? 0) - (changedSource?.score ?? 0));
  assert.equal(history[2]?.previousRecordedAt, "2026-10-20T12:00:00.000Z");
});

test("dated ETF score history marks factor, freshness, and time-window gaps", () => {
  const result = calculateEtfResearchScore(completeInput);
  const snapshotFor = (
    recordedAt: string,
    asOf: string,
    options: { missingRisk?: boolean; score?: number } = {},
  ) => {
    const components = options.missingRisk
      ? result.components.map((component) => component.id === "risk" ? { ...component, score: null } : component)
      : result.components;
    return createEtfScoreSnapshot({
      symbol: "SPY",
      score: options.score ?? result.score,
      components,
      sourceContexts: Object.fromEntries(
        components.filter((component) => component.score !== null).map((component) => [component.id, `provider:${component.id}`]),
      ),
      inputAsOf: Object.fromEntries(
        components.filter((component) => component.score !== null).map((component) => [component.id, [asOf]]),
      ),
      recordedAt,
    });
  };
  const first = snapshotFor("2024-10-10T12:00:00Z", "2024-10-09T12:00:00Z");
  const second = snapshotFor("2026-10-20T12:00:00Z", "2026-10-19T12:00:00Z", { score: 75 });
  const third = snapshotFor("2026-10-30T12:00:00Z", "2026-10-29T12:00:00Z", { missingRisk: true });
  const history = buildEtfScoreHistory("SPY", third, [first, second].filter(
    (snapshot): snapshot is NonNullable<typeof snapshot> => snapshot !== null,
  ));

  assert.deepEqual(history.map((entry) => entry.status), ["baseline", "stale-history", "not-comparable"]);
});

test("ETF score histories and changes never mix symbols", () => {
  const result = calculateEtfResearchScore(completeInput);
  const snapshotFor = (symbol: string, recordedAt: string, score: number) => createEtfScoreSnapshot({
    symbol,
    score,
    components: result.components,
    sourceContexts: Object.fromEntries(
      result.components.filter((component) => component.score !== null)
        .map((component) => [component.id, `provider:${component.id}`]),
    ),
    inputAsOf: Object.fromEntries(
      result.components.filter((component) => component.score !== null)
        .map((component) => [component.id, ["2026-10-19T12:00:00Z"]]),
    ),
    recordedAt,
  });
  const spyPrior = snapshotFor("SPY", "2026-10-20T12:00:00Z", 60);
  const vooPrior = snapshotFor("VOO", "2026-10-25T12:00:00Z", 20);
  const vooLatest = snapshotFor("VOO", "2026-10-29T12:00:00Z", 95);
  const spyCurrent = snapshotFor("SPY", "2026-10-30T12:00:00Z", 75);
  const mixedHistory = [spyPrior, vooPrior, vooLatest].filter(
    (snapshot): snapshot is NonNullable<typeof snapshot> => snapshot !== null,
  );

  assert.ok(spyCurrent);
  assert.ok(spyPrior);
  assert.ok(vooPrior);
  assert.ok(vooLatest);

  const spyHistory = buildEtfScoreHistory("SPY", spyCurrent, mixedHistory);
  assert.deepEqual(spyHistory.map((entry) => entry.snapshot.symbol), ["SPY", "SPY"]);
  assert.deepEqual(spyHistory.map((entry) => entry.status), ["baseline", "available"]);
  assert.equal(spyHistory[1]?.change, 15);
  assert.equal(spyHistory[1]?.previousRecordedAt, spyPrior.recordedAt);

  const spyChange = findComparableEtfScoreChange(spyCurrent, mixedHistory);
  assert.equal(spyChange.status, "available");
  if (spyChange.status === "available") {
    assert.equal(spyChange.previousScore, spyPrior.score);
    assert.equal(spyChange.change, 15);
  }
  assert.deepEqual(findComparableEtfScoreChange(spyCurrent, [vooPrior, vooLatest]), { status: "first-analysis" });
});

test("overlapping ETF score saves preserve snapshots for both symbols", async () => {
  const result = calculateEtfResearchScore(completeInput);
  const createSnapshot = (symbol: string, recordedAt: string, score: number) =>
    createEtfScoreSnapshot({
      symbol,
      score,
      components: result.components,
      sourceContexts: Object.fromEntries(
        result.components.filter((component) => component.score !== null)
          .map((component) => [component.id, `provider:${component.id}`]),
      ),
      inputAsOf: Object.fromEntries(
        result.components.filter((component) => component.score !== null)
          .map((component) => [component.id, ["2026-10-29T12:00:00Z"]]),
      ),
      recordedAt,
    });
  const spy = createSnapshot("SPY", "2026-10-30T12:00:00Z", 70);
  const voo = createSnapshot("VOO", "2026-10-30T12:00:01Z", 75);
  assert.ok(spy);
  assert.ok(voo);

  let storedValue: string | null = null;
  const readStoredHistory = async () => {
    const valueAtReadStart = storedValue;
    await new Promise((resolve) => setTimeout(resolve, 10));
    return valueAtReadStart;
  };
  const writeStoredHistory = async (value: string) => {
    await new Promise((resolve) => setTimeout(resolve, 10));
    storedValue = value;
  };

  const [spyHistory, vooHistory] = await Promise.all([
    persistEtfScoreSnapshot(spy, readStoredHistory, writeStoredHistory),
    persistEtfScoreSnapshot(voo, readStoredHistory, writeStoredHistory),
  ]);
  const savedHistory = parseEtfScoreSnapshots(storedValue);

  assert.deepEqual(savedHistory.map((snapshot) => snapshot.symbol).sort(), ["SPY", "VOO"]);
  assert.deepEqual(spyHistory.map((snapshot) => snapshot.symbol).sort(), ["SPY"]);
  assert.deepEqual(vooHistory.map((snapshot) => snapshot.symbol).sort(), ["SPY", "VOO"]);
});

test("concurrent ETF score saves deduplicate the same analysis and retain later changes", async () => {
  const result = calculateEtfResearchScore(completeInput);
  const createSnapshot = (
    recordedAt: string,
    options: { reverseComponents?: boolean; score?: number; source?: string; inputAsOf?: string } = {},
  ) => {
    const components = options.reverseComponents ? [...result.components].reverse() : result.components;
    return createEtfScoreSnapshot({
      symbol: "SPY",
      score: options.score ?? 70,
      components,
      sourceContexts: Object.fromEntries(
        components.filter((component) => component.score !== null)
          .map((component) => [component.id, `${options.source ?? "provider"}:${component.id}`]),
      ),
      inputAsOf: Object.fromEntries(
        components.filter((component) => component.score !== null)
          .map((component) => [component.id, [options.inputAsOf ?? "2026-10-29T12:00:00Z"]]),
      ),
      recordedAt,
    });
  };
  const firstSave = createSnapshot("2026-10-30T12:00:00Z");
  const overlappingSave = createSnapshot("2026-10-30T12:00:01Z", { reverseComponents: true });
  const laterAnalysis = createSnapshot("2026-10-31T12:00:00Z", {
    score: 75,
    source: "provider-refresh",
    inputAsOf: "2026-10-30T12:00:00Z",
  });
  assert.ok(firstSave);
  assert.ok(overlappingSave);
  assert.ok(laterAnalysis);

  let storedValue: string | null = null;
  const readStoredHistory = async () => {
    const valueAtReadStart = storedValue;
    await new Promise((resolve) => setTimeout(resolve, 5));
    return valueAtReadStart;
  };
  const writeStoredHistory = async (value: string) => {
    await new Promise((resolve) => setTimeout(resolve, 5));
    storedValue = value;
  };

  await Promise.all([
    persistEtfScoreSnapshot(firstSave, readStoredHistory, writeStoredHistory),
    persistEtfScoreSnapshot(overlappingSave, readStoredHistory, writeStoredHistory),
  ]);
  const afterConcurrentSaves = parseEtfScoreSnapshots(storedValue);
  assert.equal(afterConcurrentSaves.length, 1);
  assert.equal(afterConcurrentSaves[0]?.score, 70);

  await persistEtfScoreSnapshot(laterAnalysis, readStoredHistory, writeStoredHistory);
  const savedHistory = parseEtfScoreSnapshots(storedValue);
  assert.equal(savedHistory.length, 2);
  assert.deepEqual(savedHistory.map((snapshot) => snapshot.score).sort(), [70, 75]);
});

test("ETF score save queue recovers after storage read or write failures", async () => {
  const result = calculateEtfResearchScore(completeInput);
  const createSnapshot = (recordedAt: string, score: number) =>
    createEtfScoreSnapshot({
      symbol: "SPY",
      score,
      components: result.components,
      sourceContexts: Object.fromEntries(
        result.components.filter((component) => component.score !== null)
          .map((component) => [component.id, `provider:${component.id}`]),
      ),
      inputAsOf: Object.fromEntries(
        result.components.filter((component) => component.score !== null)
          .map((component) => [component.id, ["2026-10-29T12:00:00Z"]]),
      ),
      recordedAt,
    });

  for (const failurePoint of ["read", "write"] as const) {
    const failedSnapshot = createSnapshot("2026-10-30T12:00:00Z", 70);
    const laterSnapshot = createSnapshot("2026-10-31T12:00:00Z", 75);
    assert.ok(failedSnapshot);
    assert.ok(laterSnapshot);

    let storedValue: string | null = null;
    let failurePending = true;
    const readStoredHistory = async () => {
      if (failurePoint === "read" && failurePending) {
        failurePending = false;
        throw new Error("device storage read failed");
      }
      return storedValue;
    };
    const writeStoredHistory = async (value: string) => {
      if (failurePoint === "write" && failurePending) {
        failurePending = false;
        throw new Error("device storage write failed");
      }
      storedValue = value;
    };

    await assert.rejects(
      persistEtfScoreSnapshot(failedSnapshot, readStoredHistory, writeStoredHistory),
      new RegExp(`device storage ${failurePoint} failed`),
    );

    const laterHistory = await persistEtfScoreSnapshot(
      laterSnapshot,
      readStoredHistory,
      writeStoredHistory,
    );

    assert.deepEqual(
      parseEtfScoreSnapshots(storedValue).map((snapshot) => snapshot.recordedAt),
      [laterSnapshot.recordedAt],
      `later save should be stored after a ${failurePoint} failure`,
    );
    assert.deepEqual(laterHistory.map((snapshot) => snapshot.recordedAt), [laterSnapshot.recordedAt]);
  }
});

test("clearing ETF score snapshots waits for queued saves before removing history", async () => {
  const result = calculateEtfResearchScore(completeInput);
  const snapshot = createEtfScoreSnapshot({
    symbol: "SPY",
    score: result.score,
    components: result.components,
    sourceContexts: Object.fromEntries(
      result.components.filter((component) => component.score !== null)
        .map((component) => [component.id, `provider:${component.id}`]),
    ),
    inputAsOf: Object.fromEntries(
      result.components.filter((component) => component.score !== null)
        .map((component) => [component.id, ["2026-10-29T12:00:00Z"]]),
    ),
    recordedAt: "2026-10-30T12:00:00Z",
  });
  assert.ok(snapshot);

  let storedValue: string | null = null;
  const save = persistEtfScoreSnapshot(
    snapshot,
    async () => storedValue,
    async (value) => {
      await new Promise((resolve) => setTimeout(resolve, 5));
      storedValue = value;
    },
  );
  let removeStarted = false;
  const clear = clearEtfScoreSnapshots(async () => {
    removeStarted = true;
    storedValue = null;
  });

  await Promise.all([save, clear]);
  assert.equal(removeStarted, true);
  assert.equal(storedValue, null);
});

test("removing one ETF score snapshot preserves the rest of the saved history", async () => {
  const result = calculateEtfResearchScore(completeInput);
  const createSnapshot = (symbol: string, recordedAt: string) =>
    createEtfScoreSnapshot({
      symbol,
      score: result.score,
      components: result.components,
      sourceContexts: Object.fromEntries(
        result.components.filter((component) => component.score !== null)
          .map((component) => [component.id, `provider:${component.id}`]),
      ),
      inputAsOf: Object.fromEntries(
        result.components.filter((component) => component.score !== null)
          .map((component) => [component.id, ["2026-10-29T12:00:00Z"]]),
      ),
      recordedAt,
    });
  const firstSpy = createSnapshot("SPY", "2026-10-30T12:00:00Z");
  const voo = createSnapshot("VOO", "2026-10-30T12:00:00Z");
  const secondSpy = createSnapshot("SPY", "2026-10-31T12:00:00Z");
  assert.ok(firstSpy && voo && secondSpy);

  let storedValue: string | null = JSON.stringify([firstSpy, voo, secondSpy]);
  const remaining = await removeEtfScoreSnapshot(
    firstSpy,
    async () => storedValue,
    async (value) => { storedValue = value; },
  );

  assert.deepEqual(
    remaining.map(({ symbol, recordedAt }) => `${symbol}:${recordedAt}`),
    [`VOO:${voo.recordedAt}`, `SPY:${secondSpy.recordedAt}`],
  );
  assert.deepEqual(parseEtfScoreSnapshots(storedValue), remaining);
});

test("restoring one ETF score snapshot preserves its date and recalculates adjacent changes", async () => {
  const result = calculateEtfResearchScore(completeInput);
  const snapshotFor = (recordedAt: string, asOf: string, score: number) =>
    createEtfScoreSnapshot({
      symbol: "SPY",
      score,
      components: result.components,
      sourceContexts: Object.fromEntries(
        result.components.filter((component) => component.score !== null)
          .map((component) => [component.id, `provider:${component.id}`]),
      ),
      inputAsOf: Object.fromEntries(
        result.components.filter((component) => component.score !== null)
          .map((component) => [component.id, [asOf]]),
      ),
      recordedAt,
    });
  const first = snapshotFor("2026-10-10T12:00:00Z", "2026-10-09T12:00:00Z", 50);
  const removed = snapshotFor("2026-10-20T12:00:00Z", "2026-10-19T12:00:00Z", 60);
  const third = snapshotFor("2026-10-30T12:00:00Z", "2026-10-29T12:00:00Z", 80);
  assert.ok(first && removed && third);

  let storedValue: string | null = JSON.stringify([first, third]);
  const restored = await restoreEtfScoreSnapshot(
    removed,
    async () => storedValue,
    async (value) => { storedValue = value; },
  );
  const entries = buildEtfScoreHistory("SPY", null, restored);

  assert.deepEqual(restored.map((snapshot) => snapshot.recordedAt), [
    third.recordedAt,
    removed.recordedAt,
    first.recordedAt,
  ]);
  assert.deepEqual(entries.map(({ status }) => status), ["baseline", "available", "available"]);
  assert.equal(entries[1]?.change, 10);
  assert.equal(entries[2]?.change, 20);
  assert.equal(entries[2]?.previousRecordedAt, removed.recordedAt);
  assert.deepEqual(parseEtfScoreSnapshots(storedValue), restored);
});
