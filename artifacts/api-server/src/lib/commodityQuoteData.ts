const COMMODITY_US_CENT_QUOTES = new Set([
  "ZC=F", "ZW=F", "ZS=F", "KC=F", "CT=F", "SB=F", "LE=F", "HE=F",
]);

export function normalizeYahooQuoteCurrency(symbol: string, providerCurrency: unknown): string {
  const upper = symbol.trim().toUpperCase();
  if (COMMODITY_US_CENT_QUOTES.has(upper)) return "USC";
  return typeof providerCurrency === "string" && providerCurrency.trim()
    ? providerCurrency
    : "USD";
}

export function validateCommodityQuoteSnapshot(
  raw: Record<string, unknown>,
  symbol: string,
): { currentPrice: number; priceChange: number; priceChangePercent: number } {
  const currentPrice = raw["currentPrice"];
  const priceChange = raw["priceChange"];
  const priceChangePercent = raw["priceChangePercent"];
  const previousClose = typeof currentPrice === "number" && typeof priceChange === "number"
    ? currentPrice - priceChange
    : NaN;
  const calculatedPercent = typeof priceChange === "number" && previousClose > 0
    ? (priceChange / previousClose) * 100
    : NaN;
  if (typeof currentPrice !== "number" || !Number.isFinite(currentPrice) || currentPrice <= 0
    || typeof priceChange !== "number" || !Number.isFinite(priceChange)
    || typeof priceChangePercent !== "number" || !Number.isFinite(priceChangePercent)
    || !Number.isFinite(calculatedPercent)
    || Math.abs(calculatedPercent - priceChangePercent) > 0.01) {
    throw new Error(`Current quote or change data is unavailable or inconsistent for ${symbol}`);
  }
  return { currentPrice, priceChange, priceChangePercent: calculatedPercent };
}
