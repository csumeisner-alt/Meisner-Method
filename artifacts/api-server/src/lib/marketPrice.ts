/**
 * Fast, dependency-free market price lookup for background jobs.
 *
 * The API's richer quote endpoints use Python/yfinance, but spawning Python
 * and initializing yfinance can exceed a worker timeout even when Yahoo's
 * chart endpoint is immediately available. Alert delivery only needs a price,
 * so keep this path small and independent.
 */

export function parseYahooChartPrice(
  payload: unknown,
  nowSeconds = Math.floor(Date.now() / 1000),
): number | null {
  const result = (payload as any)?.chart?.result?.[0];
  if (!result || typeof result !== "object") return null;

  const meta = result.meta ?? {};
  const marketState = String(meta.marketState ?? "").toUpperCase();
  const currentTradingPeriod = meta.currentTradingPeriod ?? {};
  const periodForNow = ["pre", "regular", "post"].find((period) => {
    const window = currentTradingPeriod[period];
    const start = Number(window?.start);
    const end = Number(window?.end);
    return Number.isFinite(start) && Number.isFinite(end)
      && nowSeconds >= start && nowSeconds <= end;
  });

  const sessionPriceKey =
    periodForNow === "pre" ? "preMarketPrice"
      : periodForNow === "post" ? "postMarketPrice"
        : marketState === "PRE" || marketState === "PREPRE" ? "preMarketPrice"
          : marketState === "POST" || marketState === "POSTPOST" || marketState === "CLOSED" ? "postMarketPrice"
            : null;
  const sessionPrice = Number(sessionPriceKey ? meta[sessionPriceKey] : NaN);

  const closes = result.indicators?.quote?.[0]?.close;
  const timestamps = result.timestamp;
  let latestClose: number | null = null;
  let latestTimestamp: number | null = null;

  if (Array.isArray(closes)) {
    for (let i = closes.length - 1; i >= 0; i--) {
      const price = Number(closes[i]);
      if (Number.isFinite(price) && price > 0) {
        latestClose = price;
        const timestamp = Number(Array.isArray(timestamps) ? timestamps[i] : NaN);
        latestTimestamp = Number.isFinite(timestamp) ? timestamp : null;
        break;
      }
    }
  }

  // During pre/post-market, the explicit Yahoo session price is preferred.
  // The chart candle is the fallback because it includes extended sessions
  // when includePrePost=true. When the market is closed, the last candle may
  // be the final after-hours print and is newer than regularMarketTime.
  if (Number.isFinite(sessionPrice) && sessionPrice > 0
    && (periodForNow === "pre" || periodForNow === "post"
      || marketState === "PRE" || marketState === "PREPRE"
      || marketState === "POST" || marketState === "POSTPOST")) {
    return sessionPrice;
  }
  if (latestClose != null && (
    periodForNow === "pre" || periodForNow === "post"
    || marketState === "PRE" || marketState === "PREPRE"
    || marketState === "POST" || marketState === "POSTPOST" || marketState === "CLOSED"
    || (!periodForNow && latestTimestamp != null
      && latestTimestamp > Number(meta.regularMarketTime ?? 0))
  )) {
    return latestClose;
  }

  const metaPrice = Number(meta.regularMarketPrice);
  if (Number.isFinite(metaPrice) && metaPrice > 0) return metaPrice;
  return latestClose;
}

export async function fetchYahooChartPrice(symbol: string): Promise<number | null> {
  const normalizedSymbol = symbol.toUpperCase().trim();
  if (!normalizedSymbol) return null;

  const url = new URL(
    `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(normalizedSymbol)}`,
  );
  url.searchParams.set("range", "1d");
  url.searchParams.set("interval", "1m");
  url.searchParams.set("includePrePost", "true");

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