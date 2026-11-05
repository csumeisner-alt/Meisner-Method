export const COMMODITY_RELATIONSHIP_PERIODS = ["1mo", "3mo", "6mo", "1y", "5y", "max"] as const;
export type CommodityRelationshipPeriod = (typeof COMMODITY_RELATIONSHIP_PERIODS)[number];

export interface CommodityRelationshipInstrument {
  symbol: string;
  name: string;
  unit: string;
  venue: string;
  proxy?: boolean;
}

export interface CommodityRelationshipDefinition {
  id: string;
  label: string;
  mode: "pair" | "ratio";
  first: CommodityRelationshipInstrument;
  second: CommodityRelationshipInstrument;
  relativeValueLabel: string;
}

const gold: CommodityRelationshipInstrument = {
  symbol: "GC=F",
  name: "Gold futures",
  unit: "USD per troy ounce",
  venue: "COMEX",
};
const silver: CommodityRelationshipInstrument = {
  symbol: "SI=F",
  name: "Silver futures",
  unit: "USD per troy ounce",
  venue: "COMEX",
};

export const COMMODITY_RELATIONSHIPS: readonly CommodityRelationshipDefinition[] = [
  {
    id: "gold-silver",
    label: "Gold & Silver",
    mode: "pair",
    first: gold,
    second: silver,
    relativeValueLabel: "Gold / silver quote ratio",
  },
  {
    id: "gold-dollar",
    label: "Gold & U.S. Dollar Index",
    mode: "pair",
    first: gold,
    second: {
      symbol: "DX-Y.NYB",
      name: "U.S. Dollar Index (ICE index proxy)",
      unit: "index points",
      venue: "ICE Futures U.S.",
      proxy: true,
    },
    relativeValueLabel: "Gold / dollar-index quote ratio",
  },
  {
    id: "copper-gold",
    label: "Copper & Gold",
    mode: "pair",
    first: {
      symbol: "HG=F",
      name: "Copper futures",
      unit: "USD per pound",
      venue: "COMEX",
    },
    second: gold,
    relativeValueLabel: "Copper / gold quote ratio",
  },
  {
    id: "oil-gold",
    label: "Oil & Gold",
    mode: "pair",
    first: {
      symbol: "CL=F",
      name: "WTI crude oil futures",
      unit: "USD per barrel",
      venue: "NYMEX",
    },
    second: gold,
    relativeValueLabel: "Oil / gold quote ratio",
  },
  {
    id: "gold-silver-ratio",
    label: "Gold / Silver Ratio",
    mode: "ratio",
    first: gold,
    second: silver,
    relativeValueLabel: "Troy ounces of silver per troy ounce of gold",
  },
] as const;

export function isCommodityRelationshipId(value: unknown): value is string {
  return typeof value === "string"
    && COMMODITY_RELATIONSHIPS.some((relationship) => relationship.id === value);
}

export interface DatedCommodityClose {
  date: string;
  timestamp: number;
  close: number;
}

export interface CommodityRelationshipPoint {
  date: string;
  timestamp: number;
  firstClose: number;
  secondClose: number;
  firstReturnPercent: number;
  secondReturnPercent: number;
  relativeValue: number;
  firstNormalizedPercent: number;
  secondNormalizedPercent: number;
  rollingCorrelation: number | null;
}

export interface CommodityRelationshipResult {
  relationship: CommodityRelationshipDefinition;
  period: CommodityRelationshipPeriod;
  status: "available" | "unavailable";
  reason: string | null;
  method: {
    alignment: string;
    correlation: string;
    correlationChange: string;
    divergence: string;
    relativeValuePercentile: string;
  };
  coverage: {
    firstStartDate: string | null;
    firstEndDate: string | null;
    secondStartDate: string | null;
    secondEndDate: string | null;
    matchedStartDate: string | null;
    matchedEndDate: string | null;
    matchedObservations: number;
    returnObservations: number;
  };
  metrics: {
    currentRelativeValue: number | null;
    firstPeriodReturnPercent: number | null;
    secondPeriodReturnPercent: number | null;
    relativeStrengthPercentagePoints: number | null;
    correlation: number | null;
    previousCorrelation: number | null;
    correlationChange: number | null;
    currentRelativeValuePercentile: number | null;
  };
  divergence: {
    status: "detected" | "not_detected" | "unavailable";
    firstWindowReturnPercent: number | null;
    secondWindowReturnPercent: number | null;
    reason: string;
  };
  points: CommodityRelationshipPoint[];
}

