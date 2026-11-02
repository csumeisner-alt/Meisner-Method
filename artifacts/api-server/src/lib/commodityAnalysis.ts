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
  historyDates: string[];
  historySessions: string[] | null;
  currentPrice: number;
  historyAsOf: string | null;
  marketEvidence?: CommodityMarketEvidence;
  now?: Date;
}

export type CommodityHistoryAssessment =
  | { status: "available"; lastUsableDate: string; closes: number[] }
  | { status: "unavailable"; lastUsableDate: string | null; observationCount: number; reason: string };

export interface CommodityEvidenceSource {
  title: string;
  url: string;
  asOf: string;
  unit: string;
  observation: string;
}

export interface CommodityInventoryEvidence {
  provider: "EIA" | "USDA";
  symbol: string;
  instrument: string;
  metric: "weekly-stock-change-percent" | "year-over-year-stocks-to-use-change-percent";
  value: number;
  asOf: string;
  units: string;
  source: CommodityEvidenceSource;
}

export interface CommodityPositioningEvidence {
  provider: "CFTC";
  symbol: string;
  instrument: string;
  contractCode: string;
  units: string;
  asOf: string;
  openInterest: number;
  nonCommercialLong: number;
  nonCommercialShort: number;
  source: CommodityEvidenceSource;
}

export interface CommodityMarketEvidence {
  inventory: CommodityInventoryEvidence | null;
  positioning: CommodityPositioningEvidence | null;
}

export interface CommodityScoreFactor {
  key: string;
  label: string;
  status: "available" | "unavailable";
  score: number | null;
  weight: number;
  detail: string;
  sources: CommodityEvidenceSource[];
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
const validDate = (value: string): boolean => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const timestamp = Date.parse(`${value}T00:00:00.000Z`);
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString().slice(0, 10) === value;
};

export const CFTC_INSTRUMENTS: Record<string, { code: string; name: string; unit: string }> = {
  "GC=F": { code: "088691", name: "GOLD", unit: "100 TROY OUNCES" },
  "SI=F": { code: "084691", name: "SILVER", unit: "5,000 TROY OUNCES" },
  "CL=F": { code: "06765A", name: "WTI FINANCIAL CRUDE OIL", unit: "1,000 BARRELS" },
  "NG=F": { code: "023651", name: "NAT GAS NYME", unit: "10,000 MMBTU'S" },
  "HG=F": { code: "085692", name: "COPPER- #1", unit: "25,000 POUNDS" },
  "ZC=F": { code: "002602", name: "CORN", unit: "5,000 BUSHELS" },
  "ZW=F": { code: "001602", name: "WHEAT-SRW", unit: "5,000 BUSHELS" },
  "ZS=F": { code: "005602", name: "SOYBEANS", unit: "5,000 BUSHELS" },
  "KC=F": { code: "083731", name: "COFFEE C", unit: "37,500 POUNDS" },
  "CT=F": { code: "033661", name: "COTTON NO. 2", unit: "50,000 POUNDS" },
  "SB=F": { code: "080732", name: "SUGAR NO. 11", unit: "112,000 POUNDS" },
  "PL=F": { code: "076651", name: "PLATINUM", unit: "50 TROY OUNCES" },
  "PA=F": { code: "075651", name: "PALLADIUM", unit: "100 TROY OUNCES" },
  "LE=F": { code: "057642", name: "LIVE CATTLE", unit: "40,000 POUNDS" },
  "HE=F": { code: "054642", name: "LEAN HOGS", unit: "40,000 POUNDS" },
};

const USDA_COMMODITIES: Record<string, string> = {
  "ZC=F": "Corn",
  "ZW=F": "Wheat",
  "ZS=F": "Soybeans",
  "CT=F": "Cotton",
  "SB=F": "Sugar",
};

