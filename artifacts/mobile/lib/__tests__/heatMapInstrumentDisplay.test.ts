import assert from "node:assert/strict";
import test from "node:test";
import {
  getCommodityContractNotional,
  getCommodityContractSpec,
  getCommodityContractTickValue,
  getHeatMapInstrumentDisplay,
} from "../heatMapInstrumentDisplay.ts";

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

test("every supported commodity has an exchange-sourced quote unit and standard contract size", () => {
  const expectedContracts = [
    ["GC=F", 100, "troy ounces", "U.S. dollars per troy ounce", "USD", "CME Group", 0.1, 10],
    ["SI=F", 5_000, "troy ounces", "U.S. dollars per troy ounce", "USD", "CME Group", 0.005, 25],
    ["CL=F", 1_000, "barrels", "U.S. dollars per barrel", "USD", "CME Group", 0.01, 10],
    ["NG=F", 10_000, "MMBtu", "U.S. dollars per MMBtu", "USD", "CME Group", 0.001, 10],
    ["HG=F", 25_000, "pounds", "U.S. dollars per pound", "USD", "CME Group", 0.0005, 12.5],
    ["ZC=F", 5_000, "bushels", "U.S. cents per bushel", "USC", "CME Group", 0.25, 12.5],
    ["ZW=F", 5_000, "bushels", "U.S. cents per bushel", "USC", "CME Group", 0.25, 12.5],
    ["ZS=F", 5_000, "bushels", "U.S. cents per bushel", "USC", "CME Group", 0.25, 12.5],
    ["KC=F", 37_500, "pounds", "U.S. cents per pound", "USC", "ICE Futures U.S.", 0.05, 18.75],
    ["CT=F", 50_000, "pounds", "U.S. cents per pound", "USC", "ICE Futures U.S.", 0.01, 5],
    ["SB=F", 112_000, "pounds", "U.S. cents per pound", "USC", "ICE Futures U.S.", 0.01, 11.2],
    ["PL=F", 50, "troy ounces", "U.S. dollars per troy ounce", "USD", "CME Group", 0.1, 5],
    ["PA=F", 100, "troy ounces", "U.S. dollars per troy ounce", "USD", "CME Group", 0.5, 50],
    ["LE=F", 40_000, "pounds", "U.S. cents per pound", "USC", "CME Group", 0.025, 10],
    ["HE=F", 40_000, "pounds", "U.S. cents per pound", "USC", "CME Group", 0.025, 10],
  ] as const;
  const supportedCommoditySymbols = SUPPORTED_INSTRUMENTS
    .filter(([, assetType]) => assetType === "commodity")
    .map(([symbol]) => symbol);

  assert.deepEqual(expectedContracts.map(([symbol]) => symbol), supportedCommoditySymbols);
  for (const [symbol, multiplier, unit, quoteUnit, quoteCurrency, exchange, minimumPriceIncrement, tickValue] of expectedContracts) {
    const spec = getCommodityContractSpec(symbol);
    assert.ok(spec, `${symbol} must have contract specifications`);
    assert.equal(spec.contractMultiplier, multiplier, `${symbol} contract multiplier`);
    assert.equal(spec.contractUnit, unit, `${symbol} contract unit`);
    assert.equal(spec.quoteUnit, quoteUnit, `${symbol} quote unit`);
    assert.equal(spec.quoteCurrency, quoteCurrency, `${symbol} quote currency`);
    assert.equal(spec.exchange, exchange, `${symbol} listing exchange`);
    assert.equal(spec.minimumPriceIncrement, minimumPriceIncrement, `${symbol} minimum exchange price increment`);
    assert.equal(getCommodityContractTickValue(symbol), tickValue, `${symbol} USD value per standard-contract tick`);
    assert.equal(spec.quoteToUsdFactor, quoteCurrency === "USC" ? 0.01 : 1);
    assert.match(spec.sourceUrl, /^https:\/\/www\.(cmegroup|ice)\.com\//);
  }
});

test("full-contract notional converts cent quotes to dollars and keeps dollar quotes unchanged", () => {
  assert.equal(getCommodityContractNotional("ZC=F", 464.5), 23_225);
  assert.equal(getCommodityContractNotional("GC=F", 4_200), 420_000);
  assert.equal(getCommodityContractNotional("UNKNOWN=F", 100), null);
  assert.equal(getCommodityContractNotional("ZC=F", Number.NaN), null);
  assert.equal(getCommodityContractNotional("ZC=F", 0), null);
});

test("tick-value calculation rejects unsupported commodity symbols", () => {
  assert.equal(getCommodityContractTickValue("UNKNOWN=F"), null);
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
