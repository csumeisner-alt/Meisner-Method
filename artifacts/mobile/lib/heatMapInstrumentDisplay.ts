import type { HeatMapQuote } from "@workspace/api-client-react";

export type HeatMapInstrumentIconKind =
  | "goldBar"
  | "silverBar"
  | "copperBar"
  | "crudeOil"
  | "naturalGas"
  | "corn"
  | "wheat"
  | "soybeans"
  | "coffee"
  | "cotton"
  | "sugar"
  | "platinumBar"
  | "palladiumBar"
  | "cattle"
  | "hogs"
  | "equityIndex"
  | "treasury"
  | "euro"
  | "yen"
  | "pound"
  | "canadianDollar"
  | "dollarIndex"
  | "genericCommodity";

export interface HeatMapInstrumentDisplay {
  name: string;
  icon: HeatMapInstrumentIconKind;
}

export type CommodityQuoteCurrency = "USD" | "USC";

export interface CommodityContractSpec {
  exchange: "CME Group" | "ICE Futures U.S.";
  quoteUnit: string;
  quoteCurrency: CommodityQuoteCurrency;
  contractMultiplier: number;
  contractUnit: string;
  quoteToUsdFactor: number;
  sourceUrl: string;
}

// Exchange contract specifications; quote units match the raw Yahoo Finance futures quotes.
const COMMODITY_CONTRACT_SPECS: Record<string, CommodityContractSpec> = {
  "GC=F": {
    exchange: "CME Group",
    quoteUnit: "U.S. dollars per troy ounce",
    quoteCurrency: "USD",
    contractMultiplier: 100,
    contractUnit: "troy ounces",
    quoteToUsdFactor: 1,
    sourceUrl: "https://www.cmegroup.com/markets/metals/precious/gold.contractSpecs.html",
  },
  "SI=F": {
    exchange: "CME Group",
    quoteUnit: "U.S. dollars per troy ounce",
    quoteCurrency: "USD",
    contractMultiplier: 5_000,
    contractUnit: "troy ounces",
    quoteToUsdFactor: 1,
    sourceUrl: "https://www.cmegroup.com/markets/metals/precious/silver.contractSpecs.html",
  },
  "CL=F": {
    exchange: "CME Group",
    quoteUnit: "U.S. dollars per barrel",
    quoteCurrency: "USD",
    contractMultiplier: 1_000,
    contractUnit: "barrels",
    quoteToUsdFactor: 1,
    sourceUrl: "https://www.cmegroup.com/markets/energy/crude-oil/light-sweet-crude.contractSpecs.html",
  },
  "NG=F": {
    exchange: "CME Group",
    quoteUnit: "U.S. dollars per MMBtu",
    quoteCurrency: "USD",
    contractMultiplier: 10_000,
    contractUnit: "MMBtu",
    quoteToUsdFactor: 1,
    sourceUrl: "https://www.cmegroup.com/markets/energy/natural-gas/natural-gas.html",
  },
  "HG=F": {
    exchange: "CME Group",
    quoteUnit: "U.S. dollars per pound",
    quoteCurrency: "USD",
    contractMultiplier: 25_000,
    contractUnit: "pounds",
    quoteToUsdFactor: 1,
    sourceUrl: "https://www.cmegroup.com/markets/metals/base/copper.contractSpecs.html",
  },
  "ZC=F": {
    exchange: "CME Group",
    quoteUnit: "U.S. cents per bushel",
    quoteCurrency: "USC",
    contractMultiplier: 5_000,
    contractUnit: "bushels",
    quoteToUsdFactor: 0.01,
    sourceUrl: "https://www.cmegroup.com/markets/agriculture/grains/corn.contractSpecs.html",
  },
  "ZW=F": {
    exchange: "CME Group",
    quoteUnit: "U.S. cents per bushel",
    quoteCurrency: "USC",
    contractMultiplier: 5_000,
    contractUnit: "bushels",
    quoteToUsdFactor: 0.01,
    sourceUrl: "https://www.cmegroup.com/markets/agriculture/grains/wheat.contractSpecs.html",
  },
  "ZS=F": {
    exchange: "CME Group",
    quoteUnit: "U.S. cents per bushel",
    quoteCurrency: "USC",
    contractMultiplier: 5_000,
    contractUnit: "bushels",
    quoteToUsdFactor: 0.01,
    sourceUrl: "https://www.cmegroup.com/markets/agriculture/oilseeds/soybean/specs",
  },
  "KC=F": {
    exchange: "ICE Futures U.S.",
    quoteUnit: "U.S. cents per pound",
    quoteCurrency: "USC",
    contractMultiplier: 37_500,
    contractUnit: "pounds",
    quoteToUsdFactor: 0.01,
    sourceUrl: "https://www.ice.com/products/15/Coffee-C-Futures",
  },
  "CT=F": {
    exchange: "ICE Futures U.S.",
    quoteUnit: "U.S. cents per pound",
    quoteCurrency: "USC",
    contractMultiplier: 50_000,
    contractUnit: "pounds",
    quoteToUsdFactor: 0.01,
    sourceUrl: "https://www.ice.com/products/254/cotton-no-2-futures",
  },
  "SB=F": {
    exchange: "ICE Futures U.S.",
    quoteUnit: "U.S. cents per pound",
    quoteCurrency: "USC",
    contractMultiplier: 112_000,
    contractUnit: "pounds",
    quoteToUsdFactor: 0.01,
    sourceUrl: "https://www.ice.com/products/23/sugar-no-11-futures",
  },
  "PL=F": {
    exchange: "CME Group",
    quoteUnit: "U.S. dollars per troy ounce",
    quoteCurrency: "USD",
    contractMultiplier: 50,
    contractUnit: "troy ounces",
    quoteToUsdFactor: 1,
    sourceUrl: "https://www.cmegroup.com/markets/metals/precious/platinum.contractSpecs.html",
  },
  "PA=F": {
    exchange: "CME Group",
    quoteUnit: "U.S. dollars per troy ounce",
    quoteCurrency: "USD",
    contractMultiplier: 100,
    contractUnit: "troy ounces",
    quoteToUsdFactor: 1,
    sourceUrl: "https://www.cmegroup.com/markets/metals/precious/palladium.contractSpecs.html",
  },
  "LE=F": {
    exchange: "CME Group",
    quoteUnit: "U.S. cents per pound",
    quoteCurrency: "USC",
    contractMultiplier: 40_000,
    contractUnit: "pounds",
    quoteToUsdFactor: 0.01,
    sourceUrl: "https://www.cmegroup.com/markets/agriculture/livestock/live-cattle.contractSpecs.html",
  },
  "HE=F": {
    exchange: "CME Group",
    quoteUnit: "U.S. cents per pound",
    quoteCurrency: "USC",
    contractMultiplier: 40_000,
    contractUnit: "pounds",
    quoteToUsdFactor: 0.01,
    sourceUrl: "https://www.cmegroup.com/markets/agriculture/livestock/lean-hogs.contractSpecs.html",
  },
};

