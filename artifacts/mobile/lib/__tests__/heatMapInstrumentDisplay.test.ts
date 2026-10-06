import assert from "node:assert/strict";
import test from "node:test";
import { getHeatMapInstrumentDisplay } from "../heatMapInstrumentDisplay.ts";

const SUPPORTED_INSTRUMENTS = [
  ["GC=F", "commodity", "Gold", "goldBar"],
  ["SI=F", "commodity", "Silver", "silverBar"],
  ["CL=F", "commodity", "Crude Oil", "crudeOil"],
  ["NG=F", "commodity", "Natural Gas", "naturalGas"],
  ["HG=F", "commodity", "Copper", "copperBar"],
  ["ZC=F", "commodity", "Corn", "corn"],
  ["ZW=F", "commodity", "Wheat", "wheat"],
  ["ZS=F", "commodity", "Soybeans", "soybeans"],
  ["KC=F", "commodity", "Coffee", "coffee"],
  ["CT=F", "commodity", "Cotton", "cotton"],
  ["SB=F", "commodity", "Sugar", "sugar"],
  ["PL=F", "commodity", "Platinum", "platinumBar"],
  ["PA=F", "commodity", "Palladium", "palladiumBar"],
  ["LE=F", "commodity", "Live Cattle", "cattle"],
  ["HE=F", "commodity", "Lean Hogs", "hogs"],
  ["ES=F", "future", "S&P 500", "equityIndex"],
  ["NQ=F", "future", "Nasdaq 100", "equityIndex"],
  ["YM=F", "future", "Dow Jones", "equityIndex"],
  ["RTY=F", "future", "Russell 2000", "equityIndex"],
  ["ZN=F", "future", "10Y Treasury", "treasury"],
  ["ZB=F", "future", "30Y Treasury Bond", "treasury"],
  ["ZF=F", "future", "5Y Treasury Note", "treasury"],
  ["6E=F", "future", "Euro", "euro"],
  ["6J=F", "future", "Japanese Yen", "yen"],
  ["6B=F", "future", "British Pound", "pound"],
  ["6C=F", "future", "Canadian Dollar", "canadianDollar"],
  ["DX=F", "future", "U.S. Dollar Index", "dollarIndex"],
] as const;

test("all supported commodity and futures symbols have plain-language names and matching icons", () => {
  for (const [symbol, assetType, name, icon] of SUPPORTED_INSTRUMENTS) {
    assert.deepEqual(
      getHeatMapInstrumentDisplay({ symbol, name: symbol, assetType }),
      { name, icon },
      `${symbol} should have a clear tile label and illustration`,
    );
  }
});

test("stock and ETF tiles continue to show their original symbols", () => {
  assert.equal(
    getHeatMapInstrumentDisplay({ symbol: "AAPL", name: "Apple Inc.", assetType: "stock" }),
    null,
  );
  assert.equal(
    getHeatMapInstrumentDisplay({ symbol: "GLD", name: "SPDR Gold Shares", assetType: "etf" }),
    null,
  );
});

test("an unfamiliar instrument uses its provider name and a safe generic icon", () => {
  assert.deepEqual(
    getHeatMapInstrumentDisplay({
      symbol: "NEW=F",
      name: "New Commodity",
      assetType: "commodity",
    }),
    { name: "New Commodity", icon: "genericCommodity" },
  );
});
