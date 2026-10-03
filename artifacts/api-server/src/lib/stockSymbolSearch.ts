export interface YahooStockSuggestion {
  symbol: string;
  name: string;
  exchange: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
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