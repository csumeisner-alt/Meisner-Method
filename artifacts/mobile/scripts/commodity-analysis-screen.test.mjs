import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const screen = readFileSync(new URL("../app/analysis/[symbol].tsx", import.meta.url), "utf8");
const modal = readFileSync(new URL("../components/HeatMapDetailModal.tsx", import.meta.url), "utf8");
const heatMap = readFileSync(new URL("../app/heat-map.tsx", import.meta.url), "utf8");

assert.match(modal, /testID="heat-map-detail-analyze-commodity"/);
assert.match(heatMap, /canAnalyzeCommodity=.*assetType === 'commodity'/);
assert.match(heatMap, /onAnalyzeCommodity=\{\(\) =>/);
assert.match(screen, /result\.assetType === 'commodity' && result\.commodityAnalysis/);
assert.match(screen, /commodity-analysis-score/);
assert.match(screen, /newsContext\.sources\.map/);
assert.match(screen, /source, instrument, unit, and freshness checks/);
assert.match(screen, /factor\.sources\.map/);
assert.match(screen, /accessibilityRole="link"/);
assert.match(screen, /COMMODITY_HISTORY_UNAVAILABLE/);
assert.match(screen, /errorData\?\.reason/);
assert.match(screen, /Last usable data date:/);