const INSTRUMENT_DISPLAY_BY_SYMBOL: Record<string, HeatMapInstrumentDisplay> = {
  "GC=F": { name: "Gold", icon: "goldBar" },
  "SI=F": { name: "Silver", icon: "silverBar" },
  "CL=F": { name: "Crude Oil", icon: "crudeOil" },
  "NG=F": { name: "Natural Gas", icon: "naturalGas" },
  "HG=F": { name: "Copper", icon: "copperBar" },
  "ZC=F": { name: "Corn", icon: "corn" },
  "ZW=F": { name: "Wheat", icon: "wheat" },
  "ZS=F": { name: "Soybeans", icon: "soybeans" },
  "KC=F": { name: "Coffee", icon: "coffee" },
  "CT=F": { name: "Cotton", icon: "cotton" },
  "SB=F": { name: "Sugar", icon: "sugar" },
  "PL=F": { name: "Platinum", icon: "platinumBar" },
  "PA=F": { name: "Palladium", icon: "palladiumBar" },
  "LE=F": { name: "Live Cattle", icon: "cattle" },
  "HE=F": { name: "Lean Hogs", icon: "hogs" },
  "ES=F": { name: "S&P 500", icon: "equityIndex" },
  "NQ=F": { name: "Nasdaq 100", icon: "equityIndex" },
  "YM=F": { name: "Dow Jones", icon: "equityIndex" },
  "RTY=F": { name: "Russell 2000", icon: "equityIndex" },
  "ZN=F": { name: "10Y Treasury", icon: "treasury" },
  "ZB=F": { name: "30Y Treasury Bond", icon: "treasury" },
  "ZF=F": { name: "5Y Treasury Note", icon: "treasury" },
  "6E=F": { name: "Euro", icon: "euro" },
  "6J=F": { name: "Japanese Yen", icon: "yen" },
  "6B=F": { name: "British Pound", icon: "pound" },
  "6C=F": { name: "Canadian Dollar", icon: "canadianDollar" },
  "DX=F": { name: "U.S. Dollar Index", icon: "dollarIndex" },
};

export function getHeatMapInstrumentDisplay(
  quote: Pick<HeatMapQuote, "symbol" | "name" | "assetType">,
): HeatMapInstrumentDisplay | null {
  if (quote.assetType !== "commodity" && quote.assetType !== "future") return null;

  const knownInstrument = INSTRUMENT_DISPLAY_BY_SYMBOL[quote.symbol];
  if (knownInstrument) return knownInstrument;

  const providerName = quote.name.trim();
  return {
    name: providerName && providerName !== quote.symbol
      ? providerName
      : quote.symbol.replace(/=F$/i, ""),
    icon: quote.assetType === "commodity" ? "genericCommodity" : "equityIndex",
  };
}

export function getCommodityContractSpec(symbol: string): CommodityContractSpec | null {
  return COMMODITY_CONTRACT_SPECS[symbol.trim().toUpperCase()] ?? null;
}

export function getCommodityContractNotional(symbol: string, quotePrice: number): number | null {
  const spec = getCommodityContractSpec(symbol);
  if (!spec || !Number.isFinite(quotePrice) || quotePrice <= 0) return null;
  return quotePrice * spec.contractMultiplier * spec.quoteToUsdFactor;
}
