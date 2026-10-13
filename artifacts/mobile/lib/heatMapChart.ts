export interface PriceBar {
  h: number;
  l: number;
  c: number;
}

export interface PriceLevels {
  support: number[];
  resistance: number[];
}

export interface HeatMapChartTrendLine {
  id: string;
  startT: number;
  endT: number;
  startPrice: number;
  endPrice: number;
}

const HEAT_MAP_CHART_DRAWINGS_KEY_PREFIX = '@meisnermethod/heat_map_chart_drawings_v1/';

export function getHeatMapChartDrawingsStorageKey(symbol: string): string {
  return `${HEAT_MAP_CHART_DRAWINGS_KEY_PREFIX}${encodeURIComponent(symbol.trim().toUpperCase())}`;
}

export function parseHeatMapChartTrendLines(raw: string | null): HeatMapChartTrendLine[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is HeatMapChartTrendLine => {
      if (!item || typeof item !== 'object') return false;
      const line = item as Partial<HeatMapChartTrendLine>;
      return typeof line.id === 'string' && line.id.length > 0
        && Number.isFinite(line.startT) && Number.isFinite(line.endT)
        && Number.isFinite(line.startPrice) && Number.isFinite(line.endPrice);
    });
  } catch {
    return [];
  }
}

export const CHART_HISTORY_RANGES = [
  { label: '1W', period: '5d', interval: '1h' },
  { label: '1M', period: '1mo', interval: '1d' },
  { label: '3M', period: '3mo', interval: '1d' },
  { label: '6M', period: '6mo', interval: '1d' },
  { label: '1Y', period: '1y', interval: '1d' },
  { label: '2Y', period: '2y', interval: '1wk' },
  { label: '3Y', period: '3y', interval: '1wk' },
  { label: '5Y', period: '5y', interval: '1wk' },
  { label: 'MAX', period: 'max', interval: '1wk' },
] as const;

export type ChartHistoryRange = typeof CHART_HISTORY_RANGES[number];

export function buildChartHistoryUrl(symbol: string, range: ChartHistoryRange): string {
  return `/api/stocks/chart/${encodeURIComponent(symbol)}?period=${range.period}&interval=${range.interval}`;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function parseChartDate(date: string): { year: number; month: number; day: number; weekday: number } | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(date);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const timestamp = Date.UTC(year, month - 1, day);
  const parsed = new Date(timestamp);
  if (parsed.getUTCFullYear() !== year || parsed.getUTCMonth() !== month - 1 || parsed.getUTCDate() !== day) return null;
  return { year, month, day, weekday: parsed.getUTCDay() };
}

export function formatHeatMapChartAxisDate(date: string, spanDays: number): string {
  const parsed = parseChartDate(date);
  if (!parsed) return date;
  const month = MONTHS[parsed.month - 1]!;
  if (spanDays <= 10) return `${WEEKDAYS[parsed.weekday]} ${parsed.day}`;
  if (spanDays <= 120) return `${month} ${parsed.day}`;
  return `${month} '${String(parsed.year).slice(-2)}`;
}

export function formatHeatMapChartFullDate(date: string): string {
  const parsed = parseChartDate(date);
  if (!parsed) return date;
  return `${MONTHS[parsed.month - 1]} ${parsed.day}, ${parsed.year}`;
}

export function formatHeatMapChartWindow(startDate: string, endDate: string): string {
  const start = parseChartDate(startDate);
  const end = parseChartDate(endDate);
  if (!start || !end) return '';
  const startLabel = `${MONTHS[start.month - 1]} ${start.day}`;
  const endLabel = `${MONTHS[end.month - 1]} ${end.day}`;
  return start.year === end.year
    ? `${startLabel} – ${endLabel}, ${end.year}`
    : `${startLabel}, ${start.year} – ${endLabel}, ${end.year}`;
}

export function detectHeatMapPriceLevels(bars: readonly PriceBar[]): PriceLevels {
  if (bars.length < 5) return { support: [], resistance: [] };

  const supportCandidates: number[] = [];
  const resistanceCandidates: number[] = [];
  for (let index = 1; index < bars.length - 1; index += 1) {
    const bar = bars[index]!;
    if (bar.l <= bars[index - 1]!.l && bar.l <= bars[index + 1]!.l) supportCandidates.push(bar.l);
    if (bar.h >= bars[index - 1]!.h && bar.h >= bars[index + 1]!.h) resistanceCandidates.push(bar.h);
  }

  const lastClose = bars[bars.length - 1]!.c;
  const nearbyRepeatedLevels = (candidates: number[]) => {
    const clusters: { value: number; touches: number }[] = [];
    for (const value of candidates) {
      const existing = clusters.find((cluster) =>
        Math.abs(cluster.value - value) / Math.max(Math.abs(cluster.value), 0.0001) < 0.015);
      if (existing) {
        existing.value = (existing.value * existing.touches + value) / (existing.touches + 1);
        existing.touches += 1;
      } else clusters.push({ value, touches: 1 });
    }
    return clusters
      .filter((cluster) => cluster.touches >= 2)
      .sort((left, right) => Math.abs(left.value - lastClose) - Math.abs(right.value - lastClose))
      .slice(0, 2)
      .map((cluster) => cluster.value);
  };

  return {
    support: nearbyRepeatedLevels(supportCandidates),
    resistance: nearbyRepeatedLevels(resistanceCandidates),
  };
}