function validSource(source: CommodityEvidenceSource, provider: string, asOf: string): boolean {
  return source.title.length > 0
    && source.asOf === asOf
    && validDate(source.asOf)
    && /^https:\/\//i.test(source.url)
    && (provider === "EIA"
      ? source.url === "https://ir.eia.gov/wpsr/table4.csv"
        || source.url === "https://ir.eia.gov/ngs/wngsr.csv"
      : provider === "USDA"
        ? /^https:\/\/www\.usda\.gov\/sites\/default\/files\/documents\/oce-wasde-report-data-\d{4}-\d{2}(?:-V\d+)?\.csv$/i.test(source.url)
        : provider === "CFTC"
          ? source.url === "https://publicreportinghub.cftc.gov/Commitments-of-Traders/Legacy-Futures-Only/6dca-aqww"
          : false);
}

function freshDate(asOf: string, now: Date, maxAgeDays: number): boolean {
  if (!validDate(asOf)) return false;
  const ageDays = (now.getTime() - Date.parse(`${asOf}T00:00:00.000Z`)) / 86_400_000;
  return ageDays >= 0 && ageDays <= maxAgeDays;
}

function validateInventoryEvidence(
  evidence: CommodityInventoryEvidence | null | undefined,
  symbol: string,
  now: Date,
): CommodityInventoryEvidence | null {
  if (!evidence || evidence.symbol !== symbol || evidence.instrument !== SUPPORTED_COMMODITIES[symbol]?.name) return null;
  if (!Number.isFinite(evidence.value) || !freshDate(evidence.asOf, now, evidence.provider === "USDA" ? 60 : 14)) return null;
  if (!validSource(evidence.source, evidence.provider, evidence.asOf)) return null;

  if (evidence.provider === "EIA") {
    if (symbol === "CL=F") {
      return evidence.metric === "weekly-stock-change-percent"
        && evidence.units === "million barrels"
        && evidence.source.url === "https://ir.eia.gov/wpsr/table4.csv"
        && evidence.source.unit === "million barrels"
        ? evidence
        : null;
    }
    if (symbol === "NG=F") {
      return evidence.metric === "weekly-stock-change-percent"
        && evidence.units === "billion cubic feet"
        && evidence.source.url === "https://ir.eia.gov/ngs/wngsr.csv"
        && evidence.source.unit === "billion cubic feet"
        ? evidence
        : null;
    }
    return null;
  }

  const expectedCommodity = USDA_COMMODITIES[symbol];
  return expectedCommodity
    && evidence.provider === "USDA"
    && evidence.metric === "year-over-year-stocks-to-use-change-percent"
    && evidence.units === "percent of total use"
    && evidence.source.unit.length > 0
    ? evidence
    : null;
}

function validatePositioningEvidence(
  evidence: CommodityPositioningEvidence | null | undefined,
  symbol: string,
  now: Date,
): CommodityPositioningEvidence | null {
  const expected = CFTC_INSTRUMENTS[symbol];
  if (!evidence || !expected || evidence.provider !== "CFTC"
    || evidence.symbol !== symbol
    || evidence.instrument !== expected.name
    || evidence.contractCode !== expected.code
    || !evidence.units.toUpperCase().includes(expected.unit)
    || !freshDate(evidence.asOf, now, 14)
    || !validSource(evidence.source, evidence.provider, evidence.asOf)
    || evidence.source.unit !== "contracts"
    || !finitePositive(evidence.openInterest)
    || !Number.isFinite(evidence.nonCommercialLong)
    || !Number.isFinite(evidence.nonCommercialShort)
    || evidence.nonCommercialLong < 0
    || evidence.nonCommercialShort < 0) return null;
  return evidence;
}

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

const MAX_STALE_SESSIONS = 2;
const MAX_MISSING_SESSIONS_BETWEEN_BARS = 5;

