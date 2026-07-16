/**
 * Pure helpers for watchlist search/filter.
 *
 * - `filterSymbols`: case-insensitive prefix/substring match on ticker symbols.
 * - `mergeReorderedSubset`: after the user drags to reorder a *filtered* subset,
 *   map the new subset order back onto the full list. The positions occupied by
 *   the filtered symbols in the full order are refilled with the subset's new
 *   sequence; non-matching symbols keep their positions.
 */

/** Returns symbols matching the query (case-insensitive substring). Empty query matches all. */
export function matchesFilter(symbol: string, query: string): boolean {
  const q = query.trim().toUpperCase();
  if (!q) return true;
  return symbol.toUpperCase().includes(q);
}

/**
 * Sync rule for the draggable list's local display order.
 *
 * - If the incoming symbol *set* differs from the previous one (filter
 *   applied/cleared, ticker added/removed), adopt the incoming order exactly —
 *   it is canonical, and keep+append across subset/full transitions would
 *   scramble the order.
 * - If the set is identical, keep the previous local order (preserves an
 *   optimistic drag result against a momentarily stale parent refresh).
 */
export function syncLocalOrder(prev: string[], incoming: string[]): string[] {
  if (prev.length === incoming.length && incoming.every((s) => prev.includes(s))) {
    return prev;
  }
  return [...incoming];
}

/**
 * Given the full ordered symbol list, and the reordered filtered subset,
 * return the new full order: subset members' slots (their original positions
 * within the full list) are refilled in the subset's new order.
 */
export function mergeReorderedSubset(fullOrder: string[], reorderedSubset: string[]): string[] {
  const subsetSet = new Set(reorderedSubset);
  let i = 0;
  return fullOrder.map((sym) => (subsetSet.has(sym) ? reorderedSubset[i++]! : sym));
}
