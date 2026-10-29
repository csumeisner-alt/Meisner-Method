import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const analysisSource = readFileSync(
  resolve(scriptDir, "../app/analysis/[symbol].tsx"),
  "utf8",
);

test("ETF comparison shows each historical scenario with its fee and assumptions", () => {
  assert.match(analysisSource, /const ETF_SCENARIO_LABELS = \['bear', 'base', 'bull'\] as const/);
  assert.match(analysisSource, /const ETF_SCENARIO_HORIZONS = \[1, 3, 5, 10, 20\] as const/);
  assert.match(analysisSource, /testID=\{`etf-scenario-horizon-\$\{horizonYears\}`\}/);
  assert.match(
    analysisSource,
    /comparisonMetricFunds\.map\(\(\{ symbol: fundSymbol, analysis: comparison \}\) => \{[\s\S]*?scenarioRows = ETF_SCENARIO_LABELS\.map/,
  );
  assert.match(analysisSource, /label="Expense ratio used"[\s\S]*?pctValue\(comparison\.expenseRatio\)/);
  assert.match(analysisSource, /label="Historical annual assumption"[\s\S]*?scenario\?\.annualReturnAssumption/);
  assert.match(analysisSource, /label=\{`One share in \$\{selectedScenarioHorizon\} years`\}/);
  assert.match(analysisSource, /selectedProjection\(scenario, selectedScenarioHorizon\)/);
  assert.match(analysisSource, /label=\{`After-fee value in \$\{selectedScenarioHorizon\} years`\}/);
  assert.match(analysisSource, /scenario\?\.assumption \?\? 'Unavailable: no reported historical scenario for this regime\.'/);
  assert.match(analysisSource, /Historical-regime illustrations only, not forecasts or guarantees/);
});