export interface CommodityRelationshipHistoryRank {
  period: CommodityRelationshipPeriod;
  percentile: number | null;
  matchedObservations: number;
  matchedStartDate: string | null;
  matchedEndDate: string | null;
}

export interface CommodityRelationshipRankTrendPoint {
  date: string;
  percentile: number | null;
  matchedObservations: number;
}

export interface CommodityRelationshipRankTrend {
  window: "1y" | null;
  matchedObservations: number;
  matchedStartDate: string | null;
  matchedEndDate: string | null;
  rankObservations: number;
  rankStartDate: string | null;
  rankEndDate: string | null;
  minWindowObservations: number;
  maxWindowObservations: number;
  points: CommodityRelationshipRankTrendPoint[];
}

const CORRELATION_MIN_RETURNS = 10;
const CORRELATION_WINDOW = 20;
const DIVERGENCE_THRESHOLD_PERCENTAGE_POINTS = 5;
const DIVERGENCE_MAX_CORRELATION = 0.25;
const RELATIVE_VALUE_PERCENTILE_MIN_OBSERVATIONS = 20;
const RANK_TREND_WINDOW_MONTHS = 12;

function isValidDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const timestamp = Date.parse(`${value}T00:00:00.000Z`);
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString().slice(0, 10) === value;
}

function observedIceHoliday(month: number, day: number, year: number): string {
  const timestamp = Date.UTC(year, month - 1, day);
  const weekday = new Date(timestamp).getUTCDay();
  const observedTimestamp = timestamp + (weekday === 6 ? -86_400_000 : weekday === 0 ? 86_400_000 : 0);
  return new Date(observedTimestamp).toISOString().slice(0, 10);
}

export function isValidCommodityRelationshipTradingDate(
  instrument: CommodityRelationshipInstrument,
  date: string,
): boolean {
  if (!isValidDate(date)) return false;
  if (instrument.venue !== "ICE Futures U.S.") return true;
  const timestamp = Date.parse(`${date}T00:00:00.000Z`);
  const weekday = new Date(timestamp).getUTCDay();
  if (weekday === 0 || weekday === 6) return false;
  const year = Number(date.slice(0, 4));
  const iceClosures = new Set<string>();
  for (const holidayYear of [year - 1, year, year + 1]) {
    iceClosures.add(observedIceHoliday(1, 1, holidayYear));
    iceClosures.add(observedIceHoliday(12, 25, holidayYear));
  }
  return !iceClosures.has(date);
}

function cleanSeries(
  instrument: CommodityRelationshipInstrument,
  series: DatedCommodityClose[],
): DatedCommodityClose[] {
  const byDate = new Map<string, DatedCommodityClose>();
  const duplicateDates = new Set<string>();
  for (const point of series) {
    if (!isValidCommodityRelationshipTradingDate(instrument, point.date)
      || !Number.isSafeInteger(point.timestamp)
      || point.timestamp <= 0
      || !Number.isFinite(point.close)
      || point.close <= 0) {
      continue;
    }
    const timestampDate = new Date(point.timestamp * 1000).toISOString().slice(0, 10);
    if (Math.abs(Date.parse(`${point.date}T00:00:00.000Z`) - Date.parse(`${timestampDate}T00:00:00.000Z`)) > 86_400_000) {
      continue;
    }
    if (byDate.has(point.date)) {
      duplicateDates.add(point.date);
      continue;
    }
    byDate.set(point.date, point);
  }
  for (const date of duplicateDates) byDate.delete(date);
  return [...byDate.values()].sort((left, right) => left.date.localeCompare(right.date));
}

