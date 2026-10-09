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
  volume24Hr: number | null;
  etfProfile: HeatMapEtfProfile | null;
}

export interface HeatMapEtfHolding {
  symbol: string;
  name: string;
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
  topHoldings: HeatMapEtfHolding[];
  marketRegime: HeatMapEtfMarketRegime | null;
}

export type HeatMapDetailAssetType =
  | 'stock'
  | 'etf'
  | 'commodity'
  | 'future'
  | 'cryptocurrency';

interface StatDefinition {
  label: string;
  key: Exclude<keyof HeatMapDetailStats, 'etfProfile'>;
  format: 'price' | 'compact' | 'currency' | 'number' | 'date';
}

function numericField(value: unknown, key: string): number | null {
  const candidate = record(value)?.[key];
  return typeof candidate === 'number' && Number.isFinite(candidate)
    ? candidate
    : null;
}

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
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

  return {
    fundCategory: stringField(input, 'fundCategory'),
    fundFamily: stringField(input, 'fundFamily'),
    expenseRatio: numericField(input, 'expenseRatio'),
    totalAssets: numericField(input, 'totalAssets'),
    dividendYield: numericField(input, 'dividendYield'),
    beta3Year: numericField(input, 'beta3Year'),
    largestSector: stringField(input, 'largestSector'),
    largestSectorWeight: numericField(input, 'largestSectorWeight'),
    topHoldings,
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
    marketCap: numericField(value, 'marketCap'),
    beta: numericField(value, 'beta'),
    earningsTimestamp: numericField(value, 'earningsTimestamp'),
    targetMeanPrice: numericField(value, 'targetMeanPrice'),
    trailingEps: numericField(value, 'trailingEps'),
    totalRevenue: numericField(value, 'totalRevenue'),
    circulatingSupply: numericField(value, 'circulatingSupply'),
    maxSupply: numericField(value, 'maxSupply'),
    volume24Hr: numericField(value, 'volume24Hr'),
    etfProfile: parseEtfProfile((value as Record<string, unknown>).etfProfile),
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
): { label: string; value: string }[] {
  if (assetType === 'etf') {
    return getEtfStatRows(stats?.etfProfile ?? null, loading);
  }

  const definitions = assetType === 'cryptocurrency'
    ? CRYPTO_STAT_DEFINITIONS
    : STOCK_STAT_DEFINITIONS;

  const rows = definitions.map(({ label, key, format }) => {
    const rawValue = key === 'marketCap'
      ? stats?.marketCap ?? marketCapFallback
      : stats?.[key] ?? null;
    if (rawValue === null || !Number.isFinite(rawValue)) {
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

  if (assetType !== 'cryptocurrency') return rows;

  const circulatingShare = getCirculatingSupplySharePercent(
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
