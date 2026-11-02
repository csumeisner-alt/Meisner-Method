import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const heatMap = readFileSync(new URL("../app/heat-map.tsx", import.meta.url), "utf8");

assert.match(heatMap, /const unavailableMapAssets = responseMatches && category === 'commodities'/);
assert.match(heatMap, /testID="heat-map-unavailable-map-assets"/);
assert.match(heatMap, /testID="heat-map-unavailable-map-divider"/);
assert.match(heatMap, /testID=\{`heat-map-unavailable-hex-\$\{symbol\}`\}/);
assert.match(heatMap, /Quote unavailable/);
assert.match(heatMap, /responseMatches && category === 'custom'/);
assert.match(heatMap, /onPress=\{onAdd\}/);
assert.match(heatMap, /isSupportedCustomMapCommoditySymbol\(symbol\)/);
assert.match(heatMap, /isSupportedCustomMapCommoditySymbol\(symbol\)\s*\?\s*symbol\.trim\(\)\.toUpperCase\(\)/);
