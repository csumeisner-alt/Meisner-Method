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
  assert.match(
    analysisSource,
    /comparisonMetricFunds\.map\(\(\{ symbol: fundSymbol, analysis: comparison \}\) => \{[\s\S]*?scenarioRows = ETF_SCENARIO_LABELS\.map/,
  );
  assert.match(analysisSource, /label="Expense ratio used"[\s\S]*?pctValue\(comparison\.expenseRatio\)/);
  assert.match(analysisSource, /label="Historical annual assumption"[\s\S]*?scenario\?\.annualReturnAssumption/);
  assert.match(analysisSource, /label="One share in 5 years"[\s\S]*?scenario\.fiveYearValue == null \? 'Unavailable'/);
  assert.match(analysisSource, /label="One share in 10 years"[\s\S]*?scenario\.tenYearValue == null \? 'Unavailable'/);
  assert.match(analysisSource, /scenario\?\.assumption \?\? 'Unavailable: no reported historical scenario for this regime\.'/);
  assert.match(analysisSource, /Historical-regime illustrations only, not forecasts or guarantees/);
});
