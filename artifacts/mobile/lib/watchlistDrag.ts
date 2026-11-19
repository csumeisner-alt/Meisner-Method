/** A drag is tied to a symbol and the displayed order at touch-down, never an index alone. */
export function finishWatchlistDrag(
  current: string[],
  started: string[],
  symbol: string,
  target: number,
  succeeded: boolean,
): string[] | null {
  if (!succeeded || current.join('\0') !== started.join('\0')) return null;
  const from = current.indexOf(symbol);
  if (from < 0 || target < 0 || target >= current.length || from === target) return null;
  const next = [...current];
  next.splice(from, 1);
  next.splice(target, 0, symbol);
  return next;
}