function pearson(left: number[], right: number[]): number | null {
  if (left.length !== right.length || left.length < CORRELATION_MIN_RETURNS) return null;
  const leftMean = left.reduce((sum, value) => sum + value, 0) / left.length;
  const rightMean = right.reduce((sum, value) => sum + value, 0) / right.length;
  let covariance = 0;
  let leftVariance = 0;
  let rightVariance = 0;
  for (let index = 0; index < left.length; index += 1) {
    const leftDelta = left[index]! - leftMean;
    const rightDelta = right[index]! - rightMean;
    covariance += leftDelta * rightDelta;
    leftVariance += leftDelta * leftDelta;
    rightVariance += rightDelta * rightDelta;
  }
  if (leftVariance === 0 || rightVariance === 0) return null;
  return covariance / Math.sqrt(leftVariance * rightVariance);
}

function returnPercent(previous: number, current: number): number {
  return (current / previous - 1) * 100;
}

function empiricalPercentileRank(current: number, observations: number[]): number | null {
  if (observations.length < RELATIVE_VALUE_PERCENTILE_MIN_OBSERVATIONS
    || !Number.isFinite(current)
    || observations.some((value) => !Number.isFinite(value))) {
    return null;
  }
  const below = observations.filter((value) => value < current).length;
  const equal = observations.filter((value) => value === current).length;
  return ((below + equal / 2) / observations.length) * 100;
}

function emptyResult(
  relationship: CommodityRelationshipDefinition,
  period: CommodityRelationshipPeriod,
  reason: string,
  firstDates: DatedCommodityClose[],
  secondDates: DatedCommodityClose[],
  matchedObservations: number,
  matchedStartDate: string | null,
  matchedEndDate: string | null,
): CommodityRelationshipResult {
  return {
    relationship,
    period,
    status: "unavailable",
    reason,
    method: {
      alignment: "Exact shared provider trading-date labels; no forward fill or interpolation.",
      correlation: "Pearson correlation of close-to-close simple daily returns; minimum 10 matched returns.",
      correlationChange: "Last 20 return observations minus the preceding 20 return observations.",
      divergence: "Detected when the latest 20-session return spread is at least 5 percentage points and its 20-return correlation is at most 0.25.",
      relativeValuePercentile: "Empirical midrank of the latest relative value among exact-date, same-unit observations; minimum 20 observations. No missing values are filled.",
    },
    coverage: {
      firstStartDate: firstDates[0]?.date ?? null,
      firstEndDate: firstDates.at(-1)?.date ?? null,
      secondStartDate: secondDates[0]?.date ?? null,
      secondEndDate: secondDates.at(-1)?.date ?? null,
      matchedStartDate,
      matchedEndDate,
      matchedObservations,
      returnObservations: Math.max(0, matchedObservations - 1),
    },
    metrics: {
      currentRelativeValue: null,
      firstPeriodReturnPercent: null,
      secondPeriodReturnPercent: null,
      relativeStrengthPercentagePoints: null,
      correlation: null,
      previousCorrelation: null,
      correlationChange: null,
      currentRelativeValuePercentile: null,
    },
    divergence: { status: "unavailable", firstWindowReturnPercent: null, secondWindowReturnPercent: null, reason },
    points: [],
  };
}

