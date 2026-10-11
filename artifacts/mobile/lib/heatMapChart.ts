export interface PriceBar {
  h: number;
  l: number;
  c: number;
}

export interface PriceLevels {
  support: number[];
  resistance: number[];
}

export const CHART_HISTORY_RANGES = [
  { label: '1W', period: '5d', interval: '1h' },
  { label: '1M', period: '1mo', interval: '1d' },
  { label: '3M', period: '3mo', interval: '1d' },
  { label: '6M', period: '6mo', interval: '1d' },
  { label: '1Y', period: '1y', interval: '1d' },
  { label: '2Y', period: '2y', interval: '1wk' },
] as const;

export type ChartHistoryRange = typeof CHART_HISTORY_RANGES[number];

export function buildChartHistoryUrl(symbol: string, range: ChartHistoryRange): string {
  return `/api/stocks/chart/${encodeURIComponent(symbol)}?period=${range.period}&interval=${range.interval}`;
}

export function detectHeatMapPriceLevels(bars: readonly PriceBar[]): PriceLevels {
  if (bars.length < 5) return { support: [], resistance: [] };

  const supportCandidates: number[] = [];
  const resistanceCandidates: number[] = [];
  for (let index = 1; index < bars.length - 1; index += 1) {
    const bar = bars[index]!;
    if (bar.l <= bars[index - 1]!.l && bar.l <= bars[index + 1]!.l) supportCandidates.push(bar.l);
    if (bar.h >= bars[index - 1]!.h && bar.h >= bars[index + 1]!.h) resistanceCandidates.push(bar.h);
  }

  const lastClose = bars[bars.length - 1]!.c;
  const nearbyRepeatedLevels = (candidates: number[]) => {
    const clusters: { value: number; touches: number }[] = [];
    for (const value of candidates) {
      const existing = clusters.find((cluster) =>
        Math.abs(cluster.value - value) / Math.max(Math.abs(cluster.value), 0.0001) < 0.015);
      if (existing) {
        existing.value = (existing.value * existing.touches + value) / (existing.touches + 1);
        existing.touches += 1;
      } else clusters.push({ value, touches: 1 });
    }
    return clusters
      .filter((cluster) => cluster.touches >= 2)
      .sort((left, right) => Math.abs(left.value - lastClose) - Math.abs(right.value - lastClose))
      .slice(0, 2)
      .map((cluster) => cluster.value);
  };

  return {
    support: nearbyRepeatedLevels(supportCandidates),
    resistance: nearbyRepeatedLevels(resistanceCandidates),
  };
}
