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
