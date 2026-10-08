import type { MarketPulseResponse } from '@workspace/api-client-react';
import type { HeatMapTone } from './heatMapMetrics.ts';

export interface MarketPulseInsight {
  tone: HeatMapTone;
  changePercent: number | null;
  priceTimestamp: number | null;
}

export function getMarketPulseInsight(
  pulse: Pick<MarketPulseResponse, 'changePercent' | 'priceTimestamp'> | null | undefined,
): MarketPulseInsight {
  const changePercent = typeof pulse?.changePercent === 'number' && Number.isFinite(pulse.changePercent)
    ? pulse.changePercent
    : null;

  return {
    tone: changePercent === null
      ? 'NEUTRAL'
      : changePercent > 0
        ? 'HOT'
        : changePercent < 0
          ? 'COLD'
          : 'NEUTRAL',
    changePercent,
    priceTimestamp: typeof pulse?.priceTimestamp === 'number' && Number.isFinite(pulse.priceTimestamp)
      ? pulse.priceTimestamp
      : null,
  };
}

export function formatMarketPulseDetail(
  pulse: MarketPulseInsight,
  nowMs = Date.now(),
): string | null {
  if (pulse.changePercent === null || pulse.priceTimestamp === null) return null;
  const quoteDate = new Date(pulse.priceTimestamp * 1000);
  if (Number.isNaN(quoteDate.getTime())) return null;

  const dayLabel = quoteDate.toDateString() === new Date(nowMs).toDateString()
    ? 'TODAY'
    : 'LAST SESSION';
  const signedChange = pulse.changePercent > 0
    ? `+${pulse.changePercent.toFixed(2)}`
    : pulse.changePercent.toFixed(2);
  const quoteTime = quoteDate.toLocaleTimeString([], {
    hour: 'numeric',
    minute: '2-digit',
  });

  return `${signedChange}% ${dayLabel} · ${quoteTime}`;
}
