import type { Quote, Trade } from './portfolioMath.ts';

export type PortfolioTradeLoadEvent =
  | { source: 'cache'; trades: Trade[] }
  | { source: 'server'; trades: Trade[] }
  | { source: 'server-error' };

/**
 * Apply cached trades as soon as they are available, but never let a late cache
 * read replace a successful, newer server response.
 */
export function startPortfolioTradesLoad(
  readCache: () => Promise<Trade[]>,
  fetchServer: () => Promise<Trade[]>,
  onEvent: (event: PortfolioTradeLoadEvent) => void,
): () => void {
  let cancelled = false;
  let serverSucceeded = false;

  void readCache()
    .then((trades) => {
      if (!cancelled && !serverSucceeded) onEvent({ source: 'cache', trades });
    })
    .catch(() => {
      // The server request remains the source of truth when local storage fails.
    });

  void fetchServer()
    .then((trades) => {
      serverSucceeded = true;
      if (!cancelled) onEvent({ source: 'server', trades });
    })
    .catch(() => {
      if (!cancelled) onEvent({ source: 'server-error' });
    });

  return () => {
    cancelled = true;
  };
}

export interface PortfolioQuoteBatch {
  quotes: Array<Quote & { symbol: string }>;
  unavailableSymbols: string[];
}

export interface CachedPortfolioQuote {
  quote: Quote;
  updatedAt: string;
}

export type PortfolioQuoteCache = Record<string, CachedPortfolioQuote>;

export function updatePortfolioQuoteCache(
  cache: PortfolioQuoteCache,
  symbol: string,
  quote: Quote,
  updatedAt: string,
): PortfolioQuoteCache {
  return { ...cache, [symbol]: { quote, updatedAt } };
}

/** Read only valid saved quotes so a corrupt cache never blocks live loading. */
export function parsePortfolioQuoteCache(raw: string | null): PortfolioQuoteCache {
  if (!raw) return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};

    const cache: PortfolioQuoteCache = {};
    for (const [symbol, value] of Object.entries(parsed)) {
      if (!value || typeof value !== 'object' || Array.isArray(value)) continue;
      const entry = value as Partial<CachedPortfolioQuote>;
      const quote = entry.quote;
      if (
        typeof entry.updatedAt !== 'string'
        || !Number.isFinite(Date.parse(entry.updatedAt))
        || !quote
        || !Number.isFinite(quote.currentPrice)
        || !Number.isFinite(quote.priceChange)
        || !Number.isFinite(quote.priceChangePercent)
        || (quote.expenseRatio != null && !Number.isFinite(quote.expenseRatio))
      ) continue;
      cache[symbol] = { quote, updatedAt: entry.updatedAt };
    }
    return cache;
  } catch {
    return {};
  }
}

/**
 * Fetch distinct tickers together and publish every available quote. Missing
 * symbols remain unchanged without preventing the rest of the batch updating.
 */
export async function fetchPortfolioQuotes(
  symbols: string[],
  fetchQuotes: (symbols: string[]) => Promise<PortfolioQuoteBatch>,
  onQuote: (symbol: string, quote: Quote) => void,
): Promise<void> {
  const uniqueSymbols = [...new Set(symbols)];
  if (uniqueSymbols.length === 0) return;
  try {
    const result = await fetchQuotes(uniqueSymbols);
    for (const quoteWithSymbol of result.quotes) {
      if (uniqueSymbols.includes(quoteWithSymbol.symbol)) {
        const { symbol, ...quote } = quoteWithSymbol;
        onQuote(symbol, quote);
      }
    }
  } catch {
    // Keep previously displayed quotes when the whole request is unavailable.
  }
}
