import test from "node:test";
import assert from "node:assert/strict";
import {
  buildEtfPeerComparisonFields,
  buildEtfScenarios,
  calculateEtfRiskMetrics,
  ETF_SCENARIO_HORIZONS,
} from "./etfAnalysis.ts";

test("ETF scenario values use reported regime averages and disclose missing samples", () => {
  const scenarios = buildEtfScenarios(100, 0.01, {
    bear: { averageAnnualReturn: -0.1, years: 2 },
    mixed: { averageAnnualReturn: 0.05, years: 4 },
    bull: { averageAnnualReturn: 0.2, years: 2 },
  });
  assert.equal(scenarios[0]?.annualReturnAssumption, -0.11);
  assert.equal(scenarios[0]?.fiveYearValue, 55.84);
  assert.equal(scenarios[1]?.annualReturnAssumption, 0.04);
  assert.equal(scenarios[2]?.tenYearValue, 569.47);
  assert.deepEqual(
    scenarios[1]?.projections.map((projection) => projection.horizonYears),
    ETF_SCENARIO_HORIZONS,
  );
  for (const projection of scenarios[1]?.projections ?? []) {
    assert.equal(
      projection.noFeeValue,
      Math.round(100 * (1 + 0.05) ** projection.horizonYears * 100) / 100,
    );
    assert.equal(
      projection.afterFeeValue,
      Math.round(100 * (1 + 0.04) ** projection.horizonYears * 100) / 100,
    );
  }
  assert.match(scenarios[1]?.assumption ?? "", /sample-weighted/);
  const missing = buildEtfScenarios(100, null, null);
  assert.equal(missing.every((scenario) => scenario.fiveYearValue === null), true);
  assert.equal(missing.every((scenario) => scenario.projections.every(
    (projection) => projection.noFeeValue === null && projection.afterFeeValue === null,
  )), true);
  assert.match(missing[0]?.assumption ?? "", /insufficient/);
});