export function calculateCommodityRelationship(
  relationship: CommodityRelationshipDefinition,
  period: CommodityRelationshipPeriod,
  firstInput: DatedCommodityClose[],
  secondInput: DatedCommodityClose[],
): CommodityRelationshipResult {
  const first = cleanSeries(relationship.first, firstInput);
  const second = cleanSeries(relationship.second, secondInput);
  const firstByDate = new Map(first.map((point) => [point.date, point]));
  const secondByDate = new Map(second.map((point) => [point.date, point]));
  const dates = [...firstByDate.keys()].filter((date) => secondByDate.has(date)).sort();
  const matched = dates.map((date) => ({
    date,
    first: firstByDate.get(date)!,
    second: secondByDate.get(date)!,
  }));

  if (matched.length < CORRELATION_MIN_RETURNS + 1) {
    return emptyResult(
      relationship,
      period,
      `At least ${CORRELATION_MIN_RETURNS + 1} valid shared trading dates are required; ${matched.length} matched.`,
      first,
      second,
      matched.length,
      matched[0]?.date ?? null,
      matched.at(-1)?.date ?? null,
    );
  }

  const firstBase = matched[0]!.first.close;
  const secondBase = matched[0]!.second.close;
  const relativeValues = matched.map(({ first: firstPoint, second: secondPoint }) =>
    firstPoint.close / secondPoint.close);
  const firstReturns = matched.slice(1).map(({ first }, index) =>
    returnPercent(matched[index]!.first.close, first.close));
  const secondReturns = matched.slice(1).map(({ second }, index) =>
    returnPercent(matched[index]!.second.close, second.close));
  const rollingCorrelation: (number | null)[] = matched.map((_, index) => {
    if (index < CORRELATION_MIN_RETURNS) return null;
    const end = index;
    const start = Math.max(1, end - CORRELATION_WINDOW + 1);
    return pearson(
      firstReturns.slice(start - 1, end),
      secondReturns.slice(start - 1, end),
    );
  });
  const allCorrelation = pearson(firstReturns, secondReturns);
  const currentWindowStart = Math.max(0, firstReturns.length - CORRELATION_WINDOW);
  const currentWindowCorrelation = pearson(
    firstReturns.slice(currentWindowStart),
    secondReturns.slice(currentWindowStart),
  );
  const previousWindowStart = firstReturns.length - CORRELATION_WINDOW * 2;
  const previousCorrelation = previousWindowStart >= 0
    ? pearson(
      firstReturns.slice(previousWindowStart, previousWindowStart + CORRELATION_WINDOW),
      secondReturns.slice(previousWindowStart, previousWindowStart + CORRELATION_WINDOW),
    )
    : null;
  const firstLatestWindowReturn = matched.length > CORRELATION_WINDOW
    ? returnPercent(matched[matched.length - CORRELATION_WINDOW - 1]!.first.close, matched.at(-1)!.first.close)
    : null;
  const secondLatestWindowReturn = matched.length > CORRELATION_WINDOW
    ? returnPercent(matched[matched.length - CORRELATION_WINDOW - 1]!.second.close, matched.at(-1)!.second.close)
    : null;
  const spread = firstLatestWindowReturn != null && secondLatestWindowReturn != null
    ? firstLatestWindowReturn - secondLatestWindowReturn
    : null;
  const divergenceStatus = spread === null || currentWindowCorrelation === null
    ? "unavailable"
    : Math.abs(spread) >= DIVERGENCE_THRESHOLD_PERCENTAGE_POINTS
      && currentWindowCorrelation <= DIVERGENCE_MAX_CORRELATION
      ? "detected"
      : "not_detected";
  const divergenceReason = divergenceStatus === "detected"
    ? `The latest 20-session return spread is ${spread!.toFixed(2)} percentage points with a 20-return correlation of ${currentWindowCorrelation!.toFixed(2)}.`
    : divergenceStatus === "not_detected"
      ? "The documented 20-session return-spread and correlation thresholds are not both met."
      : "Insufficient observations for the documented 20-session divergence check.";

  const points = matched.map(({ date, first: firstPoint, second: secondPoint }, index) => ({
    date,
    timestamp: Math.min(firstPoint.timestamp, secondPoint.timestamp),
    firstClose: firstPoint.close,
    secondClose: secondPoint.close,
    firstReturnPercent: index === 0 ? 0 : firstReturns[index - 1]!,
    secondReturnPercent: index === 0 ? 0 : secondReturns[index - 1]!,
    relativeValue: firstPoint.close / secondPoint.close,
    firstNormalizedPercent: returnPercent(firstBase, firstPoint.close),
    secondNormalizedPercent: returnPercent(secondBase, secondPoint.close),
    rollingCorrelation: rollingCorrelation[index] ?? null,
  }));
  const last = matched.at(-1)!;
  const firstReturn = returnPercent(firstBase, last.first.close);
  const secondReturn = returnPercent(secondBase, last.second.close);

  return {
    relationship,
    period,
    status: "available",
    reason: null,
    method: {
      alignment: relationship.first.venue === "ICE Futures U.S."
        ? "Exact shared provider trading-date labels; DX-Y.NYB dates are checked against ICE weekdays and full-day closures, not CME calendars. No forward fill or interpolation."
        : relationship.second.venue === "ICE Futures U.S."
          ? "Exact shared provider trading-date labels; DX-Y.NYB dates are checked against ICE weekdays and full-day closures, not CME calendars. No forward fill or interpolation."
          : "Exact shared provider trading-date labels; no forward fill or interpolation.",
      correlation: "Pearson correlation of close-to-close simple daily returns; minimum 10 matched returns.",
      correlationChange: "Last 20 return observations minus the preceding 20 return observations.",
      divergence: "Detected when the latest 20-session return spread is at least 5 percentage points and its 20-return correlation is at most 0.25.",
      relativeValuePercentile: "Empirical midrank of the latest relative value among exact-date, same-unit observations; minimum 20 observations. No missing values are filled.",
    },
    coverage: {
      firstStartDate: first[0]?.date ?? null,
      firstEndDate: first.at(-1)?.date ?? null,
      secondStartDate: second[0]?.date ?? null,
      secondEndDate: second.at(-1)?.date ?? null,
      matchedStartDate: matched[0]!.date,
      matchedEndDate: last.date,
      matchedObservations: matched.length,
      returnObservations: firstReturns.length,
    },
    metrics: {
      currentRelativeValue: last.first.close / last.second.close,
      firstPeriodReturnPercent: firstReturn,
      secondPeriodReturnPercent: secondReturn,
      relativeStrengthPercentagePoints: firstReturn - secondReturn,
      correlation: allCorrelation,
      previousCorrelation,
      correlationChange: currentWindowCorrelation != null && previousCorrelation != null
        ? currentWindowCorrelation - previousCorrelation
        : null,
      currentRelativeValuePercentile: relationship.id === "gold-silver-ratio"
        && relationship.first.unit === relationship.second.unit
        ? empiricalPercentileRank(relativeValues.at(-1)!, relativeValues)
        : null,
    },
    divergence: {
      status: divergenceStatus,
      firstWindowReturnPercent: firstLatestWindowReturn,
      secondWindowReturnPercent: secondLatestWindowReturn,
      reason: divergenceReason,
    },
    points,
  };
}

