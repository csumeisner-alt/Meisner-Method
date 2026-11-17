import type { LiveQuote } from './paperMath.ts';

export type PaperQuoteFetcher = (symbol: string) => Promise<LiveQuote>;
export type PaperQuoteRequest = (symbol: string, forceRefresh?: boolean) => Promise<LiveQuote>;

/**
 * Share concurrent ticker requests and briefly reuse a just-fetched quote.
 * Quotes are instrument data; account balances and positions remain scoped by
 * accountId in Paper Trading's existing local cache.
 */
export function createPaperQuoteRequestCache(
  fetchQuote: PaperQuoteFetcher,
  reuseWindowMs = 5_000,
  now: () => number = Date.now,
): PaperQuoteRequest {
  const inFlight = new Map<string, Promise<LiveQuote>>();
  const recent = new Map<string, { quote: LiveQuote; cachedAtMs: number }>();

  return (rawSymbol, forceRefresh = false) => {
    const symbol = rawSymbol.trim().toUpperCase();
    if (!symbol) return Promise.reject(new Error('A ticker symbol is required.'));

    const pending = inFlight.get(symbol);
    if (pending) return pending;

    const cached = recent.get(symbol);
    if (!forceRefresh && cached && now() - cached.cachedAtMs >= 0 && now() - cached.cachedAtMs < reuseWindowMs) {
      return Promise.resolve(cached.quote);
    }

    const request = Promise.resolve()
      .then(() => fetchQuote(symbol))
      .then((quote) => {
        recent.set(symbol, { quote, cachedAtMs: now() });
        return quote;
      })
      .finally(() => {
        if (inFlight.get(symbol) === request) inFlight.delete(symbol);
      });
    inFlight.set(symbol, request);
    return request;
  };
}
