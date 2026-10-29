export interface HeatMapDetailStats {
  previousClose: number | null;
  open: number | null;
  dayLow: number | null;
  dayHigh: number | null;
  fiftyTwoWeekLow: number | null;
  fiftyTwoWeekHigh: number | null;
  volume: number | null;
  averageVolume: number | null;
  marketCap: number | null;
  beta: number | null;
  earningsTimestamp: number | null;
  targetMeanPrice: number | null;
  trailingEps: number | null;
  totalRevenue: number | null;
  circulatingSupply: number | null;
  maxSupply: number | null;
  maxSupplyStatus: 'capped' | 'uncapped' | 'unreported';
  maxSupplySource: string | null;
  maxSupplyConflict: boolean;
  volume24Hr: number | null;
  etfProfile: HeatMapEtfProfile | null;
}

export interface HeatMapCryptoSupplyPoint {
  date: string;
  supply: number;
}

export interface HeatMapCryptoSupplyChangeSummary {
  startDate: string;
  endDate: string;
  startSupply: number;
  endSupply: number;
  absoluteChange: number;
  percentChange: number;
}

export interface HeatMapCryptoSupplyDiscrepancy {
  currentSupply: number;
  historicalSupply: number;
  historicalDate: string;
  differencePercent: number;
}

export type HeatMapCryptoSupplyRangeDays = 30 | 90 | 365;

export const HEAT_MAP_CRYPTO_SUPPLY_RANGES = [
  { label: '1M', days: 30 },
  { label: '3M', days: 90 },
  { label: '1Y', days: 365 },
] as const satisfies readonly { label: string; days: HeatMapCryptoSupplyRangeDays }[];

export interface HeatMapEtfHolding {
  symbol: string;
  name: string;
  weight: number;
}

export interface HeatMapEtfHoldingSnapshot {
  symbol: string;
  retrievedAt: string;
  reportedPositionCount: number;
  holdings: HeatMapEtfHolding[];
}

export interface HeatMapEtfHoldingChange {
  symbol: string;
  name: string;
  previousWeight: number | null;
  currentWeight: number | null;
  change: 'added' | 'removed' | 'weight_changed';
}

export interface HeatMapEtfHoldingSnapshotComparison {
  previousRetrievedAt: string;
  currentRetrievedAt: string;
  reportedPositionCount: number;
  changes: HeatMapEtfHoldingChange[];
}

const MAX_ETF_HOLDING_SNAPSHOTS_PER_SYMBOL = 24;
const MAX_SAVED_ETF_HOLDING_SNAPSHOTS = 96;
const ETF_SYMBOL_PATTERN = /^[A-Z0-9.^=-]{1,20}$/;

function parseEtfSnapshotRetrievedAt(value: unknown): string | null {
  if (
    typeof value !== 'string'
    || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(value)
  ) {
    return null;
  }
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : null;
}

export function createEtfHoldingSnapshot(
  symbol: string,
  reportedPositionCount: number,
  retrievedAt: string | null,
  holdings: readonly HeatMapEtfHolding[],
): HeatMapEtfHoldingSnapshot | null {
  const normalizedSymbol = symbol.trim().toUpperCase();
  const normalizedRetrievedAt = parseEtfSnapshotRetrievedAt(retrievedAt);
  if (
    !ETF_SYMBOL_PATTERN.test(normalizedSymbol)
    || normalizedRetrievedAt === null
    || !Number.isInteger(reportedPositionCount)
    || reportedPositionCount < 1
    || holdings.length !== reportedPositionCount
  ) {
    return null;
  }

  const seenSymbols = new Set<string>();
  const normalizedHoldings: HeatMapEtfHolding[] = [];
  for (const holding of holdings) {
    const holdingSymbol = holding.symbol.trim().toUpperCase();
    const name = holding.name.trim();
    if (
      !ETF_SYMBOL_PATTERN.test(holdingSymbol)
      || !name
      || !Number.isFinite(holding.weight)
      || holding.weight < 0
      || holding.weight > 1
      || seenSymbols.has(holdingSymbol)
    ) {
      return null;
    }
    seenSymbols.add(holdingSymbol);
    normalizedHoldings.push({ symbol: holdingSymbol, name, weight: holding.weight });
  }

  return {
    symbol: normalizedSymbol,
    retrievedAt: normalizedRetrievedAt,
    reportedPositionCount,
    holdings: normalizedHoldings,
  };
}

export function parseSavedEtfHoldingSnapshots(value: string | null): HeatMapEtfHoldingSnapshot[] {
  if (!value) return [];
  try {
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];

    const snapshotsBySymbol = new Map<string, Map<string, HeatMapEtfHoldingSnapshot>>();
    for (const item of parsed.slice(0, MAX_SAVED_ETF_HOLDING_SNAPSHOTS * 4)) {
      const input = record(item);
      if (!input || !Array.isArray(input.holdings)) continue;
      const snapshot = createEtfHoldingSnapshot(
        typeof input.symbol === 'string' ? input.symbol : '',
        input.reportedPositionCount as number,
        typeof input.retrievedAt === 'string' ? input.retrievedAt : null,
        input.holdings.flatMap((holding): HeatMapEtfHolding[] => {
          const symbol = stringField(holding, 'symbol');
          const name = stringField(holding, 'name');
          const weight = numericField(holding, 'weight');
          return symbol && name && weight !== null
            ? [{ symbol, name, weight }]
            : [];
        }),
      );
      if (!snapshot) continue;
      const snapshots = snapshotsBySymbol.get(snapshot.symbol) ?? new Map();
      snapshots.set(snapshot.retrievedAt, snapshot);
      snapshotsBySymbol.set(snapshot.symbol, snapshots);
    }

    const result: HeatMapEtfHoldingSnapshot[] = [];
    for (const [symbol, snapshots] of snapshotsBySymbol) {
      const latest = [...snapshots.values()]
        .sort((first, second) => Date.parse(second.retrievedAt) - Date.parse(first.retrievedAt))
        .slice(0, MAX_ETF_HOLDING_SNAPSHOTS_PER_SYMBOL);
      result.push(...latest);
    }
    return result
      .sort((first, second) => Date.parse(second.retrievedAt) - Date.parse(first.retrievedAt))
      .slice(0, MAX_SAVED_ETF_HOLDING_SNAPSHOTS)
      .sort((first, second) =>
        first.symbol.localeCompare(second.symbol)
        || Date.parse(first.retrievedAt) - Date.parse(second.retrievedAt));
  } catch {
    return [];
  }
}