test("ETF scenarios treat negative and non-finite expense ratios as unavailable", () => {
  const periods = {
    bear: { averageAnnualReturn: -0.1, years: 2 },
    mixed: { averageAnnualReturn: 0.05, years: 4 },
    bull: { averageAnnualReturn: 0.2, years: 2 },
  };
  const withoutFee = buildEtfScenarios(100, null, periods);

  for (const invalidFee of [-0.01, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
    const scenarios = buildEtfScenarios(100, invalidFee, periods);
    assert.deepEqual(scenarios, withoutFee);
    assert.equal(scenarios[1]?.noFeeFiveYearValue, 127.63);
    assert.equal(scenarios[1]?.fiveYearValue, null);
    assert.equal(scenarios.some((scenario) => /expense ratio was not reported/.test(scenario.assumption)), true);
  }
});

test("ETF scenarios use the same $100 starting investment regardless of share price", () => {
  const periods = {
    bear: { averageAnnualReturn: -0.1, years: 2 },
    mixed: { averageAnnualReturn: 0.05, years: 4 },
    bull: { averageAnnualReturn: 0.2, years: 2 },
  };
  const baseline = buildEtfScenarios(100, 0.01, periods);

  for (const invalidPrice of [
    null,
    undefined,
    0,
    -1,
    Number.NaN,
    Number.POSITIVE_INFINITY,
    Number.NEGATIVE_INFINITY,
    400,
    Number.MAX_VALUE,
  ]) {
    assert.deepEqual(buildEtfScenarios(invalidPrice, 0.01, periods), baseline);
  }
  assert.equal(baseline[1]?.projections.find((projection) => projection.horizonYears === 5)?.noFeeValue, 127.63);
  assert.match(baseline[1]?.assumption ?? "", /\$100 initial investment/);
});

test("ETF scenarios omit non-finite reported regimes without hiding valid regimes", () => {
  for (const invalidReturn of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
    const scenarios = buildEtfScenarios(100, 0.01, {
      bear: { averageAnnualReturn: invalidReturn, years: 2 },
      mixed: { averageAnnualReturn: 0.05, years: 4 },
      bull: { averageAnnualReturn: 0.2, years: 2 },
    });
    const bear = scenarios.find((scenario) => scenario.label === "bear");
    const base = scenarios.find((scenario) => scenario.label === "base");
    const bull = scenarios.find((scenario) => scenario.label === "bull");

    assert.equal(bear?.annualReturnAssumption, null);
    assert.equal(bear?.fiveYearValue, null);
    assert.equal(bear?.tenYearValue, null);
    assert.match(bear?.assumption ?? "", /insufficient provider-reported bear regime history/);
    assert.ok(Math.abs((base?.annualReturnAssumption ?? 0) - 0.09) < 1e-12);
    assert.equal(base?.fiveYearValue, 153.86);
    assert.equal(base?.tenYearValue, 236.74);
    assert.equal(bull?.annualReturnAssumption, 0.19);
    assert.equal(bull?.fiveYearValue, 238.64);
    assert.equal(bull?.tenYearValue, 569.47);
  }
});

test("ETF scenario base ignores malformed durations and safely weights large finite durations", () => {
  const invalidDurations: unknown[] = [
    undefined,
    null,
    "1000",
    Number.NaN,
    Number.POSITIVE_INFINITY,
    Number.NEGATIVE_INFINITY,
    0,
    -1,
  ];
  const periods = Object.fromEntries([
    ["firstValid", { averageAnnualReturn: 0.05, years: 2 }],
    ["secondValid", { averageAnnualReturn: 0.2, years: 4 }],
    ...invalidDurations.map((years, index) => [
      `invalid${index}`,
      { averageAnnualReturn: 0.99, years },
    ]),
  ]) as Parameters<typeof buildEtfScenarios>[2];
  const scenarios = buildEtfScenarios(100, 0.01, periods);
  const base = scenarios.find((scenario) => scenario.label === "base");

  assert.equal(base?.noFeeAnnualReturnAssumption, 0.15);
  assert.ok(Math.abs((base?.annualReturnAssumption ?? 0) - 0.14) < 1e-12);
  assert.ok(Number.isFinite(base?.noFeeAnnualReturnAssumption));

  const largeDurations = buildEtfScenarios(100, 0, {
    firstValid: { averageAnnualReturn: 0.05, years: Number.MAX_VALUE },
    secondValid: { averageAnnualReturn: 0.2, years: Number.MAX_VALUE },
  });
  const largeDurationBase = largeDurations.find((scenario) => scenario.label === "base");
  assert.equal(largeDurationBase?.noFeeAnnualReturnAssumption, 0.125);
  assert.ok(Number.isFinite(largeDurationBase?.noFeeAnnualReturnAssumption));
});

test("ETF scenarios preserve reported zero and positive expense ratio calculations", () => {
  const periods = {
    bear: { averageAnnualReturn: -0.1, years: 2 },
    mixed: { averageAnnualReturn: 0.05, years: 4 },
    bull: { averageAnnualReturn: 0.2, years: 2 },
  };
  const zeroFee = buildEtfScenarios(100, 0, periods);
  const positiveFee = buildEtfScenarios(100, 0.01, periods);
  const withoutFee = buildEtfScenarios(100, null, periods);

  assert.equal(zeroFee[1]?.annualReturnAssumption, 0.05);
  assert.match(zeroFee[1]?.assumption ?? "", /subtracts the reported expense ratio/);
  assert.equal(positiveFee[1]?.annualReturnAssumption, 0.04);
  assert.equal(positiveFee[1]?.fiveYearValue, 121.67);
  assert.equal(positiveFee[1]?.noFeeFiveYearValue, 127.63);
  assert.match(positiveFee[1]?.assumption ?? "", /subtracts the reported expense ratio/);
  assert.notDeepEqual(zeroFee, withoutFee);
});

test("ETF projection values do not overflow from a large current share price", () => {
  const scenarios = buildEtfScenarios(Number.MAX_VALUE, 0, {
    bear: { averageAnnualReturn: 0, years: 1 },
    bull: { averageAnnualReturn: 0, years: 1 },
  });

  for (const scenario of scenarios) {
    assert.deepEqual(scenario.projections.map((projection) => projection.horizonYears), ETF_SCENARIO_HORIZONS);
    assert.ok(scenario.projections.every(
      (projection) => projection.noFeeValue === 100 && projection.afterFeeValue === 100,
    ));
  }
});

test("ETF projections reject large finite returns when compounding or rounding overflows", () => {
  const scenarios = buildEtfScenarios(1, 0, {
    bear: { averageAnnualReturn: 1e100, years: 1 },
    bull: { averageAnnualReturn: 1e100, years: 1 },
  });

  for (const scenario of scenarios) {
    assert.deepEqual(
      scenario.projections.map((projection) => projection.horizonYears),
      ETF_SCENARIO_HORIZONS,
    );
    for (const projection of scenario.projections) {
      const expected = projection.horizonYears <= 3
        ? Math.round(100 * (1 + 1e100) ** projection.horizonYears * 100) / 100
        : null;
      assert.equal(projection.noFeeValue, expected);
      assert.equal(projection.afterFeeValue, expected);
    }
    assert.equal(scenario.projections.some(
      (projection) =>
        projection.noFeeValue !== null && !Number.isFinite(projection.noFeeValue),
    ), false);
  }
});

test("ETF risk metrics derive annualized volatility, drawdown, and risk-adjusted return", () => {
  const metrics = calculateEtfRiskMetrics([100, 110, 99, 108]);
  assert.ok(typeof metrics.annualizedVolatility === "number" && metrics.annualizedVolatility > 0);
  assert.ok(Math.abs(metrics.maxDrawdown! + 0.1) < 1e-12);
  assert.ok(typeof metrics.riskAdjustedReturn === "number");
  assert.equal(calculateEtfRiskMetrics([100]).annualizedVolatility, null);
});

test("ETF analysis response preserves peer metadata and adds source retrieval context", () => {
  const asOf = "2026-10-29T12:34:56.000Z";
  const fields = buildEtfPeerComparisonFields({
    peerExpenseComparison: {
      category: "Large Growth",
      fundExpenseRatio: 0.0004,
      categoryAverageExpenseRatio: 0.006,
      difference: -0.0056,
      sampleSize: null,
      sampleContext: "Provider-defined category average; sample size not reported",
    },
    peerAssetSizeComparison: {
      category: "Large Growth",
      fundTotalAssets: 120_000_000_000,
      categoryAverageTotalAssets: 32_000_000_000,
      difference: 88_000_000_000,
      sampleSize: null,
      sampleContext: "Provider-defined average total net assets; sample size not reported",
    },
  }, asOf);

  assert.deepEqual(fields.peerExpenseComparison, {
    category: "Large Growth",
    fundExpenseRatio: 0.0004,
    categoryAverageExpenseRatio: 0.006,
    difference: -0.0056,
    sampleSize: null,
    sampleContext: "Provider-defined category average; sample size not reported",
    source: "Yahoo Finance",
    asOf,
  });
  assert.deepEqual(fields.peerAssetSizeComparison, {
    category: "Large Growth",
    fundTotalAssets: 120_000_000_000,
    categoryAverageTotalAssets: 32_000_000_000,
    difference: 88_000_000_000,
    sampleSize: null,
    sampleContext: "Provider-defined average total net assets; sample size not reported",
    source: "Yahoo Finance",
    asOf,
  });
});

test("ETF analysis response leaves unavailable peer comparisons null", () => {
  const fields = buildEtfPeerComparisonFields({
    peerExpenseComparison: null,
    peerAssetSizeComparison: null,
  }, "2026-10-29T12:34:56.000Z");

  assert.equal(fields.peerExpenseComparison, null);
  assert.equal(fields.peerAssetSizeComparison, null);
});
