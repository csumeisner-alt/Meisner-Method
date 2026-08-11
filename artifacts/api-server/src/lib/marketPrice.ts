/**
 * Fast, dependency-free market price lookup for background jobs.
 *
 * The API's richer quote endpoints use Python/yfinance, but spawning Python
 * and initializing yfinance can exceed a worker timeout even when Yahoo's
 * chart endpoint is immediately available. Alert delivery only needs a price,
 * so keep this path small and independent.
 */

export function parseYahooChartPrice(payload: unknown): number | null {
  const result = (payload as any)?.chart?.result?.[0];
  if (!result || typeof result !== "object") return null;

  const metaPrice = Number(result.meta?.regularMarketPrice);
  if (Number.isFinite(metaPrice) && metaPrice > 0) return metaPrice;

  const closes = result.indicators?.quote?.[0]?.close;
  if (!Array.isArray(closes)) return null;

  for (let i = closes.length - 1; i >= 0; i--) {
    const price = Number(closes[i]);
    if (Number.isFinite(price) && price > 0) return price;
  }
  return null;
}

export async function fetchYahooChartPrice(symbol: string): Promise<number | null> {
  const normalizedSymbol = symbol.toUpperCase().trim();
  if (!normalizedSymbol) return null;

  const url = new URL(
    `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(normalizedSymbol)}`,
  );
  url.searchParams.set("range", "1d");
  url.searchParams.set("interval", "1m");

  const response = await fetch(url, {
    headers: {
      Accept: "application/json",
      "User-Agent": "Mozilla/5.0 MeisnerMethod/1.0",
    },
    signal: AbortSignal.timeout(12_000),
  });
  if (!response.ok) {
    throw new Error(`Yahoo chart returned HTTP ${response.status}`);
  }
  return parseYahooChartPrice(await response.json());
}