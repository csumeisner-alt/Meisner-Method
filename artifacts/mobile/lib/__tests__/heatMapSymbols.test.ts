import assert from "node:assert/strict";
import test from "node:test";
import supportedInstrumentCatalog from "../heatmap-instruments/catalog.json" with { type: "json" };
import {
  CUSTOM_HEAT_MAP_ASSETS,
  CUSTOM_HEAT_MAP_ASSET_TYPES,
  MAX_CUSTOM_HEAT_MAP_SYMBOLS,
  moveCustomHeatMapSymbol,
  normalizeCustomHeatMapSymbols,
  planCustomHeatMapBatchAdd,
  searchCustomHeatMapAssets,
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

test("custom map batch add skips existing symbols and only adds up to the remaining capacity", () => {
  const existing = [...Array.from({ length: MAX_CUSTOM_HEAT_MAP_SYMBOLS - 2 }, (_, index) => `T${index}`), "GLD"];
  const plan = planCustomHeatMapBatchAdd(existing, [" gld ", "GC=F", "BTC-USD", "SPY"]);

  assert.deepEqual(plan, {
    symbolsToAdd: ["GC=F"],
    alreadyAddedCount: 1,
    overLimitCount: 2,
  });
});

test("custom map batch add removes duplicate requests and handles a full map", () => {
  const existing = Array.from({ length: MAX_CUSTOM_HEAT_MAP_SYMBOLS }, (_, index) => `T${index}`);
  assert.deepEqual(
    planCustomHeatMapBatchAdd(existing, ["AAPL", "AAPL", "T0"]),
    { symbolsToAdd: [], alreadyAddedCount: 1, overLimitCount: 1 },
  );
});

test("custom symbols can move up or down without changing other saved order", () => {
  const symbols = ["AAPL", "MSFT", "GC=F"];
  assert.deepEqual(moveCustomHeatMapSymbol(symbols, "MSFT", "up"), ["MSFT", "AAPL", "GC=F"]);
  assert.deepEqual(moveCustomHeatMapSymbol(symbols, "MSFT", "down"), ["AAPL", "GC=F", "MSFT"]);
  assert.deepEqual(moveCustomHeatMapSymbol(symbols, "AAPL", "up"), symbols);
  assert.deepEqual(moveCustomHeatMapSymbol(symbols, "GC=F", "down"), symbols);
  assert.deepEqual(moveCustomHeatMapSymbol(symbols, "MISSING", "up"), symbols);

  const changed = moveCustomHeatMapSymbol(symbols, "GC=F", "up");
  const afterAdd = normalizeCustomHeatMapSymbols([...changed, "BTC-USD"]);
  const afterRemove = afterAdd.filter((symbol) => symbol !== "AAPL");
  assert.deepEqual(afterAdd, ["AAPL", "GC=F", "MSFT", "BTC-USD"]);
  assert.deepEqual(afterRemove, ["GC=F", "MSFT", "BTC-USD"]);
});

test("custom heat-map asset picker offers every supported non-stock universe", () => {
  assert.deepEqual(CUSTOM_HEAT_MAP_ASSET_TYPES.map(({ id }) => id), [
    "stocks", "etfs", "commodities", "futures", "cryptocurrency",
  ]);
  assert.equal(CUSTOM_HEAT_MAP_ASSETS.etfs.length, 30);
  assert.equal(CUSTOM_HEAT_MAP_ASSETS.commodities.length, 15);
  assert.equal(CUSTOM_HEAT_MAP_ASSETS.futures.length, 12);
  assert.equal(CUSTOM_HEAT_MAP_ASSETS.cryptocurrency.length, 16);
  assert.deepEqual(CUSTOM_HEAT_MAP_ASSETS, supportedInstrumentCatalog);

  for (const [type, assets] of Object.entries(CUSTOM_HEAT_MAP_ASSETS)) {
    assert.equal(new Set(assets.map(({ symbol }) => symbol)).size, assets.length, `${type} symbols are unique`);
    for (const asset of assets) {
      assert.ok(asset.name.length > 0, `${asset.symbol} has a display name`);
      assert.deepEqual(normalizeCustomHeatMapSymbols([asset.symbol]), [asset.symbol]);
    }
  }
});

test("custom instrument search matches names across supported asset types", () => {
  const goldMatches = searchCustomHeatMapAssets("  gOlD ");
  assert.deepEqual(
    goldMatches.map(({ assetType, asset }) => [assetType, asset.name, asset.symbol]),
    [
      ["commodities", "Gold", "GC=F"],
      ["etfs", "Gold ETF", "GLD"],
    ],
  );
  assert.ok(searchCustomHeatMapAssets("S&P 500 ETF").some(({ asset }) => asset.symbol === "SPY"));
  assert.deepEqual(searchCustomHeatMapAssets(""), []);
});