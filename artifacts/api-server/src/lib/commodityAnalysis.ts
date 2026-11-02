export type CommodityFamily =
  | "metals"
  | "energy"
  | "agriculture"
  | "livestock";

export interface CommodityProfile {
  name: string;
  family: CommodityFamily;
}

export const SUPPORTED_COMMODITIES: Record<string, CommodityProfile> = {
  "GC=F": { name: "Gold", family: "metals" },
  "SI=F": { name: "Silver", family: "metals" },
  "CL=F": { name: "Crude Oil", family: "energy" },
  "NG=F": { name: "Natural Gas", family: "energy" },
  "HG=F": { name: "Copper", family: "metals" },
  "ZC=F": { name: "Corn", family: "agriculture" },
  "ZW=F": { name: "Wheat", family: "agriculture" },
  "ZS=F": { name: "Soybeans", family: "agriculture" },
  "KC=F": { name: "Coffee", family: "agriculture" },
  "CT=F": { name: "Cotton", family: "agriculture" },
  "SB=F": { name: "Sugar", family: "agriculture" },
  "PL=F": { name: "Platinum", family: "metals" },
  "PA=F": { name: "Palladium", family: "metals" },
  "LE=F": { name: "Live Cattle", family: "livestock" },
  "HE=F": { name: "Lean Hogs", family: "livestock" },
};

export interface CommodityNewsSource {
  title: string;
  url: string;
  publishedAt: string | null;
}

export interface CommodityNewsContext {
  status: "available" | "unavailable";
  summary: string | null;
  retrievedAt: string | null;
  sources: CommodityNewsSource[];
}

export interface CommodityScoreInput {
  symbol: string;
  closes: number[];
  currentPrice: number;
  historyAsOf: string | null;
}

export interface CommodityScoreFactor {
  key: string;
  label: string;
  status: "available" | "unavailable";
  score: number | null;
  weight: number;
  detail: string;
}

export interface CommodityScore {
  score: number;
  confidence: number;
  dataCoveragePercent: number;
  observationCount: number;
  historyAsOf: string | null;
  family: CommodityFamily;
  annualizedVolatilityPercent: number;
  oneMonthReturnPercent: number | null;
  threeMonthReturnPercent: number | null;
  sixMonthReturnPercent: number | null;
  factors: CommodityScoreFactor[];
  methodology: string;
}

const clamp = (value: number, min = 0, max = 100) => Math.min(max, Math.max(min, value));
const finitePositive = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value) && value > 0;

function periodReturn(closes: number[], sessions: number): number | null {
  if (closes.length <= sessions) return null;
  const start = closes[closes.length - 1 - sessions];
  const end = closes.at(-1);
  if (!finitePositive(start) || !finitePositive(end)) return null;
  return (end / start - 1) * 100;
}

function returnScore(value: number): number {
  return clamp(Math.round(50 + 50 * Math.tanh(value / 30)));
}

