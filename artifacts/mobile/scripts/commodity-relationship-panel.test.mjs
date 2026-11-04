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
assert.match(panel, /onPress=\{selectPoint\}/);
assert.match(panel, /commodity-relationship-coverage/);
assert.match(panel, /AI INTERPRETATION · SEPARATE FROM OBSERVED DATA/);
assert.match(panel, /does not establish causation/);
assert.match(panel, /Relationship history could not be loaded/);
assert.match(panel, /commodity-relationship-retry/);
