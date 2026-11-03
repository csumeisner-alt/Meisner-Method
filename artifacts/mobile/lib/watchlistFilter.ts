/**
 * Pure helpers for keeping watchlist ordering stable.
 *
 * - `mergeReorderedSubset`: after the user drags to reorder a subset,
 *   map the new subset order back onto the full list. The subset's existing
 *   positions in the full order are refilled with its new sequence.
 */

/**
 * Sync rule for the draggable list's local display order.
 *
 * - If the incoming symbol *set* differs from the previous one (tickers added
 *   or removed), adopt the incoming order exactly —
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
 * Given the full ordered symbol list, and the reordered subset,
 * return the new full order: subset members' slots (their original positions
 * within the full list) are refilled in the subset's new order.
 */
export function mergeReorderedSubset(fullOrder: string[], reorderedSubset: string[]): string[] {
  const subsetSet = new Set(reorderedSubset);
  let i = 0;
  return fullOrder.map((sym) => (subsetSet.has(sym) ? reorderedSubset[i++]! : sym));
}
