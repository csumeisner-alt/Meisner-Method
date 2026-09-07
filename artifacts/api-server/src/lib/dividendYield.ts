/**
 * Return dividend yield as a decimal fraction (0.0043 = 0.43%).
 *
 * yfinance has returned dividendYield in both decimal and percent-like units.
 * When the declared annual dividend and current price are available, use them
 * to identify which representation is closest. The fallback treats values
 * above 20% as percent-like; genuine stock yields above that are exceptionally
 * unusual, while values such as 0.43 are commonly provider percentages.
 */
export function normalizeDividendYield(
  raw: unknown,
  dividendRate?: unknown,
  price?: unknown,
): number {
  const value = Number(raw);
  const rate = Number(dividendRate);
  const currentPrice = Number(price);
  const expected = Number.isFinite(rate) && rate > 0 && Number.isFinite(currentPrice) && currentPrice > 0
    ? rate / currentPrice
    : null;

  if (!Number.isFinite(value) || value <= 0) return expected ?? 0;

  if (expected != null) {
    const decimalCandidate = value;
    const percentCandidate = value / 100;
    return Math.abs(percentCandidate - expected) < Math.abs(decimalCandidate - expected)
      ? percentCandidate
      : decimalCandidate;
  }

  return value > 0.2 ? value / 100 : value;
}