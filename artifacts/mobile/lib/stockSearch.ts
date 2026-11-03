export interface StockSearchMatch {
  symbol: string;
  name: string;
  exchange: string;
}

export interface StockSearchSuggestionSelectionState {
  alreadyAdded: boolean;
  selected: boolean;
  selectionAtLimit: boolean;
}

export function getStockSearchSuggestionSelectionState(
  symbol: string,
  existingSymbols: readonly string[],
  selectedSymbols: readonly string[],
  maxSymbols: number,
): StockSearchSuggestionSelectionState {
  const normalizedSymbol = symbol.trim().toUpperCase();
  const existing = new Set(existingSymbols.map(item => item.trim().toUpperCase()));
  const selected = new Set(selectedSymbols.map(item => item.trim().toUpperCase()));
  const alreadyAdded = existing.has(normalizedSymbol);
  const isSelected = selected.has(normalizedSymbol);
  const pendingCount = [...selected].filter(item => !existing.has(item)).length;

  return {
    alreadyAdded,
    selected: isSelected,
    selectionAtLimit: !alreadyAdded && !isSelected && existing.size + pendingCount >= maxSymbols,
  };
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

export function getStockSearchQueryFromKey(queryKey: readonly unknown[]): string | null {
  const params = queryKey[1];
  if (!params || typeof params !== 'object' || !('q' in params)) return null;

  const query = (params as { q?: unknown }).q;
  return typeof query === 'string' ? query : null;
}

export function isStockSearchCurrent({
  input,
  settledQuery,
  resultQuery,
  isPlaceholderData,
}: {
  input: string;
  settledQuery: string;
  resultQuery: string | null;
  isPlaceholderData: boolean;
}): boolean {
  const currentInput = input.trim();
  return currentInput.length >= 2
    && currentInput === settledQuery
    && currentInput === resultQuery
    && !isPlaceholderData;
}

export function isStockSearchSelectionCurrent({
  input,
  settledQuery,
  resultQuery,
  selectionQuery,
  isPlaceholderData,
}: {
  input: string;
  settledQuery: string;
  resultQuery: string | null;
  selectionQuery: string | null;
  isPlaceholderData: boolean;
}): boolean {
  return selectionQuery === resultQuery
    && isStockSearchCurrent({ input, settledQuery, resultQuery, isPlaceholderData });
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
    return { kind: 'loading', message: 'Searching stocks and ETFs…' };
  }
  if (!isFetching && isError) {
    return {
      kind: 'error',
      message: 'Stock and ETF search is unavailable. Enter a ticker symbol to look it up directly.',
    };
  }
  if (!isFetching && isSuccess && suggestionCount === 0) {
    return {
      kind: 'empty',
      message: 'No matching stocks or ETFs. Enter a ticker symbol if you know it.',
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