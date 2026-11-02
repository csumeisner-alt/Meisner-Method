import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const heatMap = readFileSync(new URL("../app/heat-map.tsx", import.meta.url), "utf8");

assert.match(heatMap, /const unavailableCommodityAssets = category === 'commodities'/);
assert.match(heatMap, /testID="heat-map-unavailable-commodities"/);
assert.match(heatMap, /Quote unavailable/);
assert.match(heatMap, /No stale price is shown/);
assert.match(heatMap, /heat-map-add-unavailable-commodity-/);
assert.match(heatMap, /onPress=\{\(\) => \{ void addSymbol\(asset\.symbol\); \}\}/);
assert.match(heatMap, /isSupportedCustomMapCommoditySymbol\(symbol\)/);
assert.match(heatMap, /isSupportedCustomMapCommoditySymbol\(symbol\)\s*\?\s*symbol\.trim\(\)\.toUpperCase\(\)/);