export function upsertSavedEtfHoldingSnapshot(
  snapshots: readonly HeatMapEtfHoldingSnapshot[],
  candidate: HeatMapEtfHoldingSnapshot,
): HeatMapEtfHoldingSnapshot[] {
  const normalizedCandidate = createEtfHoldingSnapshot(
    candidate.symbol,
    candidate.reportedPositionCount,
    candidate.retrievedAt,
    candidate.holdings,
  );
  if (!normalizedCandidate) return [...snapshots];

  const bySymbol = new Map<string, Map<string, HeatMapEtfHoldingSnapshot>>();
  for (const snapshot of [...snapshots, normalizedCandidate]) {
    const valid = createEtfHoldingSnapshot(
      snapshot.symbol,
      snapshot.reportedPositionCount,
      snapshot.retrievedAt,
      snapshot.holdings,
    );
    if (!valid) continue;
    const entries = bySymbol.get(valid.symbol) ?? new Map();
    entries.set(valid.retrievedAt, valid);
    bySymbol.set(valid.symbol, entries);
  }

  const result: HeatMapEtfHoldingSnapshot[] = [];
  for (const [symbol, entries] of bySymbol) {
    result.push(...[...entries.values()]
      .sort((first, second) => Date.parse(second.retrievedAt) - Date.parse(first.retrievedAt))
      .slice(0, MAX_ETF_HOLDING_SNAPSHOTS_PER_SYMBOL));
  }
  return result
    .sort((first, second) => Date.parse(second.retrievedAt) - Date.parse(first.retrievedAt))
    .slice(0, MAX_SAVED_ETF_HOLDING_SNAPSHOTS)
    .sort((first, second) =>
      first.symbol.localeCompare(second.symbol)
      || Date.parse(first.retrievedAt) - Date.parse(second.retrievedAt));
}

export function compareEtfHoldingSnapshots(
  current: HeatMapEtfHoldingSnapshot | null,
  savedSnapshots: readonly HeatMapEtfHoldingSnapshot[],
): HeatMapEtfHoldingSnapshotComparison | null {
  if (!current) return null;
  const validCurrent = createEtfHoldingSnapshot(
    current.symbol,
    current.reportedPositionCount,
    current.retrievedAt,
    current.holdings,
  );
  if (!validCurrent) return null;

  const previous = savedSnapshots
    .flatMap((snapshot) => {
      const valid = createEtfHoldingSnapshot(
        snapshot.symbol,
        snapshot.reportedPositionCount,
        snapshot.retrievedAt,
        snapshot.holdings,
      );
      return valid
        && valid.symbol === validCurrent.symbol
        && valid.reportedPositionCount === validCurrent.reportedPositionCount
        && Date.parse(valid.retrievedAt) < Date.parse(validCurrent.retrievedAt)
        ? [valid]
        : [];
    })
    .sort((first, second) => Date.parse(second.retrievedAt) - Date.parse(first.retrievedAt))[0];
  if (!previous) return null;

  const previousHoldings = new Map(previous.holdings.map((holding) => [holding.symbol, holding]));
  const currentHoldings = new Map(validCurrent.holdings.map((holding) => [holding.symbol, holding]));
  const symbols = new Set([...previousHoldings.keys(), ...currentHoldings.keys()]);
  const changes: HeatMapEtfHoldingChange[] = [];
  for (const symbol of symbols) {
    const before = previousHoldings.get(symbol);
    const after = currentHoldings.get(symbol);
    if (!before && after) {
      changes.push({
        symbol,
        name: after.name,
        previousWeight: null,
        currentWeight: after.weight,
        change: 'added',
      });
    } else if (before && !after) {
      changes.push({
        symbol,
        name: before.name,
        previousWeight: before.weight,
        currentWeight: null,
        change: 'removed',
      });
    } else if (before && after && before.weight !== after.weight) {
      changes.push({
        symbol,
        name: after.name,
        previousWeight: before.weight,
        currentWeight: after.weight,
        change: 'weight_changed',
      });
    }
  }

  return {
    previousRetrievedAt: previous.retrievedAt,
    currentRetrievedAt: validCurrent.retrievedAt,
    reportedPositionCount: validCurrent.reportedPositionCount,
    changes: changes.sort((first, second) => first.symbol.localeCompare(second.symbol)),
  };
}

export interface HeatMapEtfSectorWeight {
  sector: string;
  weight: number;
}

export interface HeatMapEtfRegimePeriod {
  averageAnnualReturn: number | null;
  years: number;
}

