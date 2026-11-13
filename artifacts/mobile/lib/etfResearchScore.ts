export interface EtfScoreInput {
  expenseRatio: number | null;
  categoryAverageExpenseRatio: number | null;
  riskAdjustedReturn: number | null;
  sectorWeights: readonly { sector: string; weight: number }[];
  averageVolume: number | null;
  totalAssets: number | null;
  peerAssetSizeComparison: {
    category: string;
    categoryAverageTotalAssets: number;
    sampleSize: number | null;
    sampleContext: string;
    source: string;
    asOf: string;
  } | null;
  annualizedVolatility: number | null;
  maxDrawdown: number | null;
}

export interface EtfScoreComponent {
  id: "cost" | "tracking" | "performance" | "diversification" | "liquidity" | "risk";
  label: string;
  weight: number;
  score: number | null;
  detail: string;
  peerContext?: {
    category: string;
    categoryAverageTotalAssets: number;
    sampleSize: number | null;
    sampleContext: string;
    source: string;
    asOf: string;
  };
}

export type EtfScoreComponentId = EtfScoreComponent["id"];

export interface EtfScoreSnapshot {
  version: 1;
  methodology?: EtfScoreMethodology;
  symbol: string;
  recordedAt: string;
  score: number;
  componentIds: EtfScoreComponentId[];
  componentScores: Partial<Record<EtfScoreComponentId, number>>;
  sourceContexts: Partial<Record<EtfScoreComponentId, string>>;
  inputAsOf: Partial<Record<EtfScoreComponentId, string[]>>;
}

export interface EtfScoreSnapshotInput {
  methodology?: EtfScoreMethodology;
  symbol: string;
  score: number | null;
  components: readonly EtfScoreComponent[];
  sourceContexts: Partial<Record<EtfScoreComponentId, string>>;
  inputAsOf: Partial<Record<EtfScoreComponentId, string[]>>;
  recordedAt: string;
}

export type EtfScoreChangeResult =
  | { status: "available"; previousScore: number; change: number; previousRecordedAt: string }
  | { status: "first-analysis" }
  | { status: "stale-inputs" }
  | { status: "stale-history" }
  | { status: "methodology-changed" }
  | { status: "not-comparable" }
  | { status: "unavailable" };

export interface EtfScoreHistoryEntry {
  snapshot: EtfScoreSnapshot;
  status: "baseline" | "available" | "stale-inputs" | "stale-history" | "methodology-changed" | "not-comparable";
  change?: number;
  previousRecordedAt?: string;
}

export const ETF_SCORE_INPUT_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
const ETF_SCORE_HISTORY_MAX_AGE_MS = 365 * 24 * 60 * 60 * 1000;
export type EtfScoreMethodology = "benchmark-tracking-v1" | "risk-adjusted-performance-v2";
export const CURRENT_ETF_SCORE_METHODOLOGY: EtfScoreMethodology = "risk-adjusted-performance-v2";

const scoreComponentIds: readonly EtfScoreComponentId[] = [
  "cost",
  "tracking",
  "performance",
  "diversification",
  "liquidity",
  "risk",
];

function getSnapshotMethodology(snapshot: EtfScoreSnapshot): EtfScoreMethodology {
  // Snapshots written before methodology tags used benchmark tracking.
  return snapshot.methodology ?? "benchmark-tracking-v1";
}

function sameEtfScoreSymbol(a: string, b: string): boolean {
  return a.trim().toUpperCase() === b.trim().toUpperCase();
}

function isFreshTimestamp(value: string | undefined, referenceTime: number): boolean {
  if (typeof value !== "string" || !value.trim()) return false;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp)
    && timestamp <= referenceTime
    && referenceTime - timestamp <= ETF_SCORE_INPUT_MAX_AGE_MS;
}

function snapshotHasFreshInputs(snapshot: EtfScoreSnapshot, referenceTime: number): boolean {
  return snapshot.componentIds.every((id) => {
    const dates = snapshot.inputAsOf[id];
    return Array.isArray(dates) && dates.length > 0
      && dates.every((date) => isFreshTimestamp(date, referenceTime));
  });
}

function sameSnapshotAnalysis(a: EtfScoreSnapshot, b: EtfScoreSnapshot): boolean {
  const componentIds = [...a.componentIds].sort();
  return sameEtfScoreSymbol(a.symbol, b.symbol)
    && getSnapshotMethodology(a) === getSnapshotMethodology(b)
    && a.score === b.score
    && JSON.stringify(componentIds) === JSON.stringify([...b.componentIds].sort())
    && componentIds.every((id) =>
      a.componentScores[id] === b.componentScores[id]
      && a.sourceContexts[id] === b.sourceContexts[id]
      && JSON.stringify(a.inputAsOf[id]) === JSON.stringify(b.inputAsOf[id]),
    );
}

