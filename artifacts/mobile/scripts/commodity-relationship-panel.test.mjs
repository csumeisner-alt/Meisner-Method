import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const screen = readFileSync(new URL("../app/analysis/[symbol].tsx", import.meta.url), "utf8");
const panel = readFileSync(new URL("../components/CommodityRelationshipPanel.tsx", import.meta.url), "utf8");

assert.match(screen, /<CommodityRelationshipPanel \/>/);
for (const id of ["gold-silver", "gold-dollar", "copper-gold", "oil-gold", "gold-silver-ratio"]) {
  assert.match(panel, new RegExp(`id: '${id}'`));
}
assert.match(panel, /testID=\{`commodity-relationship-select-\$\{item\.id\}`\}/);
for (const period of ["1mo", "3mo", "6mo", "1y", "5y", "max"]) {
  assert.match(panel, new RegExp(`value: '${period}'`));
}
assert.match(panel, /testID=\{`commodity-relationship-period-\$\{item\.value\}`\}/);
assert.match(panel, /useGetCommodityRelationship/);
assert.match(panel, /ComparisonChart/);
assert.match(panel, /commodity-relationship-correlation-chart/);
assert.match(panel, /commodity-relationship-correlation-touch-target/);
assert.match(panel, /accessibilityHint="Tap across the chart to inspect rolling correlation by date\."/);
assert.match(panel, /commodity-relationship-correlation-positive-line/);
assert.match(panel, /commodity-relationship-correlation-negative-line/);
assert.match(panel, /strokeDasharray="5 3"/);
assert.match(panel, /Positive values are above zero with solid lines; negative values are below zero with dashed lines\./);
assert.match(panel, /correlationSign\(selectedValue\)/);
assert.match(panel, /＋ Positive · solid/);
assert.match(panel, /− Negative · dashed/);
assert.match(panel, /onPress=\{selectPoint\}/);
assert.match(panel, /commodity-relationship-coverage/);
assert.match(panel, /AI INTERPRETATION · SEPARATE FROM OBSERVED DATA/);
assert.match(panel, /does not establish causation/);
assert.match(panel, /data\.historyRanks\.map/);
assert.match(panel, /data\.rankTrend/);
assert.match(panel, /commodity-gold-silver-rank-trend/);
assert.match(panel, /commodity-gold-silver-rank-trend-line/);
assert.match(panel, /commodity-gold-silver-rank-trend-touch-target/);
assert.match(panel, /trailing year using/);
assert.match(panel, /exact matched dates/);
assert.match(panel, /Historical ranks are descriptive/);
for (const period of ["1mo", "3mo", "6mo", "1y", "5y", "max"]) {
  assert.match(panel, new RegExp(`commodity-gold-silver-rank-\\$\\{rank\\.period\\}`));
}
assert.match(panel, /Relationship history could not be loaded/);
assert.match(panel, /commodity-relationship-retry/);
assert.match(panel, /Math\.min\(620, screenWidth - 60\)/);
assert.doesNotMatch(panel, /Math\.max\(280, screenWidth - 64\)/);
assert.match(panel, /commodity-relationship-toggle/);
assert.match(panel, /minHeight: 44/);
assert.match(panel, /accessibilityLabel="Retry loading commodity relationship history"/);
const comparisonChart = readFileSync(new URL("../components/ComparisonChart.tsx", import.meta.url), "utf8");
assert.match(comparisonChart, /largeTouchTargets/);
assert.match(comparisonChart, /comparison-chart-touch-target/);
assert.match(comparisonChart, /largeTouchTargets && <Pressable/);
assert.match(comparisonChart, /pointerEvents=\{largeTouchTargets \? 'none' : 'auto'\}/);
const relationshipChartWidthAt320 = Math.max(1, Math.min(620, 320 - 60));
assert.equal(relationshipChartWidthAt320, 260);
assert.ok(relationshipChartWidthAt320 <= 320 - 60);