export interface HeatMapEtfMarketRegime {
  bestRegime: 'bull' | 'bear' | 'mixed' | null;
  lookbackYears: number;
  firstYear: number;
  lastYear: number;
  benchmarkSymbol: string;
  bullThreshold: number;
  bearThreshold: number;
  periods: {
    bull: HeatMapEtfRegimePeriod;
    bear: HeatMapEtfRegimePeriod;
    mixed: HeatMapEtfRegimePeriod;
  };
}

export interface HeatMapEtfProfile {
  fundCategory: string | null;
  fundFamily: string | null;
  expenseRatio: number | null;
  totalAssets: number | null;
  dividendYield: number | null;
  beta3Year: number | null;
  largestSector: string | null;
  largestSectorWeight: number | null;
  sectorWeights: HeatMapEtfSectorWeight[];
  sectorWeightsRetrievedAt: string | null;
  topHoldings: HeatMapEtfHolding[];
  topHoldingsReportedCount: number;
  topHoldingsRetrievedAt: string | null;
  marketRegime: HeatMapEtfMarketRegime | null;
}

export type EtfComparisonValueFormat = 'percent' | 'assets' | 'number' | 'basis-points';

export function formatEtfComparisonValue(
  value: number | null | undefined,
  format: EtfComparisonValueFormat,
): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 'Unavailable';
  if (format === 'percent') return `${(value * 100).toFixed(2)}%`;
  if (format === 'basis-points') return `${(value * 10_000).toFixed(1)} bps`;
  if (format === 'number') return value.toFixed(2);
  if (value >= 1e12) return `$${(value / 1e12).toFixed(2)}T`;
  if (value >= 1e9) return `$${(value / 1e9).toFixed(2)}B`;
  if (value >= 1e6) return `$${(value / 1e6).toFixed(1)}M`;
  return `$${value.toLocaleString('en-US')}`;
}

export function getReportedEtfSectorComparison(
  funds: Array<{ symbol: string; sectorWeights: readonly HeatMapEtfSectorWeight[] }>,
) {
  const sectorNames = new Set<string>();
  const byFund = funds.map((fund) => {
    const weights = new Map<string, number>();
    for (const entry of fund.sectorWeights) {
      if (
        entry.sector.trim()
        && Number.isFinite(entry.weight)
        && entry.weight >= 0
        && entry.weight <= 1
        && !weights.has(entry.sector)
      ) {
        weights.set(entry.sector, entry.weight);
        sectorNames.add(entry.sector);
      }
    }
    return { symbol: fund.symbol, weights };
  });

  return [...sectorNames].sort((a, b) => a.localeCompare(b)).map((sector) => ({
    sector,
    funds: byFund.map(({ symbol, weights }) => ({
      symbol,
      weight: weights.get(sector) ?? null,
    })),
  }));
}

export function findReportedEtfHoldingsOverlap(
  funds: Array<{ symbol: string; topHoldings: readonly HeatMapEtfHolding[] }>,
) {
  const positions = new Map<string, Array<{ fundSymbol: string; name: string; weight: number }>>();
  for (const fund of funds) {
    for (const holding of fund.topHoldings) {
      const entries = positions.get(holding.symbol) ?? [];
      entries.push({ fundSymbol: fund.symbol, name: holding.name, weight: holding.weight });
      positions.set(holding.symbol, entries);
    }
  }
  return [...positions.entries()]
    .filter(([, entries]) => entries.length > 1)
    .map(([symbol, entries]) => ({ symbol, positions: entries }));
}

export function formatReportedEtfHoldingsOverlapShare(
  funds: readonly {
    symbol: string;
    topHoldingsRetrievedAt: string | null;
    sectorWeightsRetrievedAt?: string | null;
    sectorWeights?: readonly HeatMapEtfSectorWeight[];
    expenseRatio?: number | null;
  }[],
  overlaps: readonly {
    symbol: string;
    positions: readonly { fundSymbol: string; name: string; weight: number }[];
  }[],
): string {
  const lines = [
    'ETF comparison summary',
    `Funds: ${funds.map((fund) => fund.symbol.toUpperCase()).join(', ')}`,
    'Provider snapshot retrieval times (UTC):',
    ...funds.map((fund) => {
      const retrievedAt = fund.topHoldingsRetrievedAt;
      const timestamp = retrievedAt ? Date.parse(retrievedAt) : Number.NaN;
      const formattedTime = Number.isFinite(timestamp)
        ? new Date(timestamp).toISOString()
        : 'unavailable';
      return `- ${fund.symbol.toUpperCase()}: ${formattedTime}`;
    }),
    'Provider sector and expense data (Yahoo Finance; retrieval times in UTC):',
    ...funds.map((fund) => {
      const retrievedAt = fund.sectorWeightsRetrievedAt;
      const timestamp = retrievedAt ? Date.parse(retrievedAt) : Number.NaN;
      const formattedTime = Number.isFinite(timestamp)
        ? new Date(timestamp).toISOString()
        : 'unavailable';
      return `- ${fund.symbol.toUpperCase()}: ${formattedTime}`;
    }),
    'Common reported holdings:',
  ];

  if (overlaps.length) {
    lines.push(...overlaps.map(({ symbol, positions }) => {
      const name = positions[0]?.name ?? symbol;
      const weights = positions
        .map((position) => `${position.fundSymbol.toUpperCase()} ${(position.weight * 100).toFixed(2)}%`)
        .join(' · ');
      return `- ${name} (${symbol.toUpperCase()}): ${weights}`;
    }));
  } else {
    lines.push('- No shared positions among the reported holdings.');
  }

  const sectorComparison = getReportedEtfSectorComparison(funds.map((fund) => ({
    symbol: fund.symbol,
    sectorWeights: fund.sectorWeights ?? [],
  })));
  lines.push('Reported sector weights:');
  if (sectorComparison.length) {
    lines.push(...sectorComparison.map(({ sector, funds: sectorFunds }) =>
      `- ${sector}: ${sectorFunds.map(({ symbol, weight }) =>
        `${symbol.toUpperCase()} ${weight === null ? 'unavailable' : `${(weight * 100).toFixed(2)}%`}`,
      ).join(' · ')}`,
    ));
  } else {
    lines.push('- Unavailable for all selected funds.');
  }

  lines.push('Expense ratios (annual operating cost):');
  lines.push(...funds.map((fund) => {
    const expenseRatio = fund.expenseRatio;
    const verifiedRatio = typeof expenseRatio === 'number'
      && Number.isFinite(expenseRatio)
      && expenseRatio >= 0
      && expenseRatio <= 1
      ? expenseRatio
      : null;
    return `- ${fund.symbol.toUpperCase()}: ${verifiedRatio === null
      ? 'unavailable'
      : `${(verifiedRatio * 100).toFixed(2)}% ($${(verifiedRatio * 10_000).toFixed(2)}/year per $10,000)`}`;
  }));

  lines.push(
    'Coverage note: Overlap includes only positions reported by the provider and does not represent complete ETF portfolios.',
    'Sector weights include only reported values; unavailable values are not zero.',
    'Expense ratios are provider-reported annual fund costs, not a guarantee of total investment cost.',
  );
  return lines.join('\n');
}

