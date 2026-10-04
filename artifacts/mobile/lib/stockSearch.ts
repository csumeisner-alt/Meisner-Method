export interface StockSearchMatch {
  symbol: string;
  name: string;
  exchange: string;
}

export interface BuyStockInfo {
  companyName: string;
  currentPrice: number;
  dividendYield: number;
  dividendRate: number;
  expenseRatio: number;
  sector: string;
}

export interface LatestRequestGuard {
  begin(): number;
  isCurrent(requestId: number): boolean;
  invalidate(): void;
}

export function createLatestRequestGuard(): LatestRequestGuard {
  let currentRequestId = 0;

  return {
    begin: () => ++currentRequestId,
    isCurrent: requestId => requestId === currentRequestId,
    invalidate: () => { currentRequestId += 1; },
  };
}

export type StockSearchFeedback =
  | { kind: 'loading'; message: string }
  | { kind: 'error'; message: string }
  | { kind: 'empty'; message: string };

export function getStockSearchFeedback({
  isFetching,
  isError,
  isSuccess,
  suggestionCount,
}: {
  isFetching: boolean;
  isError: boolean;
  isSuccess: boolean;
  suggestionCount: number;
}): StockSearchFeedback | null {
  if (isFetching && suggestionCount === 0) {
    return { kind: 'loading', message: 'Searching companies…' };
  }
  if (!isFetching && isError) {
    return {
      kind: 'error',
      message: 'Company search is unavailable. Enter a ticker symbol to look it up directly.',
    };
  }
  if (!isFetching && isSuccess && suggestionCount === 0) {
    return {
      kind: 'empty',
      message: 'No matching companies. Enter a ticker symbol if you know it.',
    };
  }
  return null;
}

export function getBuyOrderDetails(symbol: string, stockInfo: BuyStockInfo | null) {
  return {
    symbol: symbol.trim().toUpperCase(),
    companyName: stockInfo?.companyName ?? '',
    currentPrice: stockInfo?.currentPrice ?? 0,
    stockInfo: stockInfo ?? undefined,
  };
}

export function resolveStockSearchSymbol(
  input: string,
  suggestions: readonly StockSearchMatch[],
  selected: StockSearchMatch | null,
  allowRawTicker: boolean,
): string | null {
  if (selected) return selected.symbol;

  const trimmed = input.trim();
  if (!trimmed) return null;

  const exactMatch = suggestions.find(
    suggestion => suggestion.symbol.toUpperCase() === trimmed.toUpperCase(),
  );
  if (exactMatch) return exactMatch.symbol;

  const isUppercaseTicker = /^[A-Z0-9][A-Z0-9.-]{0,11}$/.test(trimmed)
    && trimmed === trimmed.toUpperCase();
  if (!allowRawTicker || suggestions.length > 0 || !isUppercaseTicker) return null;

  return trimmed;
}