function hasValidSnapshotShape(value: unknown): value is EtfScoreSnapshot {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<EtfScoreSnapshot>;
  return candidate.version === 1
    && (candidate.methodology === undefined
      || candidate.methodology === "benchmark-tracking-v1"
      || candidate.methodology === "risk-adjusted-performance-v2")
    && typeof candidate.symbol === "string"
    && candidate.symbol.length > 0
    && typeof candidate.recordedAt === "string"
    && Number.isFinite(Date.parse(candidate.recordedAt))
    && typeof candidate.score === "number"
    && Number.isFinite(candidate.score)
    && candidate.score >= 0
    && candidate.score <= 100
    && Array.isArray(candidate.componentIds)
    && candidate.componentIds.length >= 3
    && candidate.componentIds.every((id) => scoreComponentIds.includes(id))
    && new Set(candidate.componentIds).size === candidate.componentIds.length
    && candidate.componentScores != null
    && candidate.componentIds.every((id) =>
      typeof candidate.componentScores?.[id] === "number"
      && Number.isFinite(candidate.componentScores[id])
      && candidate.componentScores[id]! >= 0
      && candidate.componentScores[id]! <= 100,
    )
    && candidate.sourceContexts != null
    && candidate.componentIds.every((id) =>
      typeof candidate.sourceContexts?.[id] === "string" && Boolean(candidate.sourceContexts[id]?.trim()),
    )
    && candidate.inputAsOf != null;
}

export function createEtfScoreSnapshot(input: EtfScoreSnapshotInput): EtfScoreSnapshot | null {
  const available = input.components.filter((component) => component.score !== null);
  const componentIds = available.map((component) => component.id);
  const recordedAt = Date.parse(input.recordedAt);
  if (
    input.score === null
    || !Number.isFinite(input.score)
    || input.score < 0
    || input.score > 100
    || !input.symbol.trim()
    || componentIds.length < 3
    || !Number.isFinite(recordedAt)
  ) {
    return null;
  }

  const sourceContexts: Partial<Record<EtfScoreComponentId, string>> = {};
  const componentScores: Partial<Record<EtfScoreComponentId, number>> = {};
  const inputAsOf: Partial<Record<EtfScoreComponentId, string[]>> = {};
  for (const id of componentIds) {
    const context = input.sourceContexts[id]?.trim();
    const dates = input.inputAsOf[id];
    if (!context || !dates?.length || !dates.every((date) => isFreshTimestamp(date, recordedAt))) {
      return null;
    }
    sourceContexts[id] = context;
    componentScores[id] = available.find((component) => component.id === id)!.score!;
    inputAsOf[id] = [...dates];
  }

  return {
    version: 1,
    methodology: input.methodology ?? CURRENT_ETF_SCORE_METHODOLOGY,
    symbol: input.symbol.trim().toUpperCase(),
    recordedAt: new Date(recordedAt).toISOString(),
    score: Math.round(input.score),
    componentIds,
    componentScores,
    sourceContexts,
    inputAsOf,
  };
}

export function parseEtfScoreSnapshots(value: string | null): EtfScoreSnapshot[] {
  if (!value) return [];
  try {
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(hasValidSnapshotShape);
  } catch {
    return [];
  }
}

export function upsertEtfScoreSnapshot(
  history: readonly EtfScoreSnapshot[],
  snapshot: EtfScoreSnapshot,
  limit = 200,
): EtfScoreSnapshot[] {
  const next = [...history];
  if (!next.some((existing) => sameSnapshotAnalysis(existing, snapshot))) {
    next.push(snapshot);
  }
  return next
    .sort((a, b) => Date.parse(b.recordedAt) - Date.parse(a.recordedAt))
    .slice(0, Math.max(1, limit));
}

let etfScoreSnapshotWriteQueue: Promise<void> = Promise.resolve();

export function persistEtfScoreSnapshot(
  snapshot: EtfScoreSnapshot,
  readStoredHistory: () => Promise<string | null>,
  writeStoredHistory: (value: string) => Promise<void>,
): Promise<EtfScoreSnapshot[]> {
  const queuedWrite = etfScoreSnapshotWriteQueue.then(async () => {
    const history = parseEtfScoreSnapshots(await readStoredHistory());
    const alreadySaved = history.some((item) => sameSnapshotAnalysis(item, snapshot));
    const nextHistory = upsertEtfScoreSnapshot(history, snapshot);
    if (!alreadySaved) {
      await writeStoredHistory(JSON.stringify(nextHistory));
    }
    return nextHistory;
  });
  etfScoreSnapshotWriteQueue = queuedWrite.then(() => undefined, () => undefined);
  return queuedWrite;
}