export type EtfOverlapShareResult =
  | 'shared'
  | 'copied'
  | 'manual-copy'
  | 'unavailable'
  | 'cancelled'
  | 'failed';

export async function shareEtfOverlapSummary(options: {
  platform: 'web' | 'native';
  message: string;
  webShare?: (data: { title: string; text: string }) => Promise<unknown>;
  clipboardWriteText?: (text: string) => Promise<void>;
  nativeShare?: (data: { title: string; message: string }) => Promise<'shared' | 'dismissed'>;
}): Promise<EtfOverlapShareResult> {
  const title = 'ETF comparison summary';

  if (options.platform === 'native') {
    if (!options.nativeShare) return 'unavailable';
    try {
      const result = await options.nativeShare({ title, message: options.message });
      return result === 'dismissed' ? 'cancelled' : 'shared';
    } catch (error) {
      return error instanceof Error && error.name === 'AbortError' ? 'cancelled' : 'failed';
    }
  }

  if (!options.webShare && !options.clipboardWriteText) return 'manual-copy';
  if (options.webShare) {
    try {
      await options.webShare({ title, text: options.message });
      return 'shared';
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') return 'cancelled';
      if (!options.clipboardWriteText) return 'manual-copy';
    }
  }

  if (!options.clipboardWriteText) return 'manual-copy';
  try {
    await options.clipboardWriteText(options.message);
    return 'copied';
  } catch {
    return 'manual-copy';
  }
}

export function parseSavedEtfComparisonSymbols(value: string | null): string[] {
  if (!value) return [];
  try {
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];
    const symbols = parsed.flatMap((item): string[] => {
      if (typeof item !== 'string') return [];
      const symbol = item.trim().toUpperCase();
      return /^[A-Z0-9.^=-]{1,20}$/.test(symbol) ? [symbol] : [];
    });
    return [...new Set(symbols)].slice(0, 3);
  } catch {
    return [];
  }
}

export type HeatMapDetailAssetType =
  | 'stock'
  | 'etf'
  | 'commodity'
  | 'future'
  | 'cryptocurrency';

interface StatDefinition {
  label: string;
  key: Exclude<
    keyof HeatMapDetailStats,
    'etfProfile' | 'maxSupplyStatus' | 'maxSupplySource' | 'maxSupplyConflict'
  >;
  format: 'price' | 'compact' | 'currency' | 'number' | 'date';
}

export interface HeatMapDetailStatRow {
  label: string;
  value: string;
  detail?: string;
}

function numericField(value: unknown, key: string): number | null {
  const candidate = record(value)?.[key];
  return typeof candidate === 'number' && Number.isFinite(candidate)
    ? candidate
    : null;
}

function nonNegativeNumericField(value: unknown, key: string): number | null {
  const candidate = numericField(value, key);
  return candidate !== null && candidate >= 0 ? candidate : null;
}

function maxSupplyStatusField(value: unknown): HeatMapDetailStats['maxSupplyStatus'] {
  const candidate = record(value)?.maxSupplyStatus;
  return candidate === 'capped' || candidate === 'uncapped'
    ? candidate
    : 'unreported';
}

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function isIsoDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const timestamp = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString().slice(0, 10) === value;
}
function stringField(value: unknown, key: string): string | null {
  const candidate = record(value)?.[key];
  return typeof candidate === 'string' && candidate.trim()
    ? candidate.trim()
    : null;
}

function parseRegimePeriod(value: unknown): HeatMapEtfRegimePeriod {
  const input = record(value);
  const years = input?.years;
  return {
    averageAnnualReturn: numericField(input, 'averageAnnualReturn'),
    years: typeof years === 'number' && Number.isFinite(years) && years > 0
      ? Math.floor(years)
      : 0,
  };
}

