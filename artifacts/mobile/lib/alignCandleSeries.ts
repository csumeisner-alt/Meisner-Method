export interface DatedCandle {
  date: string;
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
