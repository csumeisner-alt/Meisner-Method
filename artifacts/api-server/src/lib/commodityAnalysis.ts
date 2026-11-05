export type CommodityFamily =
  | "metals"
  | "energy"
  | "agriculture"
  | "livestock";

export interface CommodityProfile {
  name: string;
  family: CommodityFamily;
}

export interface CommodityAnalysisGuide {
  focus: string[];
  unavailable: string[];
  monitorNext: string[];
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

export const COMMODITY_ANALYSIS_GUIDES: Record<string, CommodityAnalysisGuide> = {
  "GC=F": {
    focus: ["Gold futures price trend", "CFTC gold futures positioning"],
    unavailable: ["Real yields and U.S. dollar", "Central-bank and ETF flows", "Physical demand and futures curve"],
    monitorNext: ["Check the next dated CFTC gold positioning report.", "Look for verified real-yield, currency, and gold-flow data before assessing macro drivers."],
  },
  "SI=F": {
    focus: ["Silver futures price trend", "CFTC silver futures positioning"],
    unavailable: ["Industrial and solar demand", "Mine and recycling supply", "Physical inventories, real yields, and U.S. dollar"],
    monitorNext: ["Check the next dated CFTC silver positioning report.", "Look for dated industrial-demand, mine-supply, and physical-inventory data."],
  },
  "CL=F": {
    focus: ["WTI futures price trend", "EIA U.S. commercial crude inventories", "CFTC WTI futures positioning"],
    unavailable: ["OPEC+ production and compliance", "Global demand and refinery disruptions", "Verified futures curve and roll yield"],
    monitorNext: ["Check the next EIA Weekly Petroleum Status Report.", "Check the next dated CFTC WTI positioning report."],
  },
  "NG=F": {
    focus: ["Henry Hub futures price trend", "EIA Lower 48 working-gas storage", "CFTC natural-gas futures positioning"],
    unavailable: ["Weather-driven demand", "Production and LNG feedgas", "Verified futures curve and regional pipeline constraints"],
    monitorNext: ["Check the next EIA Weekly Natural Gas Storage Report.", "Look for dated weather, production, and LNG-flow data."],
  },
  "HG=F": {
    focus: ["COMEX copper futures price trend", "CFTC copper futures positioning"],
    unavailable: ["Exchange warehouse inventories", "Mine disruptions and smelter conditions", "China demand and verified futures curve"],
    monitorNext: ["Check the next dated CFTC copper positioning report.", "Look for dated exchange-inventory, mine-supply, and industrial-demand data."],
  },
  "ZC=F": {
    focus: ["Corn futures price trend", "USDA WASDE corn stocks-to-use", "CFTC corn futures positioning"],
    unavailable: ["Crop-weather and progress reports", "Export sales and global supply", "Verified futures curve and local basis"],
    monitorNext: ["Check the next USDA WASDE corn supply-and-use release.", "Look for dated crop-progress, weather, and export-sales data."],
  },
  "ZW=F": {
    focus: ["Wheat futures price trend", "USDA WASDE wheat stocks-to-use", "CFTC wheat futures positioning"],
    unavailable: ["Crop-weather and progress reports", "Export flows and global supply", "Verified futures curve and regional basis"],
    monitorNext: ["Check the next USDA WASDE wheat supply-and-use release.", "Look for dated crop-weather, export-flow, and global-supply data."],
  },
  "ZS=F": {
    focus: ["Soybean futures price trend", "USDA WASDE soybean stocks-to-use", "CFTC soybean futures positioning"],
    unavailable: ["Crop-weather and progress reports", "Crush margins and export flows", "Verified futures curve and local basis"],
    monitorNext: ["Check the next USDA WASDE soybean supply-and-use release.", "Look for dated crop-progress, crush, and export-sales data."],
  },
  "KC=F": {
    focus: ["Coffee futures price trend", "CFTC coffee futures positioning"],
    unavailable: ["Origin-country weather and crop estimates", "Certified exchange stocks", "Verified global production and demand"],
    monitorNext: ["Check the next dated CFTC coffee positioning report.", "Look for dated origin-country crop, weather, and exchange-stock data."],
  },
  "CT=F": {
    focus: ["Cotton futures price trend", "USDA WASDE cotton stocks-to-use", "CFTC cotton futures positioning"],
    unavailable: ["Crop-weather and progress reports", "Textile demand and export sales", "Verified futures curve and local basis"],
    monitorNext: ["Check the next USDA WASDE cotton supply-and-use release.", "Look for dated crop-progress, textile-demand, and export-sales data."],
  },
  "SB=F": {
    focus: ["Sugar futures price trend", "USDA WASDE sugar stocks-to-use", "CFTC sugar futures positioning"],
    unavailable: ["Brazil and India crop/weather data", "Ethanol demand and trade flows", "Verified futures curve and local basis"],
    monitorNext: ["Check the next USDA WASDE sugar supply-and-use release.", "Look for dated major-origin crop, ethanol-demand, and trade-flow data."],
  },
  "PL=F": {
    focus: ["Platinum futures price trend", "CFTC platinum futures positioning"],
    unavailable: ["Mine supply and recycling", "Automotive and industrial demand", "Physical inventories and futures curve"],
    monitorNext: ["Check the next dated CFTC platinum positioning report.", "Look for dated mine-supply, recycling, and industrial-demand data."],
  },
  "PA=F": {
    focus: ["Palladium futures price trend", "CFTC palladium futures positioning"],
    unavailable: ["Mine supply and recycling", "Automotive demand and substitution", "Physical inventories and futures curve"],
    monitorNext: ["Check the next dated CFTC palladium positioning report.", "Look for dated mine-supply, recycling, and automotive-demand data."],
  },
  "LE=F": {
    focus: ["Live-cattle futures price trend", "CFTC live-cattle futures positioning"],
    unavailable: ["USDA cattle-on-feed and slaughter data", "Feed costs and dated weather effects", "Verified futures curve and cash basis"],
    monitorNext: ["Check the next dated CFTC live-cattle positioning report.", "Look for current USDA cattle-on-feed and slaughter data."],
  },
  "HE=F": {
    focus: ["Lean-hog futures price trend", "CFTC lean-hog futures positioning"],
    unavailable: ["USDA hog inventories and slaughter data", "Feed costs and dated disease reports", "Verified futures curve and cash basis"],
    monitorNext: ["Check the next dated CFTC lean-hog positioning report.", "Look for current USDA hog-inventory, slaughter, and feed-cost data."],
  },
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
  publishedObservations?: { reportingPeriod: string; value: number; units: string }[];
}

export interface CommoditySupplyDemandPoint {
  commodity: string;
  value: number;
  units: string;
  reportingPeriod: string;
  publicationDate: string;
  source: { title: string; url: string };
}

export interface CommoditySupplyDemandSeries {
  id: "inventory" | "production" | "consumption" | "imports" | "exports";
  label: string;
  status: "available" | "unavailable";
  units: string | null;
  points: CommoditySupplyDemandPoint[];
  historicalAverage: number | null;
  historicalAveragePeriod: string | null;
  reason: string | null;
}

export interface CommoditySupplyDemandContext {
  status: "available" | "partial" | "unavailable";
  commodity: string;
  series: CommoditySupplyDemandSeries[];
}

export interface CommodityEvent {
  id: string;
  name: string;
  eventDate: string;
  time: string | null;
  timezone: string | null;
  status: "upcoming" | "completed";
  affectedCommodities: string[];
  source: { title: string; url: string; publicationDate: string | null };
  values: {
    previous: { value: number; units: string } | null;
    consensus: { value: number; units: string } | null;
    actual: { value: number; units: string } | null;
  };
}

export interface CommodityEventCalendar {
  status: "available" | "partial" | "unavailable";
  checkedAt: string;
  events: CommodityEvent[];
  unavailable: string[];
}

export type CommodityOfficialProvider = "EIA" | "USDA" | "CFTC";
export type CommodityEvidenceFailureState = "request-failed" | "stale" | "invalid" | "unavailable";

export interface CommodityEvidenceFailure {
  provider: CommodityOfficialProvider;
  state: CommodityEvidenceFailureState;
}

export interface CommodityEvidenceFetchResult<T> {
  evidence: T | null;
  failure: CommodityEvidenceFailure | null;
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
  inventoryFailure?: CommodityEvidenceFailure | null;
  positioningFailure?: CommodityEvidenceFailure | null;
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

export type CommodityIntelligenceCategoryId =
  | "technical-momentum"
  | "fundamentals"
  | "supply-demand"
  | "market-environment"
  | "risk-volatility";

export interface CommodityIntelligenceCategory {
  id: CommodityIntelligenceCategoryId;
  label: string;
  score: number | null;
  weight: number;
  classification: "bullish" | "bearish" | "neutral" | "unavailable";
  detail: string;
  methodology: string;
  sources: CommodityEvidenceSource[];
}

export interface CommodityIntelligenceScorecard {
  version: 1;
  score: number;
  coveragePercent: number;
  coverageStatus: "complete" | "partial" | "insufficient";
  missingCategories: string[];
  categories: CommodityIntelligenceCategory[];
  positiveContributors: string[];
  negativeContributors: string[];
  methodology: string;
}

export const COMMODITY_INTELLIGENCE_WEIGHTS: Record<
  CommodityFamily,
  Record<CommodityIntelligenceCategoryId, number>
> = {
  metals: {
    "technical-momentum": 35,
    fundamentals: 20,
    "supply-demand": 20,
    "market-environment": 10,
    "risk-volatility": 15,
  },
  energy: {
    "technical-momentum": 30,
    fundamentals: 15,
    "supply-demand": 25,
    "market-environment": 15,
    "risk-volatility": 15,
  },
  agriculture: {
    "technical-momentum": 30,
    fundamentals: 20,
    "supply-demand": 25,
    "market-environment": 10,
    "risk-volatility": 15,
  },
  livestock: {
    "technical-momentum": 30,
    fundamentals: 20,
    "supply-demand": 20,
    "market-environment": 15,
    "risk-volatility": 15,
  },
};

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

export const COMMODITY_INVENTORY_PROVIDERS: Record<string, "EIA" | "USDA"> = {
  "CL=F": "EIA",
  "NG=F": "EIA",
  "ZC=F": "USDA",
  "ZW=F": "USDA",
  "ZS=F": "USDA",
  "CT=F": "USDA",
  "SB=F": "USDA",
};

const USDA_COMMODITIES: Record<string, string> = {
  "ZC=F": "Corn",
  "ZW=F": "Wheat",
  "ZS=F": "Soybeans",
  "CT=F": "Cotton",
  "SB=F": "Sugar",
};

function validSource(source: unknown, provider: string, asOf: string): source is CommodityEvidenceSource {
  if (!source || typeof source !== "object") return false;
  const candidate = source as Partial<CommodityEvidenceSource>;
  return typeof candidate.title === "string"
    && candidate.title.length > 0
    && typeof candidate.asOf === "string"
    && candidate.asOf === asOf
    && validDate(candidate.asOf)
    && typeof candidate.url === "string"
    && /^https:\/\//i.test(candidate.url)
    && typeof candidate.unit === "string"
    && candidate.unit.length > 0
    && typeof candidate.observation === "string"
    && (provider === "EIA"
      ? candidate.url === "https://ir.eia.gov/wpsr/table4.csv"
        || candidate.url === "https://ir.eia.gov/ngs/wngsr.csv"
      : provider === "USDA"
        ? /^https:\/\/www\.usda\.gov\/sites\/default\/files\/documents\/oce-wasde-report-data-\d{4}-\d{2}(?:-V\d+)?\.csv$/i.test(candidate.url)
        : provider === "CFTC"
          ? candidate.url === "https://publicreportinghub.cftc.gov/Commitments-of-Traders/Legacy-Futures-Only/6dca-aqww"
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
  if (!evidence || typeof evidence !== "object") return null;
  if (evidence.symbol !== symbol || evidence.instrument !== SUPPORTED_COMMODITIES[symbol]?.name) return null;
  if (evidence.provider !== "EIA" && evidence.provider !== "USDA") return null;
  if (typeof evidence.asOf !== "string" || typeof evidence.units !== "string") return null;
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
  if (!evidence || typeof evidence !== "object" || !expected || evidence.provider !== "CFTC"
    || evidence.symbol !== symbol
    || evidence.instrument !== expected.name
    || evidence.contractCode !== expected.code
    || typeof evidence.units !== "string"
    || typeof evidence.asOf !== "string"
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
  const inventoryFailure = inventory
    ? null
    : input.marketEvidence?.inventory
      ? COMMODITY_INVENTORY_PROVIDERS[symbol]
        ? { provider: COMMODITY_INVENTORY_PROVIDERS[symbol]!, state: "invalid" as const }
        : null
      : input.marketEvidence?.inventoryFailure
        ?? (COMMODITY_INVENTORY_PROVIDERS[symbol]
          ? { provider: COMMODITY_INVENTORY_PROVIDERS[symbol]!, state: "unavailable" as const }
          : null);
  const positioningFailure = positioning
    ? null
    : input.marketEvidence?.positioning
      ? CFTC_INSTRUMENTS[symbol]
        ? { provider: "CFTC" as const, state: "invalid" as const }
        : null
      : input.marketEvidence?.positioningFailure
        ?? (CFTC_INSTRUMENTS[symbol]
          ? { provider: "CFTC" as const, state: "unavailable" as const }
          : null);

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
        : inventoryFailure
          ? `${inventoryFailure.provider} inventory data is ${failureStateDescription(inventoryFailure.state)}; excluded, not estimated.`
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
        : positioningFailure
          ? `CFTC positioning data is ${failureStateDescription(positioningFailure.state)}; excluded, not estimated.`
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

function intelligenceClassification(
  score: number | null,
  category: CommodityIntelligenceCategoryId,
): CommodityIntelligenceCategory["classification"] {
  if (score === null) return "unavailable";
  if (category === "risk-volatility") return score < 40 ? "bearish" : "neutral";
  return score >= 60 ? "bullish" : score <= 40 ? "bearish" : "neutral";
}

export function buildCommodityIntelligenceScorecard(
  symbolInput: string,
  score: CommodityScore,
): CommodityIntelligenceScorecard | null {
  const symbol = symbolInput.trim().toUpperCase();
  const profile = SUPPORTED_COMMODITIES[symbol];
  if (!profile) return null;
  const weights = COMMODITY_INTELLIGENCE_WEIGHTS[profile.family];
  const priceTrend = score.factors.find((factor) => factor.key === "price-trend");
  const inventory = score.factors.find((factor) => factor.key === "physical-balance");
  const positioning = score.factors.find((factor) => factor.key === "positioning");
  const historySource: CommodityEvidenceSource[] = score.historyAsOf
    ? [{
      title: "Yahoo Finance daily futures history",
      url: `https://finance.yahoo.com/quote/${encodeURIComponent(symbol)}/history/`,
      asOf: score.historyAsOf,
      unit: "percent return",
      observation: `${score.observationCount} validated daily observations; 1-, 3-, and 6-month returns: ${
        [score.oneMonthReturnPercent, score.threeMonthReturnPercent, score.sixMonthReturnPercent]
          .map((value) => value === null ? "unavailable" : `${value}%`).join(", ")
      }.`,
    }]
    : [];
  const definitions: Omit<CommodityIntelligenceCategory, "weight" | "classification">[] = [
    {
      id: "technical-momentum",
      label: "Technical momentum",
      score: priceTrend?.score ?? null,
      detail: priceTrend?.detail ?? "Validated multi-period price history is unavailable.",
      methodology: "Uses the existing deterministic blend of available 1-, 3-, and 6-month price returns. This category does not change the existing commodity market score.",
      sources: historySource,
    },
    {
      id: "fundamentals",
      label: "Fundamental conditions",
      score: null,
      detail: "No verified commodity-specific production costs, demand fundamentals, or macroeconomic baseline is available for this analysis; this category is excluded, not estimated.",
      methodology: "Requires dated, instrument-matched source data. Price movement, news commentary, and unrelated commodity measures are not substitutes for fundamental evidence.",
      sources: [],
    },
    {
      id: "supply-demand",
      label: "Supply and demand",
      score: inventory?.status === "available" ? inventory.score : null,
      detail: inventory?.status === "available"
        ? inventory.detail
        : inventory?.detail ?? "No fresh, validated official inventory or supply-and-demand observation is available; this category is excluded, not estimated.",
      methodology: "Uses only the validated EIA weekly stock change or USDA year-over-year stocks-to-use change for the matching commodity. Lower reported stocks are treated as supportive; higher stocks as a headwind.",
      sources: inventory?.status === "available" ? inventory.sources : [],
    },
    {
      id: "market-environment",
      label: "Market environment",
      score: positioning?.status === "available" ? positioning.score : null,
      detail: positioning?.status === "available"
        ? `${positioning.detail} CFTC positioning is a limited market-environment measure, not a broad macro, weather, or futures-curve assessment.`
        : positioning?.detail ?? "No fresh, exact-contract CFTC positioning observation is available; broader macro, weather, and futures-curve conditions are not assessed.",
      methodology: "Uses the validated CFTC non-commercial net position as a share of open interest. This is a positioning context indicator only; it does not stand in for unobserved macro, weather, or curve data.",
      sources: positioning?.status === "available" ? positioning.sources : [],
    },
    {
      id: "risk-volatility",
      label: "Risk and volatility",
      score: Math.round(clamp(100 - score.annualizedVolatilityPercent / 1.5)),
      detail: `Annualized realized volatility is ${score.annualizedVolatilityPercent.toFixed(1)}%. Higher volatility lowers this stability score; low volatility is not counted as a bullish contributor.`,
      methodology: "Stability score is max(0, 100 − annualized realized volatility ÷ 1.5). In the overall formula, only a stability score below 50 can subtract points; risk can never add points.",
      sources: historySource,
    },
  ];
  const categories: CommodityIntelligenceCategory[] = definitions.map((category) => ({
    ...category,
    weight: weights[category.id],
    classification: intelligenceClassification(category.score, category.id),
  }));
  const availableWeight = categories
    .filter((category) => category.score !== null)
    .reduce((sum, category) => sum + category.weight, 0);
  const scoreDelta = categories.reduce((sum, category) => {
    if (category.score === null) return sum;
    const deviation = category.score - 50;
    return sum + (category.id === "risk-volatility" ? Math.min(0, deviation) : deviation)
      * category.weight / 100;
  }, 0);
  const missingCategories = categories
    .filter((category) => category.score === null)
    .map((category) => category.label);
  const coveragePercent = Math.round(availableWeight);
  return {
    version: 1,
    score: Math.round(clamp(50 + scoreDelta)),
    coveragePercent,
    coverageStatus: coveragePercent === 100 ? "complete" : coveragePercent >= 60 ? "partial" : "insufficient",
    missingCategories,
    categories,
    positiveContributors: categories
      .filter((category) => category.score !== null
        && category.id !== "risk-volatility"
        && category.score > 50)
      .map((category) => category.label),
    negativeContributors: categories
      .filter((category) => category.score !== null
        && (category.id === "risk-volatility" ? category.score < 50 : category.score < 50))
      .map((category) => category.label),
    methodology: "The overall intelligence score starts at neutral 50 and adds each available category's deviation from 50 multiplied by its commodity-family weight. Missing categories are not reweighted or fabricated, so their weight stays neutral and limits how far the total can move. Risk and volatility can subtract from 50 but can never add to it. This is a present-evidence assessment, not a prediction of future returns.",
  };
}

function failureStateDescription(state: CommodityEvidenceFailureState): string {
  switch (state) {
    case "request-failed":
      return "unavailable because the official source could not be reached";
    case "stale":
      return "stale";
    case "invalid":
      return "unavailable because the official data did not pass validation";
    case "unavailable":
      return "unavailable";
  }
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
