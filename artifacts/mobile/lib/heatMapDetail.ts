export interface HeatMapDetailStats {
  previousClose: number | null;
  open: number | null;
  dayLow: number | null;
  dayHigh: number | null;
  fiftyTwoWeekLow: number | null;
  fiftyTwoWeekHigh: number | null;
  volume: number | null;
  averageVolume: number | null;
  marketCap: number | null;
  beta: number | null;
  earningsTimestamp: number | null;
  targetMeanPrice: number | null;
  trailingEps: number | null;
  totalRevenue: number | null;
}

function numericField(value: unknown, key: string): number | null {
  const candidate = (value as Record<string, unknown>)[key];
  return typeof candidate === 'number' && Number.isFinite(candidate)
    ? candidate
    : null;
}

export function parseHeatMapDetailStats(value: unknown): HeatMapDetailStats | null {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return null;

  return {
    previousClose: numericField(value, 'previousClose'),
    open: numericField(value, 'open'),
    dayLow: numericField(value, 'dayLow'),
    dayHigh: numericField(value, 'dayHigh'),
    fiftyTwoWeekLow: numericField(value, 'fiftyTwoWeekLow'),
    fiftyTwoWeekHigh: numericField(value, 'fiftyTwoWeekHigh'),
    volume: numericField(value, 'volume'),
    averageVolume: numericField(value, 'averageVolume3Month'),
    marketCap: numericField(value, 'marketCap'),
    beta: numericField(value, 'beta'),
    earningsTimestamp: numericField(value, 'earningsTimestamp'),
    targetMeanPrice: numericField(value, 'targetMeanPrice'),
    trailingEps: numericField(value, 'trailingEps'),
    totalRevenue: numericField(value, 'totalRevenue'),
  };
}

export function getHeatMapRangePosition(
  currentPrice: number,
  low: number | null,
  high: number | null,
): number | null {
  if (
    !Number.isFinite(currentPrice)
    || low === null
    || high === null
    || !Number.isFinite(low)
    || !Number.isFinite(high)
    || high <= low
  ) {
    return null;
  }

  return Math.max(0, Math.min(100, ((currentPrice - low) / (high - low)) * 100));
}
