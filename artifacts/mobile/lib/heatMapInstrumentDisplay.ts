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
