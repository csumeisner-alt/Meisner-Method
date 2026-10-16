export interface YahooStockSuggestion {
  symbol: string;
  name: string;
  exchange: string;
}

export type HeatMapInstrumentCategory = "etf" | "commodity" | "future" | "cryptocurrency";

export interface HeatMapInstrumentSuggestion {
  symbol: string;
  name: string;
  exchange: string;
  category: HeatMapInstrumentCategory;
}

const COMMODITY_FUTURE_ROOTS = new Set([
  "BZ", "CC", "CL", "CT", "GC", "GF", "HE", "HG", "HO", "KC", "LE", "LBS",
  "MCL", "MGC", "NG", "OJ", "PA", "PL", "RB", "SB", "SI", "ZC", "ZL",
  "ZM", "ZO", "ZR", "ZS", "ZW",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function searchName(quote: Record<string, unknown>): string {
  return typeof quote["longname"] === "string"
    ? quote["longname"].trim()
    : typeof quote["shortname"] === "string"
      ? quote["shortname"].trim()
      : "";
}

function searchExchange(quote: Record<string, unknown>): string {
  const exchange = typeof quote["exchDisp"] === "string"
    ? quote["exchDisp"].trim()
    : typeof quote["exchange"] === "string"
      ? quote["exchange"].trim()
      : "";
  return exchange || "Exchange unavailable";
}

export function parseYahooHeatMapInstrumentSearchResponse(
  payload: unknown,
): HeatMapInstrumentSuggestion[] {
  if (!isRecord(payload) || !Array.isArray(payload["quotes"])) return [];

  const seen = new Set<string>();
  const suggestions: HeatMapInstrumentSuggestion[] = [];
  for (const quote of payload["quotes"]) {
    if (!isRecord(quote)) continue;
    const rawSymbol = typeof quote["symbol"] === "string" ? quote["symbol"].trim() : "";
    const name = searchName(quote);
    if (!rawSymbol || !name) continue;

    const quoteType = typeof quote["quoteType"] === "string"
      ? quote["quoteType"].toUpperCase()
      : "";
    let category: HeatMapInstrumentCategory | null = null;
    if (quoteType === "ETF") category = "etf";
    else if (quoteType === "CRYPTOCURRENCY" && rawSymbol.toUpperCase().endsWith("-USD")) {
      category = "cryptocurrency";
    } else if (quoteType === "FUTURE" && rawSymbol.toUpperCase().endsWith("=F")) {
      const root = rawSymbol.toUpperCase().slice(0, -2);
      category = COMMODITY_FUTURE_ROOTS.has(root) ? "commodity" : "future";
    }
    if (!category) continue;

    const symbol = rawSymbol.toUpperCase();
    if (seen.has(symbol)) continue;
    seen.add(symbol);
    suggestions.push({ symbol, name, exchange: searchExchange(quote), category });
    if (suggestions.length === 8) break;
  }

  return suggestions;
}

export function parseYahooStockSearchResponse(payload: unknown): YahooStockSuggestion[] {
  if (!isRecord(payload) || !Array.isArray(payload["quotes"])) return [];

  const seen = new Set<string>();
  const suggestions: YahooStockSuggestion[] = [];

  for (const quote of payload["quotes"]) {
    if (!isRecord(quote) || quote["quoteType"] !== "EQUITY") continue;

    const rawSymbol = typeof quote["symbol"] === "string" ? quote["symbol"].trim() : "";
    const name = typeof quote["longname"] === "string"
      ? quote["longname"].trim()
      : typeof quote["shortname"] === "string"
        ? quote["shortname"].trim()
        : "";
    if (!rawSymbol || !name) continue;

    const symbol = rawSymbol.toUpperCase();
    if (seen.has(symbol)) continue;
    seen.add(symbol);

    const rawExchange = typeof quote["exchDisp"] === "string"
      ? quote["exchDisp"].trim()
      : typeof quote["exchange"] === "string"
        ? quote["exchange"].trim()
        : "";

    suggestions.push({
      symbol,
      name,
      exchange: rawExchange || "Exchange unavailable",
    });
    if (suggestions.length === 8) break;
  }

  return suggestions;
}

export async function searchYahooStocks(query: string): Promise<YahooStockSuggestion[]> {
  const url = new URL("https://query1.finance.yahoo.com/v1/finance/search");
  url.searchParams.set("q", query.trim());
  url.searchParams.set("quotesCount", "16");
  url.searchParams.set("newsCount", "0");
  url.searchParams.set("listsCount", "0");

  const response = await fetch(url, {
    headers: {
      Accept: "application/json",
      "User-Agent": "Mozilla/5.0",
    },
    signal: AbortSignal.timeout(8_000),
  });
  if (!response.ok) {
    throw new Error(`Yahoo symbol search returned HTTP ${response.status}`);
  }

  return parseYahooStockSearchResponse(await response.json());
}

export async function searchYahooHeatMapInstruments(
  query: string,
  requestedCategory: HeatMapInstrumentCategory,
): Promise<HeatMapInstrumentSuggestion[]> {
  const url = new URL("https://query1.finance.yahoo.com/v1/finance/search");
  url.searchParams.set("q", query.trim());
  url.searchParams.set("quotesCount", "40");
  url.searchParams.set("newsCount", "0");
  url.searchParams.set("listsCount", "0");

  const response = await fetch(url, {
    headers: {
      Accept: "application/json",
      "User-Agent": "Mozilla/5.0",
    },
    signal: AbortSignal.timeout(8_000),
  });
  if (!response.ok) {
    throw new Error(`Yahoo instrument search returned HTTP ${response.status}`);
  }

  return parseYahooHeatMapInstrumentSearchResponse(await response.json())
    .filter((suggestion) => suggestion.category === requestedCategory);
}