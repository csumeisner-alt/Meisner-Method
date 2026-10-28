import test from "node:test";
import assert from "node:assert/strict";
import { buildEtfScenarios, calculateEtfRiskMetrics } from "./etfAnalysis.ts";

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

test("ETF risk metrics derive annualized volatility, drawdown, and risk-adjusted return", () => {
  const metrics = calculateEtfRiskMetrics([100, 110, 99, 108]);
  assert.ok(typeof metrics.annualizedVolatility === "number" && metrics.annualizedVolatility > 0);
  assert.ok(Math.abs(metrics.maxDrawdown! + 0.1) < 1e-12);
  assert.ok(typeof metrics.riskAdjustedReturn === "number");
  assert.equal(calculateEtfRiskMetrics([100]).annualizedVolatility, null);
});
