export const COMMODITY_INTELLIGENCE_SCORE_VERSION = 1 as const;
export const COMMODITY_INTELLIGENCE_HISTORY_MAX_AGE_MS = 365 * 24 * 60 * 60 * 1000;
const INPUT_MAX_AGE_MS = 60 * 24 * 60 * 60 * 1000;
const SUPPORTED_COMMODITY_SYMBOLS = new Set([
  "GC=F", "SI=F", "CL=F", "NG=F", "HG=F", "ZC=F", "ZW=F", "ZS=F",
  "KC=F", "CT=F", "SB=F", "PL=F", "PA=F", "LE=F", "HE=F",
]);

export type CommodityScoreCategoryId =
  | "technical-momentum"
  | "fundamentals"
  | "supply-demand"
  | "market-environment"
  | "risk-volatility";

export interface CommodityScoreCategoryInput {
  id: CommodityScoreCategoryId;
  score: number | null;
  sources: { url: string; unit: string; asOf: string }[];
}

export interface CommodityScoreSnapshotInput {
  symbol: string;
  score: number;
  scorecardVersion: number;
  categories: readonly CommodityScoreCategoryInput[];
  recordedAt: string;
}

export interface CommodityScoreSnapshot {
  version: 1;
  scorecardVersion: number;
  symbol: string;
  recordedAt: string;
  score: number;
  categoryIds: CommodityScoreCategoryId[];
  categoryScores: Partial<Record<CommodityScoreCategoryId, number>>;
  sourceContexts: Partial<Record<CommodityScoreCategoryId, string>>;
  inputAsOf: Partial<Record<CommodityScoreCategoryId, string[]>>;
}

export type CommodityScoreComparison =
  | {
    status: "available";
    previousScore: number;
    change: number;
    previousRecordedAt: string;
    improvedCategories: string[];
    deterioratedCategories: string[];
  }
  | { status: "first-analysis" | "not-comparable" | "unavailable" };

const CATEGORY_IDS: readonly CommodityScoreCategoryId[] = [
  "technical-momentum",
  "fundamentals",
  "supply-demand",
  "market-environment",
  "risk-volatility",
];
const CATEGORY_LABELS: Record<CommodityScoreCategoryId, string> = {
  "technical-momentum": "Technical momentum",
  fundamentals: "Fundamental conditions",
  "supply-demand": "Supply and demand",
  "market-environment": "Market environment",
  "risk-volatility": "Risk and volatility",
};

function canonicalSymbol(value: string): string {
  return value.trim().toUpperCase();
}

function isValidDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const timestamp = Date.parse(`${value}T00:00:00.000Z`);
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString().slice(0, 10) === value;
}

function datesAreFresh(dates: readonly string[], referenceTime: number): boolean {
  return dates.length > 0 && dates.every((date) => {
    if (!isValidDate(date)) return false;
    const timestamp = Date.parse(`${date}T00:00:00.000Z`);
    return timestamp <= referenceTime && referenceTime - timestamp <= INPUT_MAX_AGE_MS;
  });
}

function isValidSnapshot(value: unknown): value is CommodityScoreSnapshot {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<CommodityScoreSnapshot>;
  const recordedTime = typeof candidate.recordedAt === "string" ? Date.parse(candidate.recordedAt) : NaN;
  return candidate.version === 1
    && candidate.scorecardVersion === COMMODITY_INTELLIGENCE_SCORE_VERSION
    && typeof candidate.symbol === "string"
    && SUPPORTED_COMMODITY_SYMBOLS.has(canonicalSymbol(candidate.symbol))
    && candidate.symbol === canonicalSymbol(candidate.symbol)
    && Number.isFinite(recordedTime)
    && Number.isInteger(candidate.score)
    && candidate.score! >= 0
    && candidate.score! <= 100
    && Array.isArray(candidate.categoryIds)
    && candidate.categoryIds.length >= 2
    && candidate.categoryIds.includes("technical-momentum")
    && candidate.categoryIds.includes("risk-volatility")
    && candidate.categoryIds.every((id) => CATEGORY_IDS.includes(id))
    && new Set(candidate.categoryIds).size === candidate.categoryIds.length
    && candidate.categoryScores != null
    && candidate.sourceContexts != null
    && candidate.inputAsOf != null
    && candidate.categoryIds.every((id) =>
      Number.isInteger(candidate.categoryScores?.[id])
      && candidate.categoryScores![id]! >= 0
      && candidate.categoryScores![id]! <= 100
      && typeof candidate.sourceContexts?.[id] === "string"
      && Boolean(candidate.sourceContexts[id]?.trim())
      && Array.isArray(candidate.inputAsOf?.[id])
      && candidate.inputAsOf![id]!.every(isValidDate),
    );
}

