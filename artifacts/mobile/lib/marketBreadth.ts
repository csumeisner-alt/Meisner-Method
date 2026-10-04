import type { HeatMapQuote } from '@workspace/api-client-react';
import { isDisplayableHeatMapQuote } from './heatMapQuoteDisplay.ts';
import { summarizeHeatMap, type HeatMapTone } from './heatMapMetrics.ts';

export type MarketBreadthQuote = Pick<
  HeatMapQuote,
  'assetType' | 'price' | 'priceTimestamp' | 'returnPercent'
>;

export interface MarketBreadthInsight {
  tone: HeatMapTone;
  greenPercent: number | null;
  redPercent: number | null;
  quoted: number;
}

export function getMarketBreadthInsight(
  quotes: readonly MarketBreadthQuote[],
  nowSeconds = Date.now() / 1000,
): MarketBreadthInsight {
  const freshQuotes = quotes.filter((quote) => isDisplayableHeatMapQuote(quote, nowSeconds));
  const summary = summarizeHeatMap(freshQuotes);
  const percent = (count: number) => summary.quoted > 0
    ? Math.floor((count / summary.quoted) * 100)
    : null;

  return {
    tone: summary.tone,
    greenPercent: percent(summary.positive),
    redPercent: percent(summary.negative),
    quoted: summary.quoted,
  };
}