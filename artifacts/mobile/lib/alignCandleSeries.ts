export interface DatedCandle {
  date: string;
}

export function alignCandleSeriesOnSharedDatesAcrossSeries<Candle extends DatedCandle>(
  candleSeries: Candle[][],
): { dates: string[]; series: Candle[][] } {
  if (candleSeries.length === 0 || candleSeries.some((candles) => candles.length === 0)) {
    return { dates: [], series: candleSeries.map(() => []) };
  }

  const indexedSeries = candleSeries.map((candles) => {
    const byDate = new Map<string, Candle>();
    for (const candle of candles) {
      if (candle.date) byDate.set(candle.date, candle);
    }
    return byDate;
  });
  const dates = [...indexedSeries[0]!.keys()]
    .filter((date) => indexedSeries.every((byDate) => byDate.has(date)))
    .sort((left, right) => left.localeCompare(right));

  return {
    dates,
    series: indexedSeries.map((byDate) => dates.map((date) => byDate.get(date)!)),
  };
}

export function alignCandleSeriesOnSharedDates<Primary extends DatedCandle, Comparison extends DatedCandle>(
  primaryCandles: Primary[],
  comparisonCandles: Comparison[],
): { primary: Primary[]; comparison: Comparison[]; dates: string[] } {
  const primaryByDate = new Map<string, Primary>();
  const comparisonByDate = new Map<string, Comparison>();
  for (const candle of primaryCandles) {
    if (candle.date) primaryByDate.set(candle.date, candle);
  }
  for (const candle of comparisonCandles) {
    if (candle.date) comparisonByDate.set(candle.date, candle);
  }
  const dates = [...primaryByDate.keys()]
    .filter((date) => comparisonByDate.has(date))
    .sort((left, right) => left.localeCompare(right));
  return {
    dates,
    primary: dates.map((date) => primaryByDate.get(date)!),
    comparison: dates.map((date) => comparisonByDate.get(date)!),
  };
}
