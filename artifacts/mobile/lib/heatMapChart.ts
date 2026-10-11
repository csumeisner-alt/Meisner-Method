export interface PriceBar {
  h: number;
  l: number;
  c: number;
}

export interface PriceLevels {
  support: number[];
  resistance: number[];
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
