export type HeatMapTone = "HOT" | "COLD" | "NEUTRAL";
export type HeatMapRiskBand =
  | "Conservative"
  | "Moderate Conservative"
  | "Moderate"
  | "Moderate Aggressive"
  | "Aggressive";
export type HeatMapRiskFilter = HeatMapRiskBand | "Unknown" | null;
export type HeatMapCapBucket = "Micro" | "Small" | "Mid" | "Large" | "Mega";

export interface HeatMapMovement {
  price: number;
  returnPercent: number | null;
}

export interface HeatMapSummary {
  tone: HeatMapTone;
  positive: number;
  negative: number;
  neutral: number;
  quoted: number;
}

export interface HeatMapFilters {
  sector: string | null;
  marketCap: HeatMapCapBucket | null;
  exchange: string | null;
  risk: HeatMapRiskFilter;
}

export function uniqueHeatMapQuotesBySymbol<T extends { symbol: string }>(quotes: readonly T[]): T[] {
  const seen = new Set<string>();
  return quotes.filter((quote) => {
    if (seen.has(quote.symbol)) return false;
    seen.add(quote.symbol);
    return true;
  });
}

export interface HeatMapFilterableQuote {
  sector: string | null;
  exchange: string | null;
  marketCapUsd: number | null;
  riskBand: HeatMapRiskBand | null;
}

export interface HoneycombPosition {
  index: number;
  left: number;
  top: number;
}

export interface HoneycombLayout {
  positions: HoneycombPosition[];
  height: number;
}

const NEUTRAL_BAND_PERCENT = 0.25;
const TONE_THRESHOLD = 0.55;

export function marketCapBucketForUsd(value: number | null): HeatMapCapBucket | null {
  if (value === null || !Number.isFinite(value) || value <= 0) return null;
  if (value < 300_000_000) return "Micro";
  if (value < 2_000_000_000) return "Small";
  if (value < 10_000_000_000) return "Mid";
  if (value < 200_000_000_000) return "Large";
  return "Mega";
}

export function filterHeatMapQuotes<T extends HeatMapFilterableQuote>(
  quotes: T[],
  filters: HeatMapFilters,
): T[] {
  return quotes.filter((quote) => {
    if (filters.sector !== null && (quote.sector ?? "Unknown") !== filters.sector) return false;
    if (filters.exchange !== null && quote.exchange !== filters.exchange) return false;
    if (filters.marketCap !== null && marketCapBucketForUsd(quote.marketCapUsd) !== filters.marketCap) return false;
    if (filters.risk !== null) {
      const selectedRisk = quote.riskBand ?? "Unknown";
      if (selectedRisk !== filters.risk) return false;
    }
    return true;
  });
}

export function countActiveHeatMapFilters(filters: HeatMapFilters): number {
  return Number(filters.sector !== null)
    + Number(filters.marketCap !== null)
    + Number(filters.exchange !== null)
    + Number(filters.risk !== null);
}

export function heatMapResponseMatchesSelection(
  response: {
    category: string;
    period: string;
    requestedSector?: string | null;
    quotes: { symbol: string }[];
    unavailableSymbols: string[];
  } | null | undefined,
  category: string,
  period: string,
  symbols?: string[],
  requestedSector: string | null = null,
): boolean {
  if (!response || response.category !== category || response.period !== period) return false;
  if ((response.requestedSector ?? null) !== requestedSector) return false;
  if (symbols === undefined) return true;
  const reportedSymbols = new Set([
    ...response.quotes.map((quote) => quote.symbol),
    ...response.unavailableSymbols,
  ]);
  return reportedSymbols.size === symbols.length && symbols.every((symbol) => reportedSymbols.has(symbol));
}

export function getHeatMapTileWidth(availableWidth: number): number {
  if (!Number.isFinite(availableWidth) || availableWidth <= 0) return 0;
  return Math.min(availableWidth, 136, Math.max(84, availableWidth / 2.65));
}

/**
 * Places flat-top regular hexagons on the standard honeycomb lattice.
 * Neighboring rows are half a tile-height apart and offset by 3/4 tile-width.
 */
export function layoutHoneycomb(
  itemCount: number,
  availableWidth: number,
  tileWidth: number,
): HoneycombLayout {
  if (itemCount <= 0 || availableWidth <= 0 || tileWidth <= 0) return { positions: [], height: 0 };

  const tileHeight = tileWidth * Math.sqrt(3) / 2;
  const verticalRowStep = tileHeight / 2;
  const horizontalCellStep = tileWidth * 1.5;
  const evenCapacity = Math.max(1, Math.floor((availableWidth - tileWidth) / horizontalCellStep) + 1);
  const oddCapacity = Math.max(
    1,
    Math.floor((availableWidth - tileWidth - tileWidth * 0.75) / horizontalCellStep) + 1,
  );
  const rowCounts: number[] = [];
  let remaining = itemCount;
  for (let row = 0; remaining > 0; row++) {
    const count = Math.min(remaining, row % 2 === 0 ? evenCapacity : oddCapacity);
    rowCounts.push(count);
    remaining -= count;
  }

  const farthestCenterOffset = Math.max(
    ...rowCounts.map((count, row) =>
      (row % 2 === 0 ? 0 : tileWidth * 0.75) + (count - 1) * horizontalCellStep,
    ),
  );
  const firstCenter = (availableWidth - farthestCenterOffset) / 2;
  const positions: HoneycombPosition[] = [];
  let index = 0;
  rowCounts.forEach((count, row) => {
    const rowOffset = row % 2 === 0 ? 0 : tileWidth * 0.75;
    for (let column = 0; column < count; column++) {
      positions.push({
        index: index++,
        left: firstCenter + rowOffset + column * horizontalCellStep - tileWidth / 2,
        top: row * verticalRowStep,
      });
    }
  });

  return {
    positions,
    height: tileHeight + (rowCounts.length - 1) * verticalRowStep,
  };
}

export function summarizeHeatMap(quotes: HeatMapMovement[]): HeatMapSummary {
  const valid = quotes.filter(
    (quote) =>
      Number.isFinite(quote.price) &&
      quote.price > 0 &&
      typeof quote.returnPercent === "number" &&
      Number.isFinite(quote.returnPercent),
  );
  const positive = valid.filter((quote) => quote.returnPercent! > NEUTRAL_BAND_PERCENT).length;
  const negative = valid.filter((quote) => quote.returnPercent! < -NEUTRAL_BAND_PERCENT).length;
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