export function assessCommodityHistory(input: CommodityScoreInput): CommodityHistoryAssessment {
  const unusable = (reason: string, lastUsableDate: string | null, observationCount: number): CommodityHistoryAssessment => ({
    status: "unavailable",
    lastUsableDate,
    observationCount,
    reason,
  });
  const historyDates = input.historyDates;
  const sessions = input.historySessions;
  const closes = input.closes;
  const pairedCount = Math.min(historyDates?.length ?? 0, closes?.length ?? 0);
  let lastUsableDate: string | null = null;

  if (!Array.isArray(historyDates) || !Array.isArray(closes) || historyDates.length !== closes.length) {
    return unusable(
      "The price history is missing aligned dates for its daily observations.",
      null,
      pairedCount,
    );
  }

  for (let index = 0; index < historyDates.length; index += 1) {
    if (!validDate(historyDates[index]!)) {
      return unusable("The price history contains an invalid observation date.", lastUsableDate, index);
    }
    if (index > 0 && historyDates[index - 1]! >= historyDates[index]!) {
      return unusable("The price history contains duplicate or out-of-order observation dates.", lastUsableDate, index);
    }
    if (finitePositive(closes[index])) lastUsableDate = historyDates[index]!;
    else {
      return unusable("The price history contains a missing or invalid daily price.", lastUsableDate, index);
    }
  }

  if (historyDates.length < 20) {
    return unusable(
      "There are not enough valid daily observations to score this commodity.",
      lastUsableDate,
      historyDates.length,
    );
  }
  if (!lastUsableDate || !validDate(input.historyAsOf ?? "") || input.historyAsOf !== lastUsableDate) {
    return unusable(
      "The reported history end date does not match the latest valid daily observation.",
      lastUsableDate,
      historyDates.length,
    );
  }
  if (!Array.isArray(sessions) || sessions.length === 0
    || sessions.some((session) => !validDate(session))
    || sessions.some((session, index) => index > 0 && sessions[index - 1]! >= session)) {
    return unusable(
      "The exchange calendar could not verify the expected commodity trading sessions.",
      lastUsableDate,
      historyDates.length,
    );
  }

  const sessionIndexes = new Map(sessions.map((session, index) => [session, index]));
  const observationIndexes: number[] = [];
  for (const date of historyDates) {
    const sessionIndex = sessionIndexes.get(date);
    if (sessionIndex === undefined) {
      return unusable(
        "The price history includes a date that is not a session on this commodity's exchange calendar.",
        lastUsableDate,
        historyDates.length,
      );
    }
    observationIndexes.push(sessionIndex);
  }
  const lastObservedSession = observationIndexes.at(-1)!;
  const latestExpectedSession = sessions.length - 1;
  if (latestExpectedSession - lastObservedSession > MAX_STALE_SESSIONS) {
    return unusable(
      "The latest usable price history is stale relative to the exchange's recent trading sessions.",
      lastUsableDate,
      historyDates.length,
    );
  }

  for (let index = 1; index < observationIndexes.length; index += 1) {
    const missingSessions = observationIndexes[index]! - observationIndexes[index - 1]! - 1;
    if (missingSessions > MAX_MISSING_SESSIONS_BETWEEN_BARS) {
      return unusable(
        `The price history has a gap of ${missingSessions} expected trading sessions, so its trend is unreliable.`,
        lastUsableDate,
        historyDates.length,
      );
    }
  }

  return { status: "available", lastUsableDate, closes: [...closes] };
}

