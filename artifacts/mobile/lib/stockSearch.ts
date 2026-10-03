export interface StockSearchMatch {
  symbol: string;
  name: string;
  exchange: string;
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