export function createCommodityScoreSnapshot(
  input: CommodityScoreSnapshotInput,
): CommodityScoreSnapshot | null {
  const symbol = canonicalSymbol(input.symbol);
  const recordedTime = Date.parse(input.recordedAt);
  if (
    !SUPPORTED_COMMODITY_SYMBOLS.has(symbol)
    || input.scorecardVersion !== COMMODITY_INTELLIGENCE_SCORE_VERSION
    || !Number.isInteger(input.score)
    || input.score < 0
    || input.score > 100
    || !Number.isFinite(recordedTime)
  ) return null;

  const scored = input.categories.filter((category) => category.score !== null);
  const categoryIds = scored.map((category) => category.id);
  if (
    categoryIds.length < 2
    || !categoryIds.includes("technical-momentum")
    || !categoryIds.includes("risk-volatility")
    || new Set(categoryIds).size !== categoryIds.length
    || categoryIds.some((id) => !CATEGORY_IDS.includes(id))
  ) return null;

  const categoryScores: Partial<Record<CommodityScoreCategoryId, number>> = {};
  const sourceContexts: Partial<Record<CommodityScoreCategoryId, string>> = {};
  const inputAsOf: Partial<Record<CommodityScoreCategoryId, string[]>> = {};
  for (const category of scored) {
    const sources = category.sources.filter((source) =>
      typeof source.url === "string" && source.url.startsWith("https://")
      && typeof source.unit === "string" && source.unit.trim()
      && typeof source.asOf === "string",
    );
    const dates = sources.map((source) => source.asOf);
    if (
      !Number.isInteger(category.score)
      || category.score! < 0
      || category.score! > 100
      || !datesAreFresh(dates, recordedTime)
    ) return null;
    categoryScores[category.id] = category.score!;
    sourceContexts[category.id] = JSON.stringify(
      sources.map(({ url, unit }) => [url, unit]).sort(([a], [b]) => a.localeCompare(b)),
    );
    inputAsOf[category.id] = [...new Set(dates)].sort();
  }

  return {
    version: 1,
    scorecardVersion: input.scorecardVersion,
    symbol,
    recordedAt: new Date(recordedTime).toISOString(),
    score: input.score,
    categoryIds,
    categoryScores,
    sourceContexts,
    inputAsOf,
  };
}

export function parseCommodityScoreSnapshots(value: string | null): CommodityScoreSnapshot[] {
  if (!value) return [];
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter(isValidSnapshot) : [];
  } catch {
    return [];
  }
}

function sameAnalysis(a: CommodityScoreSnapshot, b: CommodityScoreSnapshot): boolean {
  return a.symbol === b.symbol
    && a.scorecardVersion === b.scorecardVersion
    && a.score === b.score
    && JSON.stringify(a.categoryIds) === JSON.stringify(b.categoryIds)
    && JSON.stringify(a.categoryScores) === JSON.stringify(b.categoryScores)
    && JSON.stringify(a.sourceContexts) === JSON.stringify(b.sourceContexts)
    && JSON.stringify(a.inputAsOf) === JSON.stringify(b.inputAsOf);
}

export function upsertCommodityScoreSnapshot(
  history: readonly CommodityScoreSnapshot[],
  snapshot: CommodityScoreSnapshot,
  limit = 200,
): CommodityScoreSnapshot[] {
  if (history.some((item) => sameAnalysis(item, snapshot))) return [...history];
  return [...history, snapshot]
    .sort((a, b) => Date.parse(b.recordedAt) - Date.parse(a.recordedAt))
    .slice(0, Math.max(1, limit));
}

export function findComparableCommodityScoreChange(
  current: CommodityScoreSnapshot | null,
  history: readonly CommodityScoreSnapshot[],
): CommodityScoreComparison {
  if (!current) return { status: "unavailable" };
  const currentTime = Date.parse(current.recordedAt);
  if (!Number.isFinite(currentTime) || !isValidSnapshot(current)
    || !current.categoryIds.every((id) => datesAreFresh(current.inputAsOf[id]!, currentTime))) {
    return { status: "unavailable" };
  }
  const sameSymbol = history.filter((snapshot) => snapshot.symbol === current.symbol);
  const prior = sameSymbol.filter((snapshot) => {
    const time = Date.parse(snapshot.recordedAt);
    return time < currentTime
      && currentTime - time <= COMMODITY_INTELLIGENCE_HISTORY_MAX_AGE_MS
      && !sameAnalysis(snapshot, current)
      && snapshot.scorecardVersion === current.scorecardVersion
      && snapshot.categoryIds.every((id) => datesAreFresh(snapshot.inputAsOf[id]!, time));
  }).sort((a, b) => Date.parse(b.recordedAt) - Date.parse(a.recordedAt));
  const comparable = prior.find((snapshot) =>
    JSON.stringify(snapshot.categoryIds) === JSON.stringify(current.categoryIds)
    && current.categoryIds.every((id) =>
      snapshot.sourceContexts[id] === current.sourceContexts[id],
    ),
  );
  if (!comparable) {
    return sameSymbol.some((snapshot) => Date.parse(snapshot.recordedAt) < currentTime)
      ? { status: "not-comparable" }
      : { status: "first-analysis" };
  }

  const improvedCategories: string[] = [];
  const deterioratedCategories: string[] = [];
  for (const id of current.categoryIds) {
    const change = current.categoryScores[id]! - comparable.categoryScores[id]!;
    if (change >= 3) improvedCategories.push(CATEGORY_LABELS[id]);
    if (change <= -3) deterioratedCategories.push(CATEGORY_LABELS[id]);
  }
  return {
    status: "available",
    previousScore: comparable.score,
    change: current.score - comparable.score,
    previousRecordedAt: comparable.recordedAt,
    improvedCategories,
    deterioratedCategories,
  };
}