function parseEtfMarketRegime(value: unknown): HeatMapEtfMarketRegime | null {
  const input = record(value);
  const periods = record(input?.periods);
  if (!input || !periods) return null;

  const best = input.bestRegime;
  return {
    bestRegime: best === 'bull' || best === 'bear' || best === 'mixed' ? best : null,
    lookbackYears: numericField(input, 'lookbackYears') ?? 0,
    firstYear: numericField(input, 'firstYear') ?? 0,
    lastYear: numericField(input, 'lastYear') ?? 0,
    benchmarkSymbol: stringField(input, 'benchmarkSymbol') ?? 'SPY',
    bullThreshold: numericField(input, 'bullThreshold') ?? 0.1,
    bearThreshold: numericField(input, 'bearThreshold') ?? -0.1,
    periods: {
      bull: parseRegimePeriod(periods.bull),
      bear: parseRegimePeriod(periods.bear),
      mixed: parseRegimePeriod(periods.mixed),
    },
  };
}

function parseEtfProfile(value: unknown): HeatMapEtfProfile | null {
  const input = record(value);
  if (!input) return null;

  const topHoldings = Array.isArray(input.topHoldings)
    ? input.topHoldings.flatMap((holding): HeatMapEtfHolding[] => {
      const symbol = stringField(holding, 'symbol');
      const name = stringField(holding, 'name');
      const weight = numericField(holding, 'weight');
      return symbol && name && weight !== null && weight >= 0 && weight <= 1
        ? [{ symbol, name, weight }]
        : [];
    })
    : [];
  const sectorWeights = Array.isArray(input.sectorWeights)
    ? input.sectorWeights.flatMap((entry): HeatMapEtfSectorWeight[] => {
      const sector = stringField(entry, 'sector');
      const weight = numericField(entry, 'weight');
      return sector && weight !== null && weight >= 0 && weight <= 1
        ? [{ sector, weight }]
        : [];
    })
    : [];

  return {
    fundCategory: stringField(input, 'fundCategory'),
    fundFamily: stringField(input, 'fundFamily'),
    expenseRatio: numericField(input, 'expenseRatio'),
    totalAssets: numericField(input, 'totalAssets'),
    dividendYield: numericField(input, 'dividendYield'),
    beta3Year: numericField(input, 'beta3Year'),
    largestSector: stringField(input, 'largestSector'),
    largestSectorWeight: numericField(input, 'largestSectorWeight'),
    sectorWeights,
    sectorWeightsRetrievedAt: stringField(input, 'sectorWeightsRetrievedAt'),
    topHoldings,
    topHoldingsReportedCount: nonNegativeNumericField(input, 'topHoldingsReportedCount')
      ?? topHoldings.length,
    topHoldingsRetrievedAt: stringField(input, 'topHoldingsRetrievedAt'),
    marketRegime: parseEtfMarketRegime(input.marketRegime),
  };
}

export function parseHeatMapDetailStats(value: unknown): HeatMapDetailStats | null {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return null;

  return {
    previousClose: numericField(value, 'previousClose'),
    open: numericField(value, 'open'),
    dayLow: numericField(value, 'dayLow'),
    dayHigh: numericField(value, 'dayHigh'),
    fiftyTwoWeekLow: numericField(value, 'fiftyTwoWeekLow'),
    fiftyTwoWeekHigh: numericField(value, 'fiftyTwoWeekHigh'),
    volume: numericField(value, 'volume'),
    averageVolume: numericField(value, 'averageVolume3Month'),
    marketCap: nonNegativeNumericField(value, 'marketCap'),
    beta: numericField(value, 'beta'),
    earningsTimestamp: numericField(value, 'earningsTimestamp'),
    targetMeanPrice: numericField(value, 'targetMeanPrice'),
    trailingEps: numericField(value, 'trailingEps'),
    totalRevenue: numericField(value, 'totalRevenue'),
    circulatingSupply: nonNegativeNumericField(value, 'circulatingSupply'),
    maxSupply: numericField(value, 'maxSupply'),
    maxSupplyStatus: maxSupplyStatusField(value),
    maxSupplySource: stringField(value, 'maxSupplySource'),
    maxSupplyConflict: record(value)?.maxSupplyConflict === true,
    volume24Hr: nonNegativeNumericField(value, 'volume24Hr'),
    etfProfile: parseEtfProfile((value as Record<string, unknown>).etfProfile),
  };
}

export function parseHeatMapCryptoSupplyHistory(value: unknown): HeatMapCryptoSupplyHistory | null {
  const input = record(value);
  const rangeDays = input?.rangeDays;
  if (
    !input
    || input.provider !== 'Coin Metrics'
    || input.metric !== 'SplyCur'
    || (rangeDays !== 30 && rangeDays !== 90 && rangeDays !== 365)
    || input.interval !== 'daily'
    || typeof input.symbol !== 'string'
    || !Array.isArray(input.points)
    || input.points.length > rangeDays + 1
  ) {
    return null;
  }

  const pointsByDate = new Map<string, number>();
  for (const item of input.points) {
    const point = record(item);
    if (
      !point
      || !isIsoDate(point.date)
      || typeof point.supply !== 'number'
      || !Number.isFinite(point.supply)
      || point.supply <= 0
    ) {
      continue;
    }
    pointsByDate.set(point.date, point.supply);
  }

  const points = [...pointsByDate.entries()]
    .sort(([firstDate], [secondDate]) => firstDate.localeCompare(secondDate))
    .map(([date, supply]) => ({ date, supply }));

  return {
    symbol: input.symbol,
    provider: 'Coin Metrics',
    metric: 'SplyCur',
    rangeDays,
    interval: 'daily',
    startDate: points[0]?.date ?? null,
    endDate: points.at(-1)?.date ?? null,
    points,
  };
}
function formatCompact(value: number, currency = false) {
  const absolute = Math.abs(value);
  const suffix = absolute >= 1e12 ? 'T'
    : absolute >= 1e9 ? 'B'
      : absolute >= 1e6 ? 'M'
        : absolute >= 1e3 ? 'K'
          : '';
  const divisor = suffix === 'T' ? 1e12
    : suffix === 'B' ? 1e9
      : suffix === 'M' ? 1e6
        : suffix === 'K' ? 1e3
          : 1;
  const amount = value / divisor;
  const formatted = suffix
    ? amount.toLocaleString('en-US', { maximumFractionDigits: 2 })
    : amount.toLocaleString('en-US', { maximumFractionDigits: 0 });
  return `${currency ? '$' : ''}${formatted}${suffix}`;
}

