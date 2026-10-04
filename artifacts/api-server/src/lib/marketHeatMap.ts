export const HEAT_MAP_CATEGORIES = [
  "stocks",
  "etfs",
  "commodities",
  "futures",
  "cryptocurrency",
  "custom",
] as const;

export type HeatMapCategory = (typeof HEAT_MAP_CATEGORIES)[number];

export interface HeatMapQuote {
  symbol: string;
  name: string;
  price: number;
  priceChangePercent: number;
  priceTimestamp: number | null;
  marketSession: "pre_market" | "regular" | "after_hours" | "closed" | "unknown";
  assetType: "stock" | "etf" | "commodity" | "future" | "cryptocurrency";
  sector: string | null;
}

export interface HeatMapResponse {
  category: HeatMapCategory;
  quotes: HeatMapQuote[];
  unavailableSymbols: string[];
  updatedAt: number;
}

const SYMBOL_PATTERN = /^[A-Z0-9.^=-]{1,15}$/;
const ASSET_TYPES = new Set(["stock", "etf", "commodity", "future", "cryptocurrency"]);
const MARKET_SESSIONS = new Set(["pre_market", "regular", "after_hours", "closed", "unknown"]);
const FUTURE_QUOTE_MAX_AGE_SECONDS = 24 * 60 * 60;
const MAX_FUTURE_TIMESTAMP_SKEW_SECONDS = 60 * 60;

export function isHeatMapCategory(value: unknown): value is HeatMapCategory {
  return typeof value === "string" && HEAT_MAP_CATEGORIES.includes(value as HeatMapCategory);
}

export function normalizeHeatMapSymbols(value: unknown): {
  symbols: string[];
  invalid: boolean;
} {
  if (value === undefined || value === null || value === "") {
    return { symbols: [], invalid: false };
  }

  const values = Array.isArray(value) ? value : [value];
  if (values.some((item) => typeof item !== "string")) {
    return { symbols: [], invalid: true };
  }

  const rawSymbols = values.flatMap((item) => (item as string).split(","));
  const symbols: string[] = [];
  const seen = new Set<string>();

  for (const raw of rawSymbols) {
    const symbol = raw.trim().toUpperCase();
    if (!SYMBOL_PATTERN.test(symbol)) {
      return { symbols: [], invalid: true };
    }
    if (!seen.has(symbol)) {
      seen.add(symbol);
      symbols.push(symbol);
    }
  }

  if (symbols.length > 40) {
    return { symbols: [], invalid: true };
  }

  return { symbols, invalid: false };
}

export function heatMapCacheKey(category: HeatMapCategory, symbols: string[]): string {
  return `${category}:${symbols.join(",")}`;
}

export function isHeatMapQuote(value: unknown): value is HeatMapQuote {
  if (!value || typeof value !== "object") return false;
  const quote = value as Record<string, unknown>;
  return (
    typeof quote["symbol"] === "string" &&
    typeof quote["name"] === "string" &&
    typeof quote["price"] === "number" &&
    Number.isFinite(quote["price"]) &&
    quote["price"] > 0 &&
    typeof quote["priceChangePercent"] === "number" &&
    Number.isFinite(quote["priceChangePercent"]) &&
    (quote["priceTimestamp"] === null ||
      (typeof quote["priceTimestamp"] === "number" && Number.isFinite(quote["priceTimestamp"]))) &&
    typeof quote["marketSession"] === "string" &&
    MARKET_SESSIONS.has(quote["marketSession"]) &&
    typeof quote["assetType"] === "string" &&
    ASSET_TYPES.has(quote["assetType"]) &&
    (quote["sector"] === null || typeof quote["sector"] === "string")
  );
}

export function isHeatMapResponse(value: unknown, category: HeatMapCategory): value is HeatMapResponse {
  if (!value || typeof value !== "object") return false;
  const response = value as Record<string, unknown>;
  if (!(
    response["category"] === category &&
    Array.isArray(response["quotes"]) &&
    response["quotes"].every(isHeatMapQuote) &&
    Array.isArray(response["unavailableSymbols"]) &&
    response["unavailableSymbols"].every((symbol) => typeof symbol === "string") &&
    typeof response["updatedAt"] === "number" &&
    Number.isFinite(response["updatedAt"])
  )) {
    return false;
  }

  const updatedAt = response["updatedAt"];
  return (response["quotes"] as HeatMapQuote[]).every((quote) => {
    if (quote.assetType !== "future" && !quote.symbol.endsWith("=F")) return true;
    const timestamp = quote.priceTimestamp;
    return (
      timestamp !== null &&
      timestamp <= updatedAt + MAX_FUTURE_TIMESTAMP_SKEW_SECONDS &&
      updatedAt - timestamp <= FUTURE_QUOTE_MAX_AGE_SECONDS
    );
  });
}