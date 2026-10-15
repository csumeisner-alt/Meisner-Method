export const MAX_CUSTOM_HEAT_MAP_SYMBOLS = 40;

const SYMBOL_PATTERN = /^[A-Z0-9.^=-]{1,15}$/;

export const CUSTOM_HEAT_MAP_ASSET_TYPES = [
  { id: "stocks", label: "Stocks" },
  { id: "etfs", label: "ETFs" },
  { id: "commodities", label: "Commodities" },
  { id: "futures", label: "Futures" },
  { id: "cryptocurrency", label: "Crypto" },
] as const;

export type CustomHeatMapAssetType = (typeof CUSTOM_HEAT_MAP_ASSET_TYPES)[number]["id"];

export interface CustomHeatMapAsset {
  symbol: string;
  name: string;
}

// Keep these curated choices aligned with the quote-source universes in fetch_heatmap.py.
export const CUSTOM_HEAT_MAP_ASSETS: Record<Exclude<CustomHeatMapAssetType, "stocks">, CustomHeatMapAsset[]> = {
  etfs: [
    { symbol: "SPY", name: "S&P 500 ETF" }, { symbol: "QQQ", name: "Nasdaq 100 ETF" },
    { symbol: "IWM", name: "Russell 2000 ETF" }, { symbol: "DIA", name: "Dow Jones ETF" },
    { symbol: "VTI", name: "Total Stock Market ETF" }, { symbol: "VOO", name: "S&P 500 ETF" },
    { symbol: "XLK", name: "Technology Select Sector ETF" }, { symbol: "XLF", name: "Financial Select Sector ETF" },
    { symbol: "XLE", name: "Energy Select Sector ETF" }, { symbol: "XLV", name: "Health Care Select Sector ETF" },
    { symbol: "XLI", name: "Industrial Select Sector ETF" }, { symbol: "XLY", name: "Consumer Discretionary ETF" },
    { symbol: "XLP", name: "Consumer Staples ETF" }, { symbol: "XLU", name: "Utilities Select Sector ETF" },
    { symbol: "XLRE", name: "Real Estate Select Sector ETF" }, { symbol: "XLC", name: "Communication Services ETF" },
    { symbol: "SMH", name: "Semiconductor ETF" }, { symbol: "SOXX", name: "Semiconductor ETF" },
    { symbol: "GLD", name: "Gold ETF" }, { symbol: "SLV", name: "Silver ETF" },
    { symbol: "TLT", name: "20+ Year Treasury ETF" }, { symbol: "IEF", name: "7-10 Year Treasury ETF" },
    { symbol: "HYG", name: "High Yield Corporate Bond ETF" }, { symbol: "LQD", name: "Investment Grade Bond ETF" },
    { symbol: "ARKK", name: "ARK Innovation ETF" }, { symbol: "XBI", name: "Biotechnology ETF" },
    { symbol: "EEM", name: "Emerging Markets ETF" }, { symbol: "EFA", name: "Developed Markets ETF" },
    { symbol: "SCHD", name: "Dividend Equity ETF" }, { symbol: "BND", name: "Total Bond Market ETF" },
  ],
  commodities: [
    { symbol: "GC=F", name: "Gold" }, { symbol: "SI=F", name: "Silver" },
    { symbol: "CL=F", name: "Crude Oil" }, { symbol: "NG=F", name: "Natural Gas" },
    { symbol: "HG=F", name: "Copper" }, { symbol: "ZC=F", name: "Corn" },
    { symbol: "ZW=F", name: "Wheat" }, { symbol: "ZS=F", name: "Soybeans" },
    { symbol: "KC=F", name: "Coffee" }, { symbol: "CT=F", name: "Cotton" },
    { symbol: "SB=F", name: "Sugar" }, { symbol: "PL=F", name: "Platinum" },
    { symbol: "PA=F", name: "Palladium" }, { symbol: "LE=F", name: "Live Cattle" },
    { symbol: "HE=F", name: "Lean Hogs" },
  ],
  futures: [
    { symbol: "ES=F", name: "S&P 500" }, { symbol: "NQ=F", name: "Nasdaq 100" },
    { symbol: "YM=F", name: "Dow Jones" }, { symbol: "RTY=F", name: "Russell 2000" },
    { symbol: "ZN=F", name: "10-Year Treasury" }, { symbol: "ZB=F", name: "30-Year Treasury" },
    { symbol: "ZF=F", name: "5-Year Treasury" }, { symbol: "6E=F", name: "Euro FX" },
    { symbol: "6J=F", name: "Japanese Yen" }, { symbol: "6B=F", name: "British Pound" },
    { symbol: "6C=F", name: "Canadian Dollar" }, { symbol: "DX=F", name: "U.S. Dollar Index" },
  ],
  cryptocurrency: [
    { symbol: "BTC-USD", name: "Bitcoin" }, { symbol: "ETH-USD", name: "Ethereum" },
    { symbol: "SOL-USD", name: "Solana" }, { symbol: "XRP-USD", name: "XRP" },
    { symbol: "BNB-USD", name: "BNB" }, { symbol: "DOGE-USD", name: "Dogecoin" },
    { symbol: "ADA-USD", name: "Cardano" }, { symbol: "TRX-USD", name: "TRON" },
    { symbol: "AVAX-USD", name: "Avalanche" }, { symbol: "LINK-USD", name: "Chainlink" },
    { symbol: "LTC-USD", name: "Litecoin" }, { symbol: "BCH-USD", name: "Bitcoin Cash" },
    { symbol: "SUI-USD", name: "Sui" }, { symbol: "DOT-USD", name: "Polkadot" },
    { symbol: "SHIB-USD", name: "Shiba Inu" }, { symbol: "TON-USD", name: "Toncoin" },
  ],
};

export function normalizeCustomHeatMapSymbols(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const symbols = new Set<string>();

  for (const item of value) {
    if (typeof item !== "string") continue;
    const symbol = item.trim().toUpperCase();
    if (SYMBOL_PATTERN.test(symbol)) symbols.add(symbol);
    if (symbols.size >= MAX_CUSTOM_HEAT_MAP_SYMBOLS) break;
  }

  return [...symbols];
}