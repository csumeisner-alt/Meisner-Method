import assert from "node:assert/strict";
import test from "node:test";
import {
  CUSTOM_HEAT_MAP_ASSETS,
  CUSTOM_HEAT_MAP_ASSET_TYPES,
  MAX_CUSTOM_HEAT_MAP_SYMBOLS,
  normalizeCustomHeatMapSymbols,
} from "../heatMapSymbols.ts";

test("saved custom symbols are uppercased, validated, and deduplicated", () => {
  assert.deepEqual(
    normalizeCustomHeatMapSymbols([" aapl ", "AAPL", "brk-b", "bad symbol", 42, ""]),
    ["AAPL", "BRK-B"],
  );
});

test("saved custom symbols are capped to the API's supported maximum", () => {
  const input = Array.from({ length: MAX_CUSTOM_HEAT_MAP_SYMBOLS + 3 }, (_, index) => `T${index}`);
  assert.equal(normalizeCustomHeatMapSymbols(input).length, MAX_CUSTOM_HEAT_MAP_SYMBOLS);
});

test("custom heat-map asset picker offers every supported non-stock universe", () => {
  assert.deepEqual(CUSTOM_HEAT_MAP_ASSET_TYPES.map(({ id }) => id), [
    "stocks", "etfs", "commodities", "futures", "cryptocurrency",
  ]);
  assert.equal(CUSTOM_HEAT_MAP_ASSETS.etfs.length, 30);
  assert.equal(CUSTOM_HEAT_MAP_ASSETS.commodities.length, 15);
  assert.equal(CUSTOM_HEAT_MAP_ASSETS.futures.length, 12);
  assert.equal(CUSTOM_HEAT_MAP_ASSETS.cryptocurrency.length, 16);

  for (const [type, assets] of Object.entries(CUSTOM_HEAT_MAP_ASSETS)) {
    assert.equal(new Set(assets.map(({ symbol }) => symbol)).size, assets.length, `${type} symbols are unique`);
    for (const asset of assets) {
      assert.ok(asset.name.length > 0, `${asset.symbol} has a display name`);
      assert.deepEqual(normalizeCustomHeatMapSymbols([asset.symbol]), [asset.symbol]);
    }
  }
});