export function clearEtfScoreSnapshots(
  removeStoredHistory: () => Promise<void>,
): Promise<void> {
  const queuedClear = etfScoreSnapshotWriteQueue.then(removeStoredHistory);
  etfScoreSnapshotWriteQueue = queuedClear.then(() => undefined, () => undefined);
  return queuedClear;
}

export function removeEtfScoreSnapshot(
  snapshot: EtfScoreSnapshot,
  readStoredHistory: () => Promise<string | null>,
  writeStoredHistory: (value: string) => Promise<void>,
): Promise<EtfScoreSnapshot[]> {
  const queuedRemove = etfScoreSnapshotWriteQueue.then(async () => {
    const history = parseEtfScoreSnapshots(await readStoredHistory());
    const nextHistory = history.filter((item) =>
      !sameEtfScoreSymbol(item.symbol, snapshot.symbol)
      || item.recordedAt !== snapshot.recordedAt,
    );
    if (nextHistory.length !== history.length) {
      await writeStoredHistory(JSON.stringify(nextHistory));
    }
    return nextHistory;
  });
  etfScoreSnapshotWriteQueue = queuedRemove.then(() => undefined, () => undefined);
  return queuedRemove;
}

export function restoreEtfScoreSnapshot(
  snapshot: EtfScoreSnapshot,
  readStoredHistory: () => Promise<string | null>,
  writeStoredHistory: (value: string) => Promise<void>,
): Promise<EtfScoreSnapshot[]> {
  const queuedRestore = etfScoreSnapshotWriteQueue.then(async () => {
    const history = parseEtfScoreSnapshots(await readStoredHistory());
    const alreadyRestored = history.some((item) =>
      sameEtfScoreSymbol(item.symbol, snapshot.symbol)
      && item.recordedAt === snapshot.recordedAt,
    );
    if (alreadyRestored) return history;

    const nextHistory = [...history, snapshot]
      .sort((a, b) => Date.parse(b.recordedAt) - Date.parse(a.recordedAt))
      .slice(0, 200);
    await writeStoredHistory(JSON.stringify(nextHistory));
    return nextHistory;
  });
  etfScoreSnapshotWriteQueue = queuedRestore.then(() => undefined, () => undefined);
  return queuedRestore;
}

export function buildEtfScoreHistory(
  symbol: string,
  current: EtfScoreSnapshot | null,
  history: readonly EtfScoreSnapshot[],
): EtfScoreHistoryEntry[] {
  const snapshots = (current ? upsertEtfScoreSnapshot(history, current) : [...history])
    .filter((snapshot) => sameEtfScoreSymbol(snapshot.symbol, symbol))
    .sort((a, b) => Date.parse(a.recordedAt) - Date.parse(b.recordedAt));

  return snapshots.map((snapshot, index) => {
    const previous = snapshots[index - 1];
    if (!previous) return { snapshot, status: "baseline" };

    const snapshotTime = Date.parse(snapshot.recordedAt);
    const previousTime = Date.parse(previous.recordedAt);
    if (!snapshotHasFreshInputs(snapshot, snapshotTime)) {
      return { snapshot, status: "stale-inputs" };
    }
    if (
      !Number.isFinite(snapshotTime)
      || !Number.isFinite(previousTime)
      || snapshotTime <= previousTime
      || snapshotTime - previousTime > ETF_SCORE_HISTORY_MAX_AGE_MS
      || !snapshotHasFreshInputs(previous, previousTime)
    ) {
      return { snapshot, status: "stale-history" };
    }

    if (getSnapshotMethodology(snapshot) !== getSnapshotMethodology(previous)) {
      return { snapshot, status: "methodology-changed" };
    }

    const sameCoverage = JSON.stringify([...snapshot.componentIds].sort())
      === JSON.stringify([...previous.componentIds].sort());
    const sameSources = snapshot.componentIds.every((id) =>
      snapshot.sourceContexts[id] === previous.sourceContexts[id],
    );
    if (!sameCoverage || !sameSources) {
      return { snapshot, status: "not-comparable" };
    }

    return {
      snapshot,
      status: "available",
      change: snapshot.score - previous.score,
      previousRecordedAt: previous.recordedAt,
    };
  });
}

export const ETF_SCORE_HISTORY_PAGE_SIZE = 10;

