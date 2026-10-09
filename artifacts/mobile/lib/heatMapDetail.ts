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
}

export type HeatMapDetailAssetType =
  | 'stock'
  | 'etf'
  | 'commodity'
  | 'future'
  | 'cryptocurrency';

interface StatDefinition {
  label: string;
  key: keyof HeatMapDetailStats;
  format: 'price' | 'compact' | 'currency' | 'number' | 'date';
}

function numericField(value: unknown, key: string): number | null {
  const candidate = (value as Record<string, unknown>)[key];
  return typeof candidate === 'number' && Number.isFinite(candidate)
    ? candidate
    : null;
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

export function getHeatMapDetailStatRows(
  assetType: HeatMapDetailAssetType,
  stats: HeatMapDetailStats | null,
  marketCapFallback: number | null,
  loading: boolean,
): { label: string; value: string }[] {
  const definitions = assetType === 'cryptocurrency'
    ? CRYPTO_STAT_DEFINITIONS
    : STOCK_STAT_DEFINITIONS;

  return definitions.map(({ label, key, format }) => {
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
