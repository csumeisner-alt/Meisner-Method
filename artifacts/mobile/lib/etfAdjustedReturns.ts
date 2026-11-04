import {
  alignCandleSeriesOnSharedDates,
  alignCandleSeriesOnSharedDatesAcrossSeries,
} from './alignCandleSeries.ts';

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

export function alignProviderAdjustedReturnsAcrossSeries<Candle extends AdjustedCandle>(
  candleSeries: Candle[][],
  adjustedSeries: ProviderAdjustedReturnSeries[],
): {
  dates: string[];
  series: ProviderAdjustedCandle<Candle>[][];
  available: boolean;
} {
  const shared = alignCandleSeriesOnSharedDatesAcrossSeries(candleSeries);
  const unavailable = {
    dates: shared.dates,
    series: [] as ProviderAdjustedCandle<Candle>[][],
    available: false,
  };
  if (
    candleSeries.length < 2
    || adjustedSeries.length !== candleSeries.length
    || shared.dates.length < 2
  ) {
    return unavailable;
  }

  const valuesBySeries = adjustedSeries.map(indexedValues);
  if (valuesBySeries.some((values) => values === null)) return unavailable;
  const validValues = valuesBySeries as Map<string, number>[];
  if (shared.dates.some((date) => validValues.some((values) => !values.has(date)))) {
    return unavailable;
  }

  const results = shared.series.map((candles, seriesIndex) => {
    const values = validValues[seriesIndex]!;
    const base = values.get(shared.dates[0]!)!;
    return candles.map((candle) => {
      const adjustedReturnPercent = rebaseReturn(values.get(candle.date)!, base);
      return adjustedReturnPercent == null
        ? null
        : { ...candle, adjustedReturnPercent };
    });
  });
  if (results.some((result) => result.some((candle) => candle === null))) return unavailable;
  return {
    dates: shared.dates,
    series: results as ProviderAdjustedCandle<Candle>[][],
    available: true,
  };
}

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
  const aligned = alignProviderAdjustedReturnsAcrossSeries(
    [primaryCandles, comparisonCandles],
    [primarySeries, comparisonSeries],
  );
  const unavailable = {
    dates: aligned.dates,
    primary: [] as ProviderAdjustedCandle<Candle>[],
    comparison: [] as ProviderAdjustedCandle<Candle>[],
    available: false,
  };
  if (!aligned.available) return unavailable;
  return {
    dates: aligned.dates,
    primary: aligned.series[0]!,
    comparison: aligned.series[1]!,
    available: true,
  };
}

export function calculateRelativeReturnPercent(primaryReturnPercent: number, comparisonReturnPercent: number): number | null {
  const comparisonGrowth = 1 + comparisonReturnPercent / 100;
  if (!Number.isFinite(primaryReturnPercent) || !Number.isFinite(comparisonReturnPercent) || comparisonGrowth <= 0) {
    return null;
  }
  return ((1 + primaryReturnPercent / 100) / comparisonGrowth - 1) * 100;
}