export function buildCommodityScore(input: CommodityScoreInput): CommodityScore | null {
  const symbol = input.symbol.trim().toUpperCase();
  const profile = SUPPORTED_COMMODITIES[symbol];
  if (!profile || !finitePositive(input.currentPrice)) return null;
  const history = assessCommodityHistory(input);
  if (history.status === "unavailable") return null;
  const closes = history.closes.slice(-253);
  const now = input.now ?? new Date();
  const inventory = validateInventoryEvidence(input.marketEvidence?.inventory, symbol, now);
  const positioning = validatePositioningEvidence(input.marketEvidence?.positioning, symbol, now);

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

  const inventoryScore = inventory
    ? Math.round(clamp(50 - 50 * Math.tanh(inventory.value
      / (inventory.metric === "weekly-stock-change-percent" ? 5 : 35))))
    : null;
  const positioningScore = positioning
    ? Math.round(clamp(50 + 50 * Math.tanh(
      (positioning.nonCommercialLong - positioning.nonCommercialShort)
      / positioning.openInterest / 0.25,
    )))
    : null;

  const weightedSignals = [
    { score: trendScore, weight: 0.7 },
    ...(inventoryScore === null ? [] : [{ score: inventoryScore, weight: 0.2 }]),
    ...(positioningScore === null ? [] : [{ score: positioningScore, weight: 0.1 }]),
  ];
  const availableWeight = weightedSignals.reduce((sum, signal) => sum + signal.weight, 0);
  const combinedScore = Math.round(weightedSignals.reduce(
    (sum, signal) => sum + signal.score * signal.weight,
    0,
  ) / availableWeight);
  // Volatility dampens the directional signal; it does not imply that a volatile
  // market is automatically bearish. External evidence is used only when its
  // instrument, source, units, date, and freshness pass validation above.
  const volatilityDampener = clamp(annualizedVolatilityPercent / 200, 0, 0.35);
  const score = Math.round(50 + (combinedScore - 50) * (1 - volatilityDampener));
  const historyCoverage = Math.min(1, closes.length / 253);
  const factorsAvailable = 2 + Number(inventory !== null) + Number(positioning !== null);
  const dataCoveragePercent = Math.round(factorsAvailable / 6 * 100);
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
      weight: weightedSignals[0].weight / availableWeight,
      detail: "Risk-adjusted directional signal from 1-, 3-, and 6-month returns where enough daily observations exist.",
      sources: [],
    },
    {
      key: "realized-volatility",
      label: "Volatility stability",
      status: "available",
      score: Math.round(clamp(100 - annualizedVolatilityPercent / 1.5)),
      weight: 0,
      detail: "Higher means lower realized volatility. Daily volatility dampens the trend signal and lowers confidence; it is not directional by itself.",
      sources: [],
    },
    {
      key: "futures-curve",
      label: "Futures curve and roll effects",
      status: "unavailable",
      score: null,
      weight: 0,
      detail: "No verified, dated exchange-settlement curve for individual contract months is available in this feed. Continuous-futures prices do not identify roll yield; excluded, not estimated.",
      sources: [],
    },
    {
      key: "physical-balance",
      label: "Inventories and supply/demand",
      status: inventory ? "available" : "unavailable",
      score: inventoryScore,
      weight: inventory ? (0.2 / availableWeight) : 0,
      detail: inventory
        ? inventory.source.observation
        : "No fresh, instrument-matched official inventory or supply/demand release is available; excluded, not estimated.",
      sources: inventory ? [inventory.source] : [],
    },
    {
      key: "positioning",
      label: "Trader positioning",
      status: positioning ? "available" : "unavailable",
      score: positioningScore,
      weight: positioning ? (0.1 / availableWeight) : 0,
      detail: positioning
        ? `CFTC non-commercial net ${positioning.nonCommercialLong - positioning.nonCommercialShort} contracts out of ${positioning.openInterest} open interest; positioning is context, not a forecast.`
        : "No fresh, exact-contract CFTC futures-only report is available; excluded, not estimated.",
      sources: positioning ? [positioning.source] : [],
    },
    {
      key: "macro-weather-seasonality",
      label: "Macro, weather, and seasonality",
      status: "unavailable",
      score: null,
      weight: 0,
      detail: "No validated, instrument-specific dated source is included for this factor; excluded, not estimated.",
      sources: [],
    },
  ];

  return {
    score,
    confidence,
    dataCoveragePercent,
    observationCount: closes.length,
    historyAsOf: history.lastUsableDate,
    family: profile.family,
    annualizedVolatilityPercent: Math.round(annualizedVolatilityPercent * 10) / 10,
    oneMonthReturnPercent: oneMonthReturnPercent === null ? null : Math.round(oneMonthReturnPercent * 10) / 10,
    threeMonthReturnPercent: threeMonthReturnPercent === null ? null : Math.round(threeMonthReturnPercent * 10) / 10,
    sixMonthReturnPercent: sixMonthReturnPercent === null ? null : Math.round(sixMonthReturnPercent * 10) / 10,
    factors,
    methodology: "The deterministic score combines price trend (70%), official inventory/supply-demand evidence (20%), and CFTC non-commercial positioning (10%), renormalizing only across available validated inputs. Inventory and positioning are omitted when the exact source, instrument, unit, observation date, or freshness check fails. Realized volatility dampens direction but is not a directional factor. Futures-curve, macro, and weather effects are not inferred from continuous-futures history or commentary.",
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
