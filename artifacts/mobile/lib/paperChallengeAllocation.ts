export type EventHoldingSide = 'long' | 'short';

export const EVENT_HOLDINGS_PREVIEW_LIMIT = 5;

export function getVisibleEventHoldings<T>(
  holdings: T[],
  expanded: boolean,
): T[] {
  return expanded ? holdings : holdings.slice(0, EVENT_HOLDINGS_PREVIEW_LIMIT);
}

export function formatEventHoldingAllocation(allocationPercent: number | null): string {
  return allocationPercent == null
    ? 'Allocation unavailable'
    : `${allocationPercent.toFixed(2)}%`;
}

export function formatEventHoldingSide(side: EventHoldingSide): 'Long' | 'Short' {
  return side === 'short' ? 'Short' : 'Long';
}

export function hasEventAverageCostFallback(
  heldSymbols: string[],
  quotedSymbols: ReadonlySet<string>,
): boolean {
  return heldSymbols.some((symbol) => !quotedSymbols.has(symbol.toUpperCase()));
}

/**
 * Calculates absolute market exposure as a percentage of reported account equity.
 * Returns null instead of guessing when any required input is unavailable.
 */
export function calculateEventHoldingAllocationPercent(
  shares: number,
  currentPrice: number | null | undefined,
  accountEquity: number,
): number | null {
  if (
    !Number.isFinite(shares)
    || shares === 0
    || !Number.isFinite(currentPrice)
    || currentPrice == null
    || currentPrice <= 0
    || !Number.isFinite(accountEquity)
    || accountEquity <= 0
  ) return null;

  const allocationPercent = (Math.abs(shares) * currentPrice / accountEquity) * 100;
  return Number.isFinite(allocationPercent) ? allocationPercent : null;
}
