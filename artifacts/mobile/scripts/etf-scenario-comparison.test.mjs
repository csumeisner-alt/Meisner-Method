import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  calculateEtfScenarioBreakdown,
  calculateEtfScenarioValue,
  ETF_CONTRIBUTION_CADENCES,
  ETF_SCENARIO_HORIZONS,
  ETF_SCENARIO_LABELS,
  parseEtfContributionCadence,
  parseEtfScenarios,
} from "../lib/etfScenario.ts";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const analysisSource = readFileSync(
  resolve(scriptDir, "../app/analysis/[symbol].tsx"),
  "utf8",
);

test("ETF comparison shows each historical scenario with its fee and assumptions", () => {
  assert.match(analysisSource, /calculateEtfScenarioBreakdown,[\s\S]*ETF_CONTRIBUTION_CADENCES,[\s\S]*ETF_SCENARIO_LABELS,[\s\S]*ETF_SCENARIO_HORIZONS,[\s\S]*parseEtfScenarios/);
  assert.match(analysisSource, /testID=\{`etf-scenario-horizon-\$\{horizonYears\}`\}/);
  assert.match(analysisSource, /renderContributionControls\('etf-scenario-contribution-input'\)/);
  assert.match(analysisSource, /accessibilityLabel="ETF contribution amount per deposit in dollars"/);
  assert.match(analysisSource, /testID=\{\`\$\{testID\.replace\('-contribution-input', ''\)\}-cadence-\$\{cadence\}\`\}/);
  assert.match(analysisSource, /calculateEtfScenarioBreakdown\([\s\S]*?contributionCadence/);
  assert.match(
    analysisSource,
    /calculateEtfScenarioBreakdown\([\s\S]*?contributionAmount,\s*horizonYears,\s*contributionCadence/,
  );
  assert.match(
    analysisSource,
    /comparisonMetricFunds\.map\(\(\{ symbol: fundSymbol, currentPrice: comparisonPrice, analysis: comparison \}\) => \{[\s\S]*?scenarioRows = ETF_SCENARIO_LABELS\.map/,
  );
  assert.match(analysisSource, /label="Expense ratio used"[\s\S]*?pctValue\(comparison\.expenseRatio\)/);
  assert.match(analysisSource, /label="Historical annual assumption"[\s\S]*?scenario\?\.annualReturnAssumption/);
  assert.match(analysisSource, /value=\{pctValue\(scenario\?\.annualReturnAssumption \?\? null\)\}/);
  assert.match(analysisSource, /label=\{`No-fee total in \$\{selectedScenarioHorizon\} years`\}/);
  assert.match(analysisSource, /label=\{`After-fee total in \$\{selectedScenarioHorizon\} years`\}/);
  assert.match(analysisSource, /label="Starting investment"/);
  assert.match(analysisSource, /label="Total contributions"/);
  assert.match(analysisSource, /label=\{`No-fee projected growth in \$\{selectedScenarioHorizon\} years`\}/);
  assert.match(analysisSource, /label=\{`After-fee projected growth in \$\{selectedScenarioHorizon\} years`\}/);
  for (const label of [
    /label="Starting investment"/g,
    /label="Total contributions"/g,
    /label=\{`No-fee projected growth in \$\{selectedScenarioHorizon\} years`\}/g,
    /label=\{`After-fee projected growth in \$\{selectedScenarioHorizon\} years`\}/g,
  ]) {
    assert.equal([...analysisSource.matchAll(label)].length, 2, `${label} should appear in both ETF scenario views`);
  }
  assert.match(analysisSource, /selectedProjection\(scenario, selectedScenarioHorizon, comparisonPrice\)\?\.afterFeeValue == null\s*\?\s*'Unavailable'/);
  assert.match(analysisSource, /scenario\?\.assumption \?\? 'Unavailable: no reported historical scenario for this regime\.'/);
  assert.match(analysisSource, /Historical-regime illustrations only, not forecasts or guarantees[\s\S]*?selected \{contributionCadence\} schedule/);
  assert.match(analysisSource, /Historical-regime illustrations only, not forecasts or guarantees[\s\S]*?contributions deposited at the end of each/);
});

test("ETF recurring contribution values use deterministic end-of-period deposits", () => {
  assert.equal(calculateEtfScenarioValue(100, 0, 25, 3), 1000);
  assert.equal(calculateEtfScenarioValue(100, 0.12, 0, 1), 112);

  assert.deepEqual(ETF_CONTRIBUTION_CADENCES, ["weekly", "monthly", "quarterly"]);
  assert.equal(calculateEtfScenarioValue(100, 0, 10, 2, "weekly"), 1140);
  assert.equal(calculateEtfScenarioValue(100, 0, 10, 2, "monthly"), 340);
  assert.equal(calculateEtfScenarioValue(100, 0, 10, 2, "quarterly"), 180);

  const periodsPerYear = { weekly: 52, monthly: 12, quarterly: 4 };
  for (const cadence of ETF_CONTRIBUTION_CADENCES) {
    const rate = (1 + 0.08) ** (1 / periodsPerYear[cadence]) - 1;
    let expected = 250;
    for (let period = 0; period < periodsPerYear[cadence] * 5; period += 1) {
      expected = expected * (1 + rate) + 75;
    }
    const result = calculateEtfScenarioValue(250, 0.08, 75, 5, cadence);
    assert.equal(result, Math.round(expected * 100) / 100, `${cadence} deposits should match period-by-period compounding`);
    assert.equal(calculateEtfScenarioValue(250, 0.08, 75, 5, cadence), result);
  }
  assert.equal(calculateEtfScenarioValue(250, null, 75, 5, "weekly"), null);
});

test("ETF contribution cadence preferences restore valid choices and default safely", () => {
  assert.equal(parseEtfContributionCadence("weekly"), "weekly");
  assert.equal(parseEtfContributionCadence("monthly"), "monthly");
  assert.equal(parseEtfContributionCadence("quarterly"), "quarterly");
  for (const invalid of [null, undefined, "", "yearly", 12, {}, "Monthly"]) {
    assert.equal(parseEtfContributionCadence(invalid), "monthly");
  }
  assert.match(analysisSource, /AsyncStorage\.getItem\(ETF_CONTRIBUTION_CADENCE_KEY\)/);
  assert.match(analysisSource, /AsyncStorage\.setItem\(ETF_CONTRIBUTION_CADENCE_KEY,\s*contributionCadence\)/);
  assert.match(analysisSource, /if \(!contributionCadenceLoaded\) return/);
  assert.match(analysisSource, /contributionCadenceTouched\.current = true/);
});

test("ETF scenario breakdown separates starting investment, deposits, and growth", () => {
  assert.deepEqual(calculateEtfScenarioBreakdown(100, 0, 25, 3), {
    startingInvestment: 100,
    totalContributions: 900,
    contributedPrincipal: 1000,
    totalValue: 1000,
    projectedGrowth: 0,
  });
  assert.deepEqual(calculateEtfScenarioBreakdown(100, 0.12, 0, 1), {
    startingInvestment: 100,
    totalContributions: 0,
    contributedPrincipal: 100,
    totalValue: 112,
    projectedGrowth: 12,
  });
  assert.deepEqual(calculateEtfScenarioBreakdown(100, null, 10, 1, "quarterly"), {
    startingInvestment: 100,
    totalContributions: 40,
    contributedPrincipal: 140,
    totalValue: null,
    projectedGrowth: null,
  });

  const noFee = calculateEtfScenarioBreakdown(100, 0.08, 10, 2, "quarterly");
  const afterFee = calculateEtfScenarioBreakdown(100, 0.04, 10, 2, "quarterly");
  assert.equal(noFee.startingInvestment, 100);
  assert.equal(afterFee.startingInvestment, 100);
  assert.equal(noFee.totalContributions, 80);
  assert.equal(afterFee.totalContributions, 80);
  assert.equal(noFee.contributedPrincipal, 180);
  assert.equal(afterFee.contributedPrincipal, 180);
  assert.ok(noFee.projectedGrowth > afterFee.projectedGrowth);
  assert.equal(noFee.totalValue, noFee.contributedPrincipal + noFee.projectedGrowth);
  assert.equal(afterFee.totalValue, afterFee.contributedPrincipal + afterFee.projectedGrowth);

  const periodsPerYear = { weekly: 52, monthly: 12, quarterly: 4 };
  for (const cadence of ETF_CONTRIBUTION_CADENCES) {
    const breakdown = calculateEtfScenarioBreakdown(100, 0.05, 10, 2, cadence);
    assert.equal(breakdown.startingInvestment, 100);
    assert.equal(
      breakdown.totalContributions,
      10 * periodsPerYear[cadence] * 2,
      `${cadence} contributions should update with the selected schedule and horizon`,
    );
    assert.equal(
      breakdown.contributedPrincipal,
      100 + 10 * periodsPerYear[cadence] * 2,
      `${cadence} principal should count each end-of-period deposit`,
    );
    assert.equal(breakdown.totalValue, breakdown.contributedPrincipal + breakdown.projectedGrowth);
  }

  const loss = calculateEtfScenarioBreakdown(100, -0.1, 0, 2);
  assert.equal(loss.contributedPrincipal, 100);
  assert.ok(loss.projectedGrowth < 0);
  assert.equal(loss.totalValue, loss.contributedPrincipal + loss.projectedGrowth);
});

test("ETF contribution projections reject invalid inputs without inventing a value", () => {
  for (const [initialInvestment, annualReturn, contributionAmount, horizonYears] of [
    [0, 0.05, 25, 5],
    [100, -1, 25, 5],
    [100, 0.05, -1, 5],
    [100, 0.05, 25, 0],
    [100, Number.NaN, 25, 5],
  ]) {
    assert.equal(
      calculateEtfScenarioValue(initialInvestment, annualReturn, contributionAmount, horizonYears),
      null,
    );
  }
});

test("ETF comparison converts non-finite assumptions and projection values to unavailable", () => {
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
    projections: ETF_SCENARIO_HORIZONS.map((horizonYears) => ({
      horizonYears,
      noFeeValue: 100 + horizonYears,
      afterFeeValue: 90 + horizonYears,
    })),
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

    for (const horizonYears of ETF_SCENARIO_HORIZONS) {
      for (const projectionField of ["noFeeValue", "afterFeeValue"]) {
        const projections = ETF_SCENARIO_HORIZONS.map((projectionHorizon) => ({
          horizonYears: projectionHorizon,
          noFeeValue: 100 + projectionHorizon,
          afterFeeValue: 90 + projectionHorizon,
        })).map((projection) =>
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
        assert.equal(
          parsed[0]?.projections.find((projection) => projection.horizonYears === horizonYears)?.[
            projectionField === "noFeeValue" ? "afterFeeValue" : "noFeeValue"
          ],
          projectionField === "noFeeValue" ? 90 + horizonYears : 100 + horizonYears,
          `the unaffected value at ${horizonYears} years should remain available`,
        );
        assert.equal(
          parsed[1]?.projections.find((projection) => projection.horizonYears === horizonYears)?.[projectionField],
          projectionField === "noFeeValue" ? 100 + horizonYears : 90 + horizonYears,
          `the base regime at ${horizonYears} years should remain available`,
        );
        assert.equal(
          parsed[2]?.projections.find((projection) => projection.horizonYears === horizonYears)?.[projectionField],
          projectionField === "noFeeValue" ? 100 + horizonYears : 90 + horizonYears,
          `the bull regime at ${horizonYears} years should remain available`,
        );
      }
    }
  }
});
