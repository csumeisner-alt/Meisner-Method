import test from "node:test";
import assert from "node:assert/strict";
import {
  buildEtfPeerComparisonFields,
  buildEtfScenarios,
  calculateEtfRiskMetrics,
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
  assert.match(scenarios[1]?.assumption ?? "", /sample-weighted/);
  const missing = buildEtfScenarios(100, null, null);
  assert.equal(missing.every((scenario) => scenario.fiveYearValue === null), true);
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