export function paginateEtfScoreHistory<T>(
  history: readonly T[],
  requestedPage: number,
): { entries: T[]; page: number; totalPages: number; start: number; end: number } {
  const totalPages = Math.ceil(history.length / ETF_SCORE_HISTORY_PAGE_SIZE);
  const page = totalPages === 0
    ? 0
    : Math.min(Math.max(0, Math.floor(requestedPage)), totalPages - 1);
  const newestFirst = [...history].reverse();
  const start = page * ETF_SCORE_HISTORY_PAGE_SIZE;
  const entries = newestFirst.slice(start, start + ETF_SCORE_HISTORY_PAGE_SIZE);

  return {
    entries,
    page,
    totalPages,
    start: history.length === 0 ? 0 : start + 1,
    end: start + entries.length,
  };
}

export function findComparableEtfScoreChange(
  current: EtfScoreSnapshot | null,
  history: readonly EtfScoreSnapshot[],
): EtfScoreChangeResult {
  if (!current) return { status: "stale-inputs" };
  const currentTime = Date.parse(current.recordedAt);
  if (!Number.isFinite(currentTime) || !snapshotHasFreshInputs(current, currentTime)) {
    return { status: "stale-inputs" };
  }

  const sameSymbol = history.filter((snapshot) =>
    sameEtfScoreSymbol(snapshot.symbol, current.symbol)
    && snapshot.recordedAt !== current.recordedAt,
  );
  if (!sameSymbol.some((snapshot) => !sameSnapshotAnalysis(snapshot, current))) {
    return { status: "first-analysis" };
  }

  const priorSnapshots = sameSymbol
    .filter((snapshot) => {
      const time = Date.parse(snapshot.recordedAt);
      return Number.isFinite(time)
        && time < currentTime
        && currentTime - time <= ETF_SCORE_HISTORY_MAX_AGE_MS
        && !sameSnapshotAnalysis(snapshot, current)
        && snapshotHasFreshInputs(snapshot, time);
    })
    .sort((a, b) => Date.parse(b.recordedAt) - Date.parse(a.recordedAt));

  const currentIds = [...current.componentIds].sort();
  const comparable = priorSnapshots.find((snapshot) =>
    getSnapshotMethodology(snapshot) === getSnapshotMethodology(current)
    && JSON.stringify([...snapshot.componentIds].sort()) === JSON.stringify(currentIds)
    && currentIds.every((id) => snapshot.sourceContexts[id] === current.sourceContexts[id]),
  );
  if (comparable) {
    return {
      status: "available",
      previousScore: comparable.score,
      change: current.score - comparable.score,
      previousRecordedAt: comparable.recordedAt,
    };
  }

  if (
    priorSnapshots[0]
    && getSnapshotMethodology(priorSnapshots[0]) !== getSnapshotMethodology(current)
  ) {
    return { status: "methodology-changed" };
  }
  if (priorSnapshots.length) return { status: "not-comparable" };
  return sameSymbol.some((snapshot) =>
    Date.parse(snapshot.recordedAt) < currentTime && !sameSnapshotAnalysis(snapshot, current),
  )
    ? { status: "stale-history" }
    : { status: "not-comparable" };
}

const clamp = (value: number) => Math.min(100, Math.max(0, value));
const validNonNegative = (value: number | null | undefined): value is number =>
  typeof value === "number" && Number.isFinite(value) && value >= 0;

function logBandScore(value: number, low: number, high: number) {
  return clamp(((Math.log10(value) - Math.log10(low)) / (Math.log10(high) - Math.log10(low))) * 100);
}

