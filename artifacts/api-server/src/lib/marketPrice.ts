/**
 * Fast, dependency-free market price lookup for background jobs.
 *
 * The API's richer quote endpoints use Python/yfinance, but spawning Python
 * and initializing yfinance can exceed a worker timeout even when Yahoo's
 * chart endpoint is immediately available. Alert delivery only needs a price,
 * so keep this path small and independent.
 */

export const RECENT_SERVER_MARKET_PRICE_MAX_AGE_MS = 5 * 60_000;
const MAX_RECENT_SERVER_MARKET_PRICE_ENTRIES = 1_000;

export type RecentServerMarketPrice = {
  symbol: string;
  price: number;
  observedAtMs: number;
};

export type ServerMarketPriceCache = {
  remember: (symbol: string, price: number, observedAtMs?: number) => boolean;
  get: (symbol: string, nowMs?: number) => RecentServerMarketPrice | null;
};

export function createServerMarketPriceCache(
  maxAgeMs = RECENT_SERVER_MARKET_PRICE_MAX_AGE_MS,
  maxEntries = MAX_RECENT_SERVER_MARKET_PRICE_ENTRIES,
): ServerMarketPriceCache {
  const prices = new Map<string, RecentServerMarketPrice>();

  const normalizeSymbol = (symbol: string) => {
    const normalized = symbol.trim().toUpperCase();
    return /^[A-Z0-9.^=-]{1,15}$/.test(normalized) ? normalized : null;
  };

  return {
    remember(symbol, price, observedAtMs = Date.now()) {
      const normalized = normalizeSymbol(symbol);
      if (
        !normalized
        || !Number.isFinite(price)
        || price <= 0
        || !Number.isFinite(observedAtMs)
      ) return false;

      prices.delete(normalized);
      prices.set(normalized, { symbol: normalized, price, observedAtMs });
      while (prices.size > maxEntries) {
        const oldestSymbol = prices.keys().next().value;
        if (oldestSymbol === undefined) break;
        prices.delete(oldestSymbol);
      }
      return true;
    },
    get(symbol, nowMs = Date.now()) {
      const normalized = normalizeSymbol(symbol);
      if (!normalized || !Number.isFinite(nowMs)) return null;
      const cached = prices.get(normalized);
      if (!cached) return null;

      const ageMs = nowMs - cached.observedAtMs;
      if (ageMs < 0 || ageMs > maxAgeMs) {
        prices.delete(normalized);
        return null;
      }

      prices.delete(normalized);
      prices.set(normalized, cached);
      return { ...cached };
    },
  };
}

const serverMarketPriceCache = createServerMarketPriceCache();

export function rememberServerMarketPrice(
  symbol: string,
  price: number,
  observedAtMs = Date.now(),
): boolean {
  return serverMarketPriceCache.remember(symbol, price, observedAtMs);
}

export function getRecentServerMarketPrice(
  symbol: string,
  nowMs = Date.now(),
): RecentServerMarketPrice | null {
  return serverMarketPriceCache.get(symbol, nowMs);
}

export function rememberServerMarketPriceBatch(
  quotes: unknown,
  observedAtMs = Date.now(),
): number {
  if (!Array.isArray(quotes)) return 0;
  let cachedCount = 0;
  for (const quote of quotes) {
    if (!quote || typeof quote !== "object" || Array.isArray(quote)) continue;
    const item = quote as Record<string, unknown>;
    if (
      typeof item["symbol"] !== "string"
      || typeof item["currentPrice"] !== "number"
    ) continue;
    if (rememberServerMarketPrice(item["symbol"], item["currentPrice"], observedAtMs)) {
      cachedCount += 1;
    }
  }
  return cachedCount;
}

export function createServerPriceResolver(
  fetchPrice: (symbol: string) => Promise<number | null>,
  cache: ServerMarketPriceCache = serverMarketPriceCache,
  now: () => number = Date.now,
) {
  return async (symbol: string): Promise<
    (RecentServerMarketPrice & { source: "provider" | "server-cache" }) | null
  > => {
    const normalized = symbol.trim().toUpperCase();
    if (!/^[A-Z0-9.^=-]{1,15}$/.test(normalized)) return null;

    try {
      const price = await fetchPrice(normalized);
      if (Number.isFinite(price) && (price ?? 0) > 0) {
        const observedAtMs = now();
        cache.remember(normalized, price!, observedAtMs);
        return { symbol: normalized, price: price!, observedAtMs, source: "provider" };
      }
    } catch {
      // A recent successful server quote remains usable for a short outage.
    }

    const cached = cache.get(normalized, now());
    return cached ? { ...cached, source: "server-cache" } : null;
  };
}

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