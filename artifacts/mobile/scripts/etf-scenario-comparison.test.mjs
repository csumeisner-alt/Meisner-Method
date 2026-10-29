import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  calculateEtfScenarioValue,
  ETF_SCENARIO_HORIZONS,
  ETF_SCENARIO_LABELS,
  parseEtfScenarios,
} from "../lib/etfScenario.ts";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const analysisSource = readFileSync(
  resolve(scriptDir, "../app/analysis/[symbol].tsx"),
  "utf8",
);

test("ETF comparison shows each historical scenario with its fee and assumptions", () => {
  assert.match(analysisSource, /calculateEtfScenarioValue,[\s\S]*ETF_SCENARIO_LABELS,[\s\S]*ETF_SCENARIO_HORIZONS,[\s\S]*parseEtfScenarios/);
  assert.match(analysisSource, /testID=\{`etf-scenario-horizon-\$\{horizonYears\}`\}/);
  assert.match(analysisSource, /renderMonthlyContributionInput\('etf-scenario-monthly-contribution-input'\)/);
  assert.match(analysisSource, /accessibilityLabel="Monthly ETF contribution in dollars"/);
  assert.match(analysisSource, /calculateEtfScenarioValue\(/);
  assert.match(
    analysisSource,
    /comparisonMetricFunds\.map\(\(\{ symbol: fundSymbol, currentPrice: comparisonPrice, analysis: comparison \}\) => \{[\s\S]*?scenarioRows = ETF_SCENARIO_LABELS\.map/,
  );
  assert.match(analysisSource, /label="Expense ratio used"[\s\S]*?pctValue\(comparison\.expenseRatio\)/);
  assert.match(analysisSource, /label="Historical annual assumption"[\s\S]*?scenario\?\.annualReturnAssumption/);
  assert.match(analysisSource, /value=\{pctValue\(scenario\?\.annualReturnAssumption \?\? null\)\}/);
  assert.match(analysisSource, /label=\{`No-fee total in \$\{selectedScenarioHorizon\} years`\}/);
  assert.match(analysisSource, /label=\{`After-fee total in \$\{selectedScenarioHorizon\} years`\}/);
  assert.match(analysisSource, /selectedProjection\(scenario, selectedScenarioHorizon, comparisonPrice\)\?\.afterFeeValue == null\s*\?\s*'Unavailable'/);
  assert.match(analysisSource, /scenario\?\.assumption \?\? 'Unavailable: no reported historical scenario for this regime\.'/);
  assert.match(analysisSource, /Historical-regime illustrations only, not forecasts or guarantees/);
});

test("ETF recurring contribution values use deterministic monthly compounding", () => {
  assert.equal(calculateEtfScenarioValue(100, 0, 25, 3), 1000);
  assert.equal(calculateEtfScenarioValue(100, 0.12, 0, 1), 112);

  const monthlyRate = (1 + 0.08) ** (1 / 12) - 1;
  let expected = 250;
  for (let month = 0; month < 60; month += 1) {
    expected = expected * (1 + monthlyRate) + 75;
  }
  const result = calculateEtfScenarioValue(250, 0.08, 75, 5);
  assert.equal(result, Math.round(expected * 100) / 100);
  assert.equal(calculateEtfScenarioValue(250, 0.08, 75, 5), result);
  assert.equal(calculateEtfScenarioValue(250, null, 75, 5), null);
});

test("ETF contribution projections reject invalid inputs without inventing a value", () => {
  for (const [initialInvestment, annualReturn, monthlyContribution, horizonYears] of [
    [0, 0.05, 25, 5],
    [100, -1, 25, 5],
    [100, 0.05, -1, 5],
    [100, 0.05, 25, 0],
    [100, Number.NaN, 25, 5],
  ]) {
    assert.equal(
      calculateEtfScenarioValue(initialInvestment, annualReturn, monthlyContribution, horizonYears),
      null,
    );
  }
});

test("ETF comparison converts non-finite assumptions and five- and ten-year values to unavailable", () => {
  const numericFields = [
    "annualReturnAssumption",
    "noFeeAnnualReturnAssumption",
    "fiveYearValue",
    "tenYearValue",
    "noFeeFiveYearValue",
    "noFeeTenYearValue",
  ];
  const makeScenario = (label, overrides = {}) => ({
    label,
    annualReturnAssumption: 0.04,
    noFeeAnnualReturnAssumption: 0.05,
    fiveYearValue: 121.67,
    tenYearValue: 148.02,
    noFeeFiveYearValue: 127.63,
    noFeeTenYearValue: 162.89,
    assumption: `Historical ${label} regime`,
    projections: [
      { horizonYears: 5, noFeeValue: 127.63, afterFeeValue: 121.67 },
      { horizonYears: 10, noFeeValue: 162.89, afterFeeValue: 148.02 },
    ],
    ...overrides,
  });

  assert.deepEqual(ETF_SCENARIO_LABELS, ["bear", "base", "bull"]);
  assert.deepEqual(ETF_SCENARIO_HORIZONS, [1, 3, 5, 10, 20]);

  for (const invalidValue of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
    for (const field of numericFields) {
      const parsed = parseEtfScenarios([
        makeScenario("bear", { [field]: invalidValue }),
        makeScenario("base"),
        makeScenario("bull"),
      ]);

      assert.deepEqual(parsed.map((scenario) => scenario.label), ["bear", "base", "bull"]);
      assert.equal(parsed[0]?.[field], null, `${field} should be unavailable for ${invalidValue}`);
      assert.equal(parsed[1]?.annualReturnAssumption, 0.04);
      assert.equal(parsed[1]?.fiveYearValue, 121.67);
      assert.equal(parsed[1]?.tenYearValue, 148.02);
      assert.equal(parsed[2]?.annualReturnAssumption, 0.04);
    }

    for (const horizonYears of [5, 10]) {
      for (const projectionField of ["noFeeValue", "afterFeeValue"]) {
        const projections = [
          { horizonYears: 5, noFeeValue: 127.63, afterFeeValue: 121.67 },
          { horizonYears: 10, noFeeValue: 162.89, afterFeeValue: 148.02 },
        ].map((projection) =>
          projection.horizonYears === horizonYears
            ? { ...projection, [projectionField]: invalidValue }
            : projection,
        );
        const parsed = parseEtfScenarios([
          makeScenario("bear", { projections }),
          makeScenario("base"),
          makeScenario("bull"),
        ]);

        assert.equal(
          parsed[0]?.projections.find((projection) => projection.horizonYears === horizonYears)?.[projectionField],
          null,
          `${projectionField} at ${horizonYears} years should be unavailable for ${invalidValue}`,
        );
        assert.deepEqual(parsed.map((scenario) => scenario.label), ["bear", "base", "bull"]);
        assert.equal(parsed[1]?.projections.find((projection) => projection.horizonYears === horizonYears)?.[projectionField], projectionField === "noFeeValue" ? (horizonYears === 5 ? 127.63 : 162.89) : (horizonYears === 5 ? 121.67 : 148.02));
      }
    }
  }
});
