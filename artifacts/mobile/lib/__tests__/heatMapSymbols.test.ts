import assert from "node:assert/strict";
import test from "node:test";
import supportedInstrumentCatalog from "../heatmap-instruments/catalog.json" with { type: "json" };
import {
  CUSTOM_HEAT_MAP_ASSETS,
  CUSTOM_HEAT_MAP_ASSET_TYPES,
  isCuratedCustomHeatMapSymbol,
  isSupportedCustomMapCommoditySymbol,
  MAX_CUSTOM_HEAT_MAP_SYMBOLS,
  appendCustomHeatMapSymbolInSavedOrder,
  getCustomHeatMapValidationFailureReason,
  moveCustomHeatMapSymbol,
  swapCustomHeatMapSymbolWithIndex,
  normalizeCustomHeatMapSymbols,
  planCustomHeatMapBatchAdd,
  removeCustomHeatMapSymbolFromSavedOrder,
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

test("custom heat-map validation errors map only known codes to safe guidance", () => {
  assert.equal(
    getCustomHeatMapValidationFailureReason({ data: { error: "INVALID_SYMBOL", message: "raw internal text" } }),
    "Enter a valid ticker symbol.",
  );
  assert.equal(
    getCustomHeatMapValidationFailureReason({ data: { error: "QUOTE_UNAVAILABLE" } }),
    "This ticker isn't supported or has no current or recent quote.",
  );
  assert.equal(
    getCustomHeatMapValidationFailureReason({ data: { error: "MARKET_DATA_TEMPORARILY_UNAVAILABLE" } }),
    "Market data is temporarily unavailable. Try again.",
  );
  assert.equal(
    getCustomHeatMapValidationFailureReason({ data: { error: "UNKNOWN", message: "raw internal text" } }),
    "Couldn't verify this instrument. Try again.",
  );
  assert.equal(
    getCustomHeatMapValidationFailureReason(new Error("network failure")),
    "Couldn't verify this instrument. Try again.",
  );
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

test("dragging a custom symbol swaps only with the selected position", () => {
  const symbols = ["AAPL", "MSFT", "GC=F", "BTC-USD"];
  assert.deepEqual(swapCustomHeatMapSymbolWithIndex(symbols, "AAPL", 2), ["GC=F", "MSFT", "AAPL", "BTC-USD"]);
  assert.deepEqual(swapCustomHeatMapSymbolWithIndex(symbols, "BTC-USD", 0), ["BTC-USD", "MSFT", "GC=F", "AAPL"]);
  assert.equal(swapCustomHeatMapSymbolWithIndex(symbols, "GC=F", 2), symbols);
  assert.equal(swapCustomHeatMapSymbolWithIndex(symbols, "MISSING", 1), symbols);
  assert.equal(swapCustomHeatMapSymbolWithIndex(symbols, "MSFT", Number.NaN), symbols);
});

test("adding and removing during a temporary sort preserve the saved custom order", () => {
  const savedOrder = ["MSFT", "AAPL", "MISSING"];
  const displayedReturnOrder = ["AAPL", "MSFT"];

  const afterAdd = appendCustomHeatMapSymbolInSavedOrder(savedOrder, "NVDA");
  assert.deepEqual(afterAdd, ["MSFT", "AAPL", "MISSING", "NVDA"]);
  assert.deepEqual(displayedReturnOrder, ["AAPL", "MSFT"], "Temporary display sorting must not mutate saved symbols.");

  const { symbols: afterRemove, removedIndex } = removeCustomHeatMapSymbolFromSavedOrder(afterAdd, "AAPL");
  assert.equal(removedIndex, 1, "Removal position must come from saved order, not the temporary display order.");
  assert.deepEqual(afterRemove, ["MSFT", "MISSING", "NVDA"]);
  assert.deepEqual(
    removeCustomHeatMapSymbolFromSavedOrder(afterRemove, "NOT-SAVED"),
    { symbols: afterRemove, removedIndex: -1 },
  );
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

test("curated commodity catalog symbols remain addable while quotes are unavailable", () => {
  for (const symbol of ["ZC=F", "ZW=F", "ZS=F", "KC=F", "CT=F", "SB=F", "LE=F", "HE=F"]) {
    assert.equal(isSupportedCustomMapCommoditySymbol(symbol), true, `${symbol} remains addable`);
  }
  assert.equal(isSupportedCustomMapCommoditySymbol(" unknown=F "), false);
  assert.equal(isSupportedCustomMapCommoditySymbol("SPY"), false);
});

test("curated catalog symbols can be added without quote validation", () => {
  for (const symbol of ["SPY", "GLD", "GC=F", "BTC-USD", "ES=F"]) {
    assert.equal(isCuratedCustomHeatMapSymbol(` ${symbol.toLowerCase()} `), true);
  }
  assert.equal(isCuratedCustomHeatMapSymbol("UNKNOWN"), false);
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