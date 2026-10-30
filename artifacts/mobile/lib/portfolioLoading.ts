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

/**
 * Fetch each distinct ticker once and publish successful quotes as soon as they
 * arrive. A failed ticker does not block other positions from updating.
 */
export async function fetchPortfolioQuotes(
  symbols: string[],
  fetchQuote: (symbol: string) => Promise<Quote>,
  onQuote: (symbol: string, quote: Quote) => void,
): Promise<void> {
  const uniqueSymbols = [...new Set(symbols)];
  await Promise.all(
    uniqueSymbols.map(async (symbol) => {
      try {
        onQuote(symbol, await fetchQuote(symbol));
      } catch {
        // Keep any previously displayed quote; unavailable values stay absent.
      }
    }),
  );
}
