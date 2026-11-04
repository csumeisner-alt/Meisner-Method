import { alignCandleSeriesOnSharedDates } from './alignCandleSeries.ts';

export interface AdjustedReturnPoint {
  date: string;
  returnPercent: number;
}

export interface ProviderAdjustedReturnSeries {
  status: 'available' | 'unavailable';
  method: 'provider_adjusted_close';
  values: AdjustedReturnPoint[];
  reason: string | null;
}

export interface AdjustedCandle {
  date: string;
  adjustedReturnPercent?: number;
}

export type ProviderAdjustedCandle<Candle extends AdjustedCandle> =
  Candle & { adjustedReturnPercent: number };

function indexedValues(series: ProviderAdjustedReturnSeries): Map<string, number> | null {
  if (series.status !== 'available' || series.method !== 'provider_adjusted_close') return null;
  const values = new Map<string, number>();
  for (const point of series.values) {
    if (!point.date || !Number.isFinite(point.returnPercent) || values.has(point.date)) return null;
    values.set(point.date, point.returnPercent);
  }
  return values;
}

function rebaseReturn(value: number, base: number): number | null {
  const baseGrowth = 1 + base / 100;
  if (baseGrowth <= 0) return null;
  return ((1 + value / 100) / baseGrowth - 1) * 100;
}

export function addProviderAdjustedReturns<Candle extends AdjustedCandle>(
  candles: Candle[],
  series: ProviderAdjustedReturnSeries,
): ProviderAdjustedCandle<Candle>[] | null {
  const values = indexedValues(series);
  if (!values || candles.length < 2 || candles.some(({ date }) => !values.has(date))) return null;
  const base = values.get(candles[0]!.date)!;
  const returns = candles.map((candle) => rebaseReturn(values.get(candle.date)!, base));
  if (returns.some((value) => value == null)) return null;
  return candles.map((candle, index) => ({
    ...candle,
    adjustedReturnPercent: returns[index]!,
  }));
}

export function alignProviderAdjustedReturns<Candle extends AdjustedCandle>(
  primaryCandles: Candle[],
  comparisonCandles: Candle[],
  primarySeries: ProviderAdjustedReturnSeries,
  comparisonSeries: ProviderAdjustedReturnSeries,
): {
  dates: string[];
  primary: ProviderAdjustedCandle<Candle>[];
  comparison: ProviderAdjustedCandle<Candle>[];
  available: boolean;
} {
  const shared = alignCandleSeriesOnSharedDates(primaryCandles, comparisonCandles);
  const unavailable = {
    dates: shared.dates,
    primary: [] as ProviderAdjustedCandle<Candle>[],
    comparison: [] as ProviderAdjustedCandle<Candle>[],
    available: false,
  };
  const primaryValues = indexedValues(primarySeries);
  const comparisonValues = indexedValues(comparisonSeries);
  if (!primaryValues || !comparisonValues || shared.dates.length < 2) return unavailable;
  if (shared.dates.some((date) => !primaryValues.has(date) || !comparisonValues.has(date))) {
    return unavailable;
  }

  const primaryBase = primaryValues.get(shared.dates[0]!)!;
  const comparisonBase = comparisonValues.get(shared.dates[0]!)!;
  const primaryReturns = shared.primary.map((candle) =>
    rebaseReturn(primaryValues.get(candle.date)!, primaryBase));
  const comparisonReturns = shared.comparison.map((candle) =>
    rebaseReturn(comparisonValues.get(candle.date)!, comparisonBase));
  if (primaryReturns.some((value) => value == null) || comparisonReturns.some((value) => value == null)) {
    return unavailable;
  }
  const primary = shared.primary.map((candle, index) => ({
    ...candle,
    adjustedReturnPercent: primaryReturns[index]!,
  }));
  const comparison = shared.comparison.map((candle, index) => ({
    ...candle,
    adjustedReturnPercent: comparisonReturns[index]!,
  }));
  return { dates: shared.dates, primary, comparison, available: true };
}

export function calculateRelativeReturnPercent(primaryReturnPercent: number, comparisonReturnPercent: number): number | null {
  const comparisonGrowth = 1 + comparisonReturnPercent / 100;
  if (!Number.isFinite(primaryReturnPercent) || !Number.isFinite(comparisonReturnPercent) || comparisonGrowth <= 0) {
    return null;
  }
  return ((1 + primaryReturnPercent / 100) / comparisonGrowth - 1) * 100;
}