function subtractCalendarMonths(date: string, months: number): string {
  const [year, month, day] = date.split("-").map(Number);
  const targetMonth = new Date(Date.UTC(year!, month! - 1 - months, 1));
  const lastDay = new Date(Date.UTC(
    targetMonth.getUTCFullYear(),
    targetMonth.getUTCMonth() + 1,
    0,
  )).getUTCDate();
  targetMonth.setUTCDate(Math.min(day!, lastDay));
  return targetMonth.toISOString().slice(0, 10);
}

export function calculateCommodityRelationshipRankTrend(
  relationship: CommodityRelationshipDefinition,
  firstInput: DatedCommodityClose[],
  secondInput: DatedCommodityClose[],
): CommodityRelationshipRankTrend {
  const supportsRankTrend = relationship.id === "gold-silver-ratio"
    && relationship.first.unit === relationship.second.unit;
  if (!supportsRankTrend) {
    return {
      window: null,
      matchedObservations: 0,
      matchedStartDate: null,
      matchedEndDate: null,
      rankObservations: 0,
      rankStartDate: null,
      rankEndDate: null,
      minWindowObservations: 0,
      maxWindowObservations: 0,
      points: [],
    };
  }

  const first = cleanSeries(relationship.first, firstInput);
  const secondByDate = new Map(cleanSeries(relationship.second, secondInput)
    .map((point) => [point.date, point]));
  const matched = first.flatMap((point) => {
    const other = secondByDate.get(point.date);
    return other ? [{
      date: point.date,
      ratio: point.close / other.close,
    }] : [];
  });

  let windowStart = 0;
  const points = matched.map((point, index) => {
    const firstWindowDate = subtractCalendarMonths(point.date, RANK_TREND_WINDOW_MONTHS);
    while (matched[windowStart]!.date < firstWindowDate) windowStart += 1;
    const observations = matched.slice(windowStart, index + 1);
    return {
      date: point.date,
      percentile: empiricalPercentileRank(point.ratio, observations.map(({ ratio }) => ratio)),
      matchedObservations: observations.length,
    };
  });
  const rankPoints = points.filter((point) => point.percentile !== null);
  const rankWindowSizes = rankPoints.map(({ matchedObservations }) => matchedObservations);

  return {
    window: "1y",
    matchedObservations: matched.length,
    matchedStartDate: matched[0]?.date ?? null,
    matchedEndDate: matched.at(-1)?.date ?? null,
    rankObservations: rankPoints.length,
    rankStartDate: rankPoints[0]?.date ?? null,
    rankEndDate: rankPoints.at(-1)?.date ?? null,
    minWindowObservations: rankWindowSizes.length ? Math.min(...rankWindowSizes) : 0,
    maxWindowObservations: rankWindowSizes.length ? Math.max(...rankWindowSizes) : 0,
    points,
  };
}