export function calculateEtfResearchScore(input: EtfScoreInput) {
  let sectorEntries = input.sectorWeights.filter((entry) =>
    entry.sector.trim()
    && Number.isFinite(entry.weight)
    && entry.weight > 0
    && entry.weight <= 1,
  );
  const sectorCoverage = sectorEntries.reduce((sum, entry) => sum + entry.weight, 0);
  if (sectorCoverage < 0.8) sectorEntries = [];
  const normalizedSectors = sectorEntries.map((entry) => entry.weight / sectorCoverage);
  const sectorHhi = normalizedSectors.reduce((sum, weight) => sum + weight ** 2, 0);

  const scoredAverageVolume = validNonNegative(input.averageVolume) && input.averageVolume > 0
    ? input.averageVolume
    : null;
  const scoredTotalAssets = validNonNegative(input.totalAssets) && input.totalAssets > 0
    ? input.totalAssets
    : null;
  const liquidityScores: number[] = [];
  if (scoredAverageVolume !== null) {
    liquidityScores.push(logBandScore(scoredAverageVolume, 10_000, 1_000_000));
  }
  const categoryAverageAssets = input.peerAssetSizeComparison?.categoryAverageTotalAssets;
  const hasPeerAssetBaseline = scoredTotalAssets !== null
    && validNonNegative(categoryAverageAssets)
    && categoryAverageAssets > 0;
  if (scoredTotalAssets !== null) {
    liquidityScores.push(hasPeerAssetBaseline
      ? clamp(50 * scoredTotalAssets / categoryAverageAssets)
      : logBandScore(scoredTotalAssets, 10_000_000, 1_000_000_000));
  }
  const liquidityInputDetail = `Inputs scored — average daily shares: ${
    scoredAverageVolume === null ? "Unavailable" : `${scoredAverageVolume.toLocaleString("en-US")} shares`
  }; fund assets: ${
    scoredTotalAssets === null ? "Unavailable" : `$${scoredTotalAssets.toLocaleString("en-US")}`
  }.`;

  const riskScores: number[] = [];
  if (validNonNegative(input.annualizedVolatility)) {
    riskScores.push(clamp((1 - input.annualizedVolatility / 0.6) * 100));
  }
  if (typeof input.maxDrawdown === "number" && Number.isFinite(input.maxDrawdown) && input.maxDrawdown <= 0) {
    riskScores.push(clamp((1 - Math.abs(input.maxDrawdown) / 0.75) * 100));
  }

  const components: EtfScoreComponent[] = [
    {
      id: "cost",
      label: "Cost vs category average",
      weight: 25,
      score: validNonNegative(input.expenseRatio)
        && typeof input.categoryAverageExpenseRatio === "number"
        && Number.isFinite(input.categoryAverageExpenseRatio)
        && input.categoryAverageExpenseRatio > 0
        ? clamp((1 - input.expenseRatio / (2 * input.categoryAverageExpenseRatio)) * 100)
        : null,
      detail: "At the provider category average scores 50; twice the average or more scores 0.",
    },
    {
      id: "performance",
      label: "Risk-adjusted performance",
      weight: 20,
      score: typeof input.riskAdjustedReturn === "number" && Number.isFinite(input.riskAdjustedReturn)
        ? clamp(((input.riskAdjustedReturn + 1) / 2) * 100)
        : null,
      detail: "Annualized return divided by annualized volatility, using a 0% risk-free proxy. Linear scoring maps −1 to 0, 0 to 50, and +1 to 100; values outside that range are capped. This is not Sharpe and is not peer-relative.",
    },
    {
      id: "diversification",
      label: "Reported sector diversification",
      weight: 20,
      score: sectorEntries.length >= 2 ? clamp((1 - sectorHhi) * 100) : null,
      detail: sectorEntries.length >= 2
        ? `Based on ${sectorEntries.length} provider-reported sectors covering ${(sectorCoverage * 100).toFixed(0)}% of the reported mix.`
        : "Unavailable unless reported sector weights cover at least 80% across two or more sectors.",
    },
    {
      id: "liquidity",
      label: "Liquidity",
      weight: 15,
      score: liquidityScores.length ? liquidityScores.reduce((sum, score) => sum + score, 0) / liquidityScores.length : null,
      detail: `${liquidityInputDetail} ${hasPeerAssetBaseline
        ? "Average daily shares use fixed 10K–1M bands; assets score 50 at the provider category average and scale linearly to 100 at 2×."
        : "Uses fixed log-scale bands: 10K–1M average daily shares and $10M–$1B assets; assets are not peer-relative."}`,
      ...(hasPeerAssetBaseline && input.peerAssetSizeComparison
        ? {
          peerContext: {
            category: input.peerAssetSizeComparison.category,
            categoryAverageTotalAssets: input.peerAssetSizeComparison.categoryAverageTotalAssets,
            sampleSize: input.peerAssetSizeComparison.sampleSize,
            sampleContext: input.peerAssetSizeComparison.sampleContext,
            source: input.peerAssetSizeComparison.source,
            asOf: input.peerAssetSizeComparison.asOf,
          },
        }
        : {}),
    },
    {
      id: "risk",
      label: "One-year risk",
      weight: 10,
      score: riskScores.length ? riskScores.reduce((sum, score) => sum + score, 0) / riskScores.length : null,
      detail: "Uses fixed bands: 60% annualized volatility and 75% maximum drawdown each score 0; not peer-relative.",
    },
  ];
  const available = components.filter((component) => component.score !== null);
  const availableWeight = available.reduce((sum, component) => sum + component.weight, 0);
  const score = available.length >= 3
    ? Math.round(available.reduce((sum, component) => sum + component.score! * component.weight, 0) / availableWeight)
    : null;

  return {
    score,
    availableComponents: available.length,
    components,
  };
}