export function buildCommodityScore(input: CommodityScoreInput): CommodityScore | null {
  const profile = SUPPORTED_COMMODITIES[input.symbol.trim().toUpperCase()];
  if (!profile || !finitePositive(input.currentPrice)) return null;
  const closes = input.closes.filter(finitePositive).slice(-253);
  if (closes.length < 20) return null;

  const returns = closes.slice(1).flatMap((close, index) => {
    const previous = closes[index];
    return finitePositive(previous) ? [Math.log(close / previous)] : [];
  });
  const mean = returns.reduce((sum, value) => sum + value, 0) / Math.max(1, returns.length);
  const variance = returns.reduce((sum, value) => sum + (value - mean) ** 2, 0)
    / Math.max(1, returns.length - 1);
  const annualizedVolatilityPercent = Math.sqrt(variance * 252) * 100;
  const oneMonthReturnPercent = periodReturn(closes, 20);
  const threeMonthReturnPercent = periodReturn(closes, 60);
  const sixMonthReturnPercent = periodReturn(closes, 120);
  const availableReturns = [
    { value: oneMonthReturnPercent, weight: 0.2 },
    { value: threeMonthReturnPercent, weight: 0.4 },
    { value: sixMonthReturnPercent, weight: 0.4 },
  ].filter((item): item is { value: number; weight: number } => item.value !== null);
  const trendWeight = availableReturns.reduce((sum, item) => sum + item.weight, 0);
  const trendScore = trendWeight > 0
    ? Math.round(availableReturns.reduce(
      (sum, item) => sum + returnScore(item.value) * item.weight,
      0,
    ) / trendWeight)
    : 50;

  // Volatility dampens the directional signal; it does not imply that a volatile
  // market is automatically bearish. Inventory, curve, and positioning are not
  // included unless a dated provider source is available.
  const volatilityDampener = clamp(annualizedVolatilityPercent / 200, 0, 0.35);
  const score = Math.round(50 + (trendScore - 50) * (1 - volatilityDampener));
  const historyCoverage = Math.min(1, closes.length / 253);
  const dataCoveragePercent = Math.round(2 / 6 * 100);
  const confidence = Math.round(clamp(
    30 + historyCoverage * 35 * dataCoveragePercent / 100,
    30,
    70,
  ));
  const factors: CommodityScoreFactor[] = [
    {
      key: "price-trend",
      label: "Multi-period price trend",
      status: "available",
      score: trendScore,
      weight: 1,
      detail: "Risk-adjusted directional signal from 1-, 3-, and 6-month returns where enough daily observations exist.",
    },
    {
      key: "realized-volatility",
      label: "Volatility stability",
      status: "available",
      score: Math.round(clamp(100 - annualizedVolatilityPercent / 1.5)),
      weight: 0,
      detail: "Higher means lower realized volatility. Daily volatility dampens the trend signal and lowers confidence; it is not directional by itself.",
    },
    ...([
      ["futures-curve", "Futures curve and roll effects"],
      ["physical-balance", "Inventories and supply/demand"],
      ["positioning", "Trader positioning"],
      ["macro-weather-seasonality", "Macro, weather, and seasonality"],
    ] as const).map(([key, label]) => ({
      key,
      label,
      status: "unavailable" as const,
      score: null,
      weight: 0,
      detail: "Not provided by the current market-data feed; excluded from the score.",
    })),
  ];

  return {
    score,
    confidence,
    dataCoveragePercent,
    observationCount: closes.length,
    historyAsOf: input.historyAsOf,
    family: profile.family,
    annualizedVolatilityPercent: Math.round(annualizedVolatilityPercent * 10) / 10,
    oneMonthReturnPercent: oneMonthReturnPercent === null ? null : Math.round(oneMonthReturnPercent * 10) / 10,
    threeMonthReturnPercent: threeMonthReturnPercent === null ? null : Math.round(threeMonthReturnPercent * 10) / 10,
    sixMonthReturnPercent: sixMonthReturnPercent === null ? null : Math.round(sixMonthReturnPercent * 10) / 10,
    factors,
  methodology: "Price-trend score uses weighted 1-, 3-, and 6-month returns, transformed to a 0–100 scale. Realized volatility dampens the directional signal. Yahoo continuous-futures history is provider-defined; contract roll effects are not independently verified. The current feed does not provide inventory, curve, positioning, or weather data; those factors are excluded, not estimated.",
  };
}

export function unavailableCommodityNews(): CommodityNewsContext {
  return { status: "unavailable", summary: null, retrievedAt: null, sources: [] };
}

export function parseCommodityNewsSources(value: unknown): CommodityNewsSource[] {
  if (!Array.isArray(value)) return [];
  const sources: CommodityNewsSource[] = [];
  const seen = new Set<string>();
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const record = item as Record<string, unknown>;
    const url = typeof record.url === "string" ? record.url : "";
    if (!/^https?:\/\//i.test(url) || seen.has(url)) continue;
    seen.add(url);
    const publishedAt = [record.published_at, record.published_date, record.date]
      .find((candidate): candidate is string => typeof candidate === "string") ?? null;
    sources.push({
      title: typeof record.title === "string" && record.title.trim()
        ? record.title.trim()
        : new URL(url).hostname,
      url,
      publishedAt,
    });
    if (sources.length >= 5) break;
  }
  return sources;
}
