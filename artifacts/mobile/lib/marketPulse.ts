import type { MarketPulseResponse } from '@workspace/api-client-react';
import type { HeatMapTone } from './heatMapMetrics.ts';

export interface MarketPulseInsight {
  tone: HeatMapTone;
  changePercent: number | null;
  priceTimestamp: number | null;
  marketOpen: boolean | null;
}

export const MARKET_PULSE_FRESHNESS_LIMIT_SECONDS = 5 * 60;
const US_EQUITY_235_START_MS = Date.parse('2026-12-07T02:00:00.000Z');

export function isUsEquityMaintenancePause(nowMs = Date.now()): boolean {
  if (!Number.isFinite(nowMs) || nowMs < US_EQUITY_235_START_MS) return false;
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    weekday: 'short',
    hour: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(nowMs));
  const weekday = parts.find((part) => part.type === 'weekday')?.value;
  const hour = parts.find((part) => part.type === 'hour')?.value;
  return ['Mon', 'Tue', 'Wed', 'Thu'].includes(weekday ?? '') && hour === '20';
}

export function getMarketPulseInsight(
  pulse: Partial<Pick<MarketPulseResponse, 'changePercent' | 'priceTimestamp' | 'marketOpen'>> | null | undefined,
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
    marketOpen: typeof pulse?.marketOpen === 'boolean' ? pulse.marketOpen : null,
  };
}

export function isMarketPulseStale(
  pulse: MarketPulseInsight,
  nowMs = Date.now(),
): boolean {
  if (pulse.marketOpen !== true || pulse.priceTimestamp === null || !Number.isFinite(nowMs)) {
    return false;
  }
  const ageSeconds = nowMs / 1000 - pulse.priceTimestamp;
  return ageSeconds > MARKET_PULSE_FRESHNESS_LIMIT_SECONDS;
}

export function formatMarketPulseDetail(
  pulse: MarketPulseInsight,
  nowMs = Date.now(),
): string | null {
  if (pulse.changePercent === null || pulse.priceTimestamp === null) return null;
  const quoteDate = new Date(pulse.priceTimestamp * 1000);
  if (Number.isNaN(quoteDate.getTime())) return null;

  const dayLabel = pulse.marketOpen === false
    ? 'LAST SESSION'
    : quoteDate.toDateString() === new Date(nowMs).toDateString()
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