export function calculateCommodityRelationshipHistoryRanks(
  relationship: CommodityRelationshipDefinition,
  firstInput: DatedCommodityClose[],
  secondInput: DatedCommodityClose[],
): CommodityRelationshipHistoryRank[] {
  if (relationship.id !== "gold-silver-ratio"
    || relationship.first.unit !== relationship.second.unit) {
    return [];
  }

  const first = cleanSeries(relationship.first, firstInput);
  const second = cleanSeries(relationship.second, secondInput);
  const secondDates = new Set(second.map(({ date }) => date));
  const matchedDates = first
    .filter(({ date }) => secondDates.has(date))
    .map(({ date }) => date);
  const latestMatchedDate = matchedDates.at(-1) ?? null;

  return COMMODITY_RELATIONSHIP_PERIODS.map((period) => {
    if (!latestMatchedDate) {
      return {
        period,
        percentile: null,
        matchedObservations: 0,
        matchedStartDate: null,
        matchedEndDate: null,
      };
    }

    const months = period === "1mo" ? 1
      : period === "3mo" ? 3
        : period === "6mo" ? 6
          : period === "1y" ? 12
            : period === "5y" ? 60
              : null;
    const startDate = months === null
      ? null
      : subtractCalendarMonths(latestMatchedDate, months);
    const firstWindow = first.filter(({ date }) =>
      date <= latestMatchedDate && (startDate === null || date >= startDate));
    const secondWindow = second.filter(({ date }) =>
      date <= latestMatchedDate && (startDate === null || date >= startDate));
    const result = calculateCommodityRelationship(
      relationship,
      period,
      firstWindow,
      secondWindow,
    );

    return {
      period,
      percentile: result.metrics.currentRelativeValuePercentile,
      matchedObservations: result.coverage.matchedObservations,
      matchedStartDate: result.coverage.matchedStartDate,
      matchedEndDate: result.coverage.matchedEndDate,
    };
  });
}

export function isCommodityRelationshipPeriod(value: unknown): value is CommodityRelationshipPeriod {
  return typeof value === "string"
    && COMMODITY_RELATIONSHIP_PERIODS.includes(value as CommodityRelationshipPeriod);
}
