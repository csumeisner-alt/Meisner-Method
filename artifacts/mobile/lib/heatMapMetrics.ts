export type HeatMapTone = "HOT" | "COLD" | "NEUTRAL";

export interface HeatMapMovement {
  price: number;
  priceChangePercent: number;
}

export interface HeatMapSummary {
  tone: HeatMapTone;
  positive: number;
  negative: number;
  neutral: number;
  quoted: number;
}

const NEUTRAL_BAND_PERCENT = 0.25;
const TONE_THRESHOLD = 0.55;

export function summarizeHeatMap(quotes: HeatMapMovement[]): HeatMapSummary {
  const valid = quotes.filter(
    (quote) =>
      Number.isFinite(quote.price) &&
      quote.price > 0 &&
      Number.isFinite(quote.priceChangePercent),
  );
  const positive = valid.filter((quote) => quote.priceChangePercent > NEUTRAL_BAND_PERCENT).length;
  const negative = valid.filter((quote) => quote.priceChangePercent < -NEUTRAL_BAND_PERCENT).length;
  const neutral = valid.length - positive - negative;

  return {
    tone: valid.length > 0 && positive / valid.length >= TONE_THRESHOLD
      ? "HOT"
      : valid.length > 0 && negative / valid.length >= TONE_THRESHOLD
        ? "COLD"
        : "NEUTRAL",
    positive,
    negative,
    neutral,
    quoted: valid.length,
  };
}