export function formatHeatMapCompact(value: number): string {
  return formatCompact(value);
}
function formatDate(timestamp: number) {
  if (timestamp <= 0) return '—';
  const date = new Date(timestamp * 1000);
  return Number.isNaN(date.getTime())
    ? '—'
    : date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

const CRYPTO_STAT_DEFINITIONS: StatDefinition[] = [
  { label: 'Circulating Supply', key: 'circulatingSupply', format: 'compact' },
  { label: 'Max Supply', key: 'maxSupply', format: 'compact' },
  { label: '24h Volume', key: 'volume24Hr', format: 'currency' },
  { label: 'Market Cap', key: 'marketCap', format: 'currency' },
];

const STOCK_STAT_DEFINITIONS: StatDefinition[] = [
  { label: 'Previous Close', key: 'previousClose', format: 'price' },
  { label: 'Open', key: 'open', format: 'price' },
  { label: 'Volume', key: 'volume', format: 'compact' },
  { label: 'Avg. Volume (3M)', key: 'averageVolume', format: 'compact' },
  { label: 'Market Cap', key: 'marketCap', format: 'currency' },
  { label: 'Beta', key: 'beta', format: 'number' },
  { label: 'Earnings Date', key: 'earningsTimestamp', format: 'date' },
  { label: '1y Target Est.', key: 'targetMeanPrice', format: 'price' },
  { label: 'EPS (TTM)', key: 'trailingEps', format: 'price' },
  { label: 'Revenue (TTM)', key: 'totalRevenue', format: 'currency' },
];

const COMMODITY_STAT_DEFINITIONS: StatDefinition[] = [
  { label: 'Previous Close', key: 'previousClose', format: 'price' },
  { label: 'Open', key: 'open', format: 'price' },
  { label: 'Volume', key: 'volume', format: 'compact' },
  { label: 'Avg. Volume (3M)', key: 'averageVolume', format: 'compact' },
];

function formatPercent(decimal: number, signed = false) {
  const percentage = decimal * 100;
  const minimumFractionDigits = Math.abs(percentage) < 0.1 ? 2 : 0;
  const maximumFractionDigits = Math.abs(percentage) < 0.1 ? 4 : 2;
  const formatted = Math.abs(percentage).toLocaleString('en-US', {
    minimumFractionDigits,
    maximumFractionDigits,
  });
  return `${signed && percentage > 0 ? '+' : percentage < 0 ? '-' : ''}${formatted}%`;
}

function getCirculatingSupplySharePercent(
  circulatingSupply: number | null,
  maxSupply: number | null,
): number | null {
  if (
    circulatingSupply === null
    || maxSupply === null
    || !Number.isFinite(circulatingSupply)
    || !Number.isFinite(maxSupply)
    || circulatingSupply <= 0
    || maxSupply <= 0
    || circulatingSupply > maxSupply
  ) {
    return null;
  }

  const percentage = (circulatingSupply / maxSupply) * 100;
  return Number.isFinite(percentage) ? percentage : null;
}

function formatDollars(value: number) {
  return `$${value.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function getEtfStatRows(
  profile: HeatMapEtfProfile | null,
  loading: boolean,
): { label: string; value: string }[] {
  const absentValue = loading && !profile ? 'Loading…' : 'Not reported';
  const expenseRatio = profile?.expenseRatio;
  return [
    { label: 'Fund category', value: profile?.fundCategory ?? absentValue },
    { label: 'Fund family', value: profile?.fundFamily ?? absentValue },
    {
      label: 'Largest sector exposure',
      value: profile?.largestSector
        ? `${profile.largestSector}${profile.largestSectorWeight === null ? '' : ` · ${formatPercent(profile.largestSectorWeight)}`}`
        : absentValue,
    },
    {
      label: 'Expense ratio',
      value: expenseRatio === null || expenseRatio === undefined
        ? absentValue
        : formatPercent(expenseRatio),
    },
    {
      label: 'Annual cost per $10K',
      value: expenseRatio === null || expenseRatio === undefined
        ? absentValue
        : formatDollars(expenseRatio * 10_000),
    },
    {
      label: 'Fund size (AUM)',
      value: profile?.totalAssets === null || profile?.totalAssets === undefined
        ? absentValue
        : formatCompact(profile.totalAssets, true),
    },
    {
      label: 'Distribution yield',
      value: profile?.dividendYield === null || profile?.dividendYield === undefined
        ? absentValue
        : formatPercent(profile.dividendYield),
    },
    {
      label: '3-year beta',
      value: profile?.beta3Year === null || profile?.beta3Year === undefined
        ? absentValue
        : profile.beta3Year.toFixed(2),
    },
  ];
}

export function getHeatMapDetailStatRows(
  assetType: HeatMapDetailAssetType,
  stats: HeatMapDetailStats | null,
  marketCapFallback: number | null,
  loading: boolean,
): HeatMapDetailStatRow[] {
  if (assetType === 'etf') {
    return getEtfStatRows(stats?.etfProfile ?? null, loading);
  }

  const definitions = assetType === 'cryptocurrency'
    ? CRYPTO_STAT_DEFINITIONS
    : assetType === 'commodity'
      ? COMMODITY_STAT_DEFINITIONS
    : STOCK_STAT_DEFINITIONS;

  const rows = definitions.map(({ label, key, format }) => {
    if (key === 'maxSupply') {
      if (!stats) return { label, value: loading ? 'Loading…' : 'Unavailable' };
      const maxSupply = stats.maxSupply;
      const hasConfirmedSupply = stats.maxSupplyStatus === 'uncapped'
        || (
          stats.maxSupplyStatus === 'capped'
          && maxSupply !== null
          && Number.isFinite(maxSupply)
          && maxSupply > 0
        );
      const source = hasConfirmedSupply ? stats.maxSupplySource : null;
      const detail = stats.maxSupplyConflict
        && hasConfirmedSupply
        ? `Sources disagree; showing ${source ?? 'the reported value'}.`
        : source ? `Source: ${source}` : undefined;
      const row = (value: string): HeatMapDetailStatRow => ({
        label,
        value,
        ...(detail ? { detail } : {}),
      });
      if (stats.maxSupplyStatus === 'uncapped') return row('No fixed cap');

      if (
        stats.maxSupplyStatus === 'capped'
        && maxSupply !== null
        && Number.isFinite(maxSupply)
        && maxSupply > 0
      ) {
        return row(formatCompact(maxSupply));
      }
      return { label, value: 'Not reported' };
    }

    const rawValue = key === 'marketCap'
      ? stats?.marketCap ?? marketCapFallback
      : stats?.[key] ?? null;
    if (
      rawValue === null
      || !Number.isFinite(rawValue)
      || (key === 'marketCap' && rawValue < 0)
    ) {
      return { label, value: !stats && loading ? 'Loading…' : '—' };
    }

    switch (format) {
      case 'price': {
        const absolute = Math.abs(rawValue);
        const fractionDigits = absolute >= 1 ? 2 : absolute >= 0.01 ? 4 : 6;
        const sign = rawValue < 0 ? '-' : '';
        return {
          label,
          value: `${sign}$${absolute.toLocaleString('en-US', {
            minimumFractionDigits: fractionDigits,
            maximumFractionDigits: fractionDigits,
          })}`,
        };
      }
      case 'compact':
        return { label, value: formatCompact(rawValue) };
      case 'currency':
        return { label, value: formatCompact(rawValue, true) };
      case 'number':
        return { label, value: rawValue.toFixed(2) };
      case 'date':
        return { label, value: formatDate(rawValue) };
    }
  });

  if (assetType === 'commodity') {
    if (!stats) return loading ? rows : [];
    return rows.filter(({ value }) => value !== '—');
  }

  if (assetType !== 'cryptocurrency') return rows;

  const hasCirculatingSupplyOverReportedCap = stats?.maxSupplyStatus === 'capped'
    && stats.circulatingSupply !== null
    && Number.isFinite(stats.circulatingSupply)
    && stats.maxSupply !== null
    && Number.isFinite(stats.maxSupply)
    && stats.maxSupply > 0
    && stats.circulatingSupply > stats.maxSupply;
  if (hasCirculatingSupplyOverReportedCap) {
    const circulatingSupplyRow = rows.find(({ label }) => label === 'Circulating Supply');
    if (circulatingSupplyRow) {
      circulatingSupplyRow.detail = 'Reported circulating supply exceeds the fixed maximum; circulating share is omitted.';
    }
  }

  const circulatingShare = stats?.maxSupplyConflict
    ? null
    : getCirculatingSupplySharePercent(
      stats?.circulatingSupply ?? null,
      stats?.maxSupply ?? null,
    );
  if (circulatingShare === null) return rows;

  const maxSupplyIndex = rows.findIndex(({ label }) => label === 'Max Supply');
  rows.splice(maxSupplyIndex + 1, 0, {
    label: 'Circulating share',
    value: formatPercent(circulatingShare / 100),
  });
  return rows;
}

export function formatHeatMapRegimeReturn(value: number | null): string {
  return value === null || !Number.isFinite(value)
    ? '—'
    : formatPercent(value, true);
}

export function getHeatMapRangePosition(
  currentPrice: number,
  low: number | null,
  high: number | null,
): number | null {
  if (
    !Number.isFinite(currentPrice)
    || low === null
    || high === null
    || !Number.isFinite(low)
    || !Number.isFinite(high)
    || high <= low
  ) {
    return null;
  }

  return Math.max(0, Math.min(100, ((currentPrice - low) / (high - low)) * 100));
}

export interface HeatMapCryptoSupplyChartModel {
  points: (HeatMapCryptoSupplyPoint & { x: number; y: number })[];
  segments: string[];
  minSupply: number;
  maxSupply: number;
}

const CRYPTO_SUPPLY_CHART_GAP_MS = 36 * 60 * 60 * 1000;

export function getHeatMapCryptoSupplyChartModel(
  points: HeatMapCryptoSupplyPoint[],
): HeatMapCryptoSupplyChartModel | null {
  if (points.length < 2) return null;

  const datedPoints = points.flatMap((point) => {
    const timestamp = Date.parse(`${point.date}T00:00:00Z`);
    return Number.isFinite(timestamp) ? [{ ...point, timestamp }] : [];
  });
  if (datedPoints.length < 2) return null;

  const minSupply = Math.min(...datedPoints.map(({ supply }) => supply));
  const maxSupply = Math.max(...datedPoints.map(({ supply }) => supply));
  const actualSpan = maxSupply - minSupply;
  const padding = actualSpan > 0
    ? actualSpan * 0.08
    : Math.max(Math.abs(maxSupply) * 0.002, 1e-9);
  const domainMin = minSupply - padding;
  const domainMax = maxSupply + padding;
  const firstTimestamp = datedPoints[0]!.timestamp;
  const lastTimestamp = datedPoints.at(-1)!.timestamp;
  const timeSpan = Math.max(1, lastTimestamp - firstTimestamp);
  const valueSpan = Math.max(Number.MIN_VALUE, domainMax - domainMin);
  const left = 12;
  const right = CRYPTO_SUPPLY_CHART_WIDTH - 12;
  const top = 8;
  const bottom = CRYPTO_SUPPLY_CHART_HEIGHT - 8;
  const chartPoints = datedPoints.map(({ date, supply, timestamp }) => ({
    date,
    supply,
    timestamp,
    x: left + ((timestamp - firstTimestamp) / timeSpan) * (right - left),
    y: bottom - ((supply - domainMin) / valueSpan) * (bottom - top),
  }));

  const segments: string[] = [];
  let segment = '';
  let previousTimestamp: number | null = null;
  for (const point of chartPoints) {
    const command = previousTimestamp === null || point.timestamp - previousTimestamp > CRYPTO_SUPPLY_CHART_GAP_MS
      ? 'M'
      : 'L';
    if (command === 'M' && segment) {
      segments.push(segment);
      segment = '';
    }
    segment += `${command}${point.x.toFixed(1)},${point.y.toFixed(1)} `;
    previousTimestamp = point.timestamp;
  }
  if (segment) segments.push(segment.trim());

  return {
    points: chartPoints.map(({ date, supply, x, y }) => ({ date, supply, x, y })),
    segments,
    minSupply,
    maxSupply,
  };
}

const CRYPTO_SUPPLY_CHART_WIDTH = 320;

export interface HeatMapCryptoSupplyHistory {
  symbol: string;
  provider: 'Coin Metrics';
  metric: 'SplyCur';
  rangeDays: HeatMapCryptoSupplyRangeDays;
  interval: 'daily';
  startDate: string | null;
  endDate: string | null;
  points: HeatMapCryptoSupplyPoint[];
}

const CRYPTO_SUPPLY_CHART_HEIGHT = 112;
// This is a cross-provider materiality cue, not a protocol issuance threshold.
// Yahoo's live circulatingSupply and Coin Metrics SplyCur do not promise
// identical definitions across assets, so per-asset cutoffs would imply
// undocumented source calibration rather than account for normal issuance.
const CRYPTO_SUPPLY_DISCREPANCY_THRESHOLD_PERCENT = 5;
const CRYPTO_SUPPLY_HISTORY_MAX_AGE_DAYS = 7;

export function getHeatMapCryptoSupplyChangeSummary(
  points: HeatMapCryptoSupplyPoint[],
): HeatMapCryptoSupplyChangeSummary | null {
  const pointsByDate = new Map<string, number>();
  for (const point of points) {
    if (
      isIsoDate(point.date)
      && Number.isFinite(point.supply)
      && point.supply > 0
    ) {
      pointsByDate.set(point.date, point.supply);
    }
  }

  const observations = [...pointsByDate.entries()]
    .sort(([firstDate], [secondDate]) => firstDate.localeCompare(secondDate));
  if (observations.length < 2) return null;

  const [startDate, startSupply] = observations[0]!;
  const [endDate, endSupply] = observations.at(-1)!;
  const absoluteChange = endSupply - startSupply;
  const percentChange = (absoluteChange / startSupply) * 100;
  if (!Number.isFinite(percentChange)) return null;

  return {
    startDate,
    endDate,
    startSupply,
    endSupply,
    absoluteChange,
    percentChange,
  };
}

export function getHeatMapCryptoSupplyDiscrepancy(
  currentSupply: number | null,
  points: HeatMapCryptoSupplyPoint[],
  asOfDate = new Date().toISOString().slice(0, 10),
): HeatMapCryptoSupplyDiscrepancy | null {
  if (
    currentSupply === null
    || !Number.isFinite(currentSupply)
    || currentSupply <= 0
    || !isIsoDate(asOfDate)
  ) {
    return null;
  }

  const asOfTimestamp = Date.parse(`${asOfDate}T00:00:00Z`);
  const recentPoints = points.filter((point) => {
    if (!isIsoDate(point.date) || !Number.isFinite(point.supply) || point.supply <= 0) return false;
    const ageDays = (asOfTimestamp - Date.parse(`${point.date}T00:00:00Z`)) / 86_400_000;
    return ageDays >= 0 && ageDays <= CRYPTO_SUPPLY_HISTORY_MAX_AGE_DAYS;
  });
  const historicalPoint = recentPoints.reduce<HeatMapCryptoSupplyPoint | null>(
    (latest, point) => !latest || point.date > latest.date ? point : latest,
    null,
  );
  if (!historicalPoint) return null;

  const differencePercent = (Math.abs(currentSupply - historicalPoint.supply) / historicalPoint.supply) * 100;
  if (!Number.isFinite(differencePercent) || differencePercent <= CRYPTO_SUPPLY_DISCREPANCY_THRESHOLD_PERCENT) {
    return null;
  }

  return {
    currentSupply,
    historicalSupply: historicalPoint.supply,
    historicalDate: historicalPoint.date,
    differencePercent,
  };
}
