import {
  CFTC_INSTRUMENTS,
  COMMODITY_INVENTORY_PROVIDERS,
  SUPPORTED_COMMODITIES,
  type CommodityEvidenceFailure,
  type CommodityEvidenceFetchResult,
  type CommodityInventoryEvidence,
  type CommodityMarketEvidence,
  type CommodityPositioningEvidence,
  type CommodityEventCalendar,
  type CommoditySupplyDemandContext,
  type CommoditySupplyDemandPoint,
  type CommoditySupplyDemandSeries,
} from "./commodityAnalysis.ts";

const CFTC_DATASET_URL = "https://publicreporting.cftc.gov/resource/6dca-aqww.json";
const CFTC_SOURCE_URL = "https://publicreportinghub.cftc.gov/Commitments-of-Traders/Legacy-Futures-Only/6dca-aqww";
const EIA_TABLE_URL = "https://ir.eia.gov/wpsr/table4.csv";
const EIA_NATURAL_GAS_URL = "https://ir.eia.gov/ngs/wngsr.csv";
const USDA_CATTLE_REPORTS_URL = "https://esmis.nal.usda.gov/publication/cattle";
const USDA_HOG_REPORTS_URL = "https://esmis.nal.usda.gov/publication/hogs-and-pigs";
const USGS_MCS_MAX_AGE_DAYS = 450;
const USDA_CATTLE_INVENTORY_MAX_AGE_DAYS = 200;
const USDA_HOG_INVENTORY_MAX_AGE_DAYS = 120;
const FAILED_SOURCE_CACHE_TTL_MS = 5 * 60 * 1000;
const FAILED_WASDE_REPORT_CACHE_TTL_MS = 15 * 60 * 1000;
type SupplySeriesId = CommoditySupplyDemandSeries["id"];
type UsdaCommodityConfig = {
  commodity: string;
  useAttributes: string[];
  period: "marketing-year" | "calendar-year";
  reportTitlePattern: RegExp;
  pointCommodity?: string;
  labels?: Partial<Record<SupplySeriesId, string>>;
};
const WASDE_GENERAL_SUPPLY_TITLE = /^U\.S\..*Supply and Use/i;
const USDA_COMMODITIES: Record<string, UsdaCommodityConfig> = {
  "ZC=F": { commodity: "Corn", useAttributes: ["Use, Total", "Total Use"], period: "marketing-year", reportTitlePattern: WASDE_GENERAL_SUPPLY_TITLE },
  "ZW=F": { commodity: "Wheat", useAttributes: ["Use, Total", "Total Use"], period: "marketing-year", reportTitlePattern: WASDE_GENERAL_SUPPLY_TITLE },
  "ZS=F": { commodity: "Oilseed, Soybean", useAttributes: ["Use, Total", "Total Use"], period: "marketing-year", reportTitlePattern: WASDE_GENERAL_SUPPLY_TITLE },
  "CT=F": { commodity: "Cotton", useAttributes: ["Use, Total", "Total Use"], period: "marketing-year", reportTitlePattern: WASDE_GENERAL_SUPPLY_TITLE },
  "SB=F": { commodity: "Sugar", useAttributes: ["Total Use", "Use, Total"], period: "marketing-year", reportTitlePattern: WASDE_GENERAL_SUPPLY_TITLE },
  "LE=F": {
    commodity: "Beef",
    pointCommodity: "Beef",
    useAttributes: ["Total Use"],
    period: "calendar-year",
    reportTitlePattern: /^U\.S\. Meats Supply and Use$/i,
    labels: {
      inventory: "Beef ending stocks",
      production: "Beef production",
      consumption: "Beef total use",
      imports: "Beef imports",
      exports: "Beef exports",
    },
  },
  "HE=F": {
    commodity: "Pork",
    pointCommodity: "Pork",
    useAttributes: ["Total Use"],
    period: "calendar-year",
    reportTitlePattern: /^U\.S\. Meats Supply and Use$/i,
    labels: {
      inventory: "Pork ending stocks",
      production: "Pork production",
      consumption: "Pork total use",
      imports: "Pork imports",
      exports: "Pork exports",
    },
  },
};
const USDA_INVENTORY_COMMODITIES = new Set(["ZC=F", "ZW=F", "ZS=F", "CT=F", "SB=F"]);
const USDA_SERIES_COMMODITIES = new Set(Object.keys(USDA_COMMODITIES));
const USGS_MCS_COMMODITIES: Record<string, {
  commodity: string;
  rowDetails: Partial<Record<SupplySeriesId, { statistic: string; detail: RegExp }>>;
  labels: Partial<Record<SupplySeriesId, string>>;
}> = {
  "GC=F": {
    commodity: "Gold",
    rowDetails: {
      production: { statistic: "Production", detail: /^Production: Mine$/i },
      consumption: { statistic: "Consumption", detail: /^Consumption, reported$/i },
      imports: { statistic: "Import", detail: /^Imports for consumption$/i },
      exports: { statistic: "Export", detail: /^Exports$/i },
    },
    labels: { production: "U.S. mine production", consumption: "U.S. reported consumption", imports: "U.S. imports", exports: "U.S. exports" },
  },
  "SI=F": {
    commodity: "Silver",
    rowDetails: {
      production: { statistic: "Production", detail: /^Production: Mine$/i },
      consumption: { statistic: "Consumption", detail: /^Consumption, apparent$/i },
      imports: { statistic: "Import", detail: /^Imports for consumption$/i },
      exports: { statistic: "Export", detail: /^Exports$/i },
    },
    labels: { production: "U.S. mine production", consumption: "U.S. apparent consumption", imports: "U.S. imports", exports: "U.S. exports" },
  },
  "HG=F": {
    commodity: "Copper",
    rowDetails: {
      production: { statistic: "Production", detail: /^Production: Mine, recoverable$/i },
      consumption: { statistic: "Consumption", detail: /^Consumption: Reported, refined copper$/i },
      imports: { statistic: "Import", detail: /^Imports for consumption: Refined$/i },
      exports: { statistic: "Export", detail: /^Exports: Refined$/i },
    },
    labels: { production: "U.S. recoverable mine production", consumption: "U.S. reported refined-copper consumption", imports: "U.S. refined-copper imports", exports: "U.S. refined-copper exports" },
  },
  "PL=F": {
    commodity: "Platinum",
    rowDetails: {
      production: { statistic: "Production", detail: /^Mine production: Platinum$/i },
      consumption: { statistic: "Consumption", detail: /^Consumption, apparent: Platinum$/i },
      imports: { statistic: "Import", detail: /^Imports for consumption: Platinum$/i },
      exports: { statistic: "Export", detail: /^Exports: Platinum$/i },
    },
    labels: { production: "U.S. platinum mine production", consumption: "U.S. apparent platinum consumption", imports: "U.S. platinum imports", exports: "U.S. platinum exports" },
  },
  "PA=F": {
    commodity: "Palladium",
    rowDetails: {
      production: { statistic: "Production", detail: /^Mine production: Palladium$/i },
      consumption: { statistic: "Consumption", detail: /^Consumption, apparent: Palladium$/i },
      imports: { statistic: "Import", detail: /^Imports for consumption: Palladium$/i },
      exports: { statistic: "Export", detail: /^Exports: Palladium$/i },
    },
    labels: { production: "U.S. palladium mine production", consumption: "U.S. apparent palladium consumption", imports: "U.S. palladium imports", exports: "U.S. palladium exports" },
  },
};
const USGS_MCS_SOURCE_YEAR_RANGE = 2;

type CftcRow = Record<string, unknown>;
export type WasdeRow = {
  reportTitle: string;
  attribute: string;
  commodity: string;
  region: string;
  marketYear: string;
  value: string;
  unit: string;
  releaseDate: string;
};
export type UsdaAnimalInventoryReport = {
  text: string;
  sourceUrl: string;
};
type UsgsMcsReport = {
  csv: string;
  sourceUrl: string;
  publicationDate: string;
  revisionDate: string;
};

const valueCache = new Map<string, { value: unknown; expiresAt: number }>();
const pendingRequests = new Map<string, Promise<unknown>>();
const wasdeReportCache = new Map<string, { rows: WasdeRow[]; sourceUrl: string; expiresAt: number }>();
const wasdeReportRequests = new Map<string, Promise<{ rows: WasdeRow[]; sourceUrl: string } | null>>();
let wasdeReportFailureExpiresAt = 0;

function isDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = Date.parse(`${value}T00:00:00.000Z`);
  return Number.isFinite(parsed) && new Date(parsed).toISOString().slice(0, 10) === value;
}

function dateOnly(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const date = value.slice(0, 10);
  return isDate(date) ? date : null;
}

function eiaDateOnly(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const match = value.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/);
  if (!match) return null;
  const yearNumber = Number(match[3]);
  const year = match[3].length === 2 ? 2000 + yearNumber : yearNumber;
  const date = `${year}-${match[1].padStart(2, "0")}-${match[2].padStart(2, "0")}`;
  return isDate(date) ? date : null;
}

function eiaStorageDateOnly(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const match = value.trim().match(/^(\d{1,2})-([A-Za-z]{3})-(\d{2}|\d{4})$/);
  if (!match) return null;
  const months: Record<string, string> = {
    jan: "01", feb: "02", mar: "03", apr: "04", may: "05", jun: "06",
    jul: "07", aug: "08", sep: "09", oct: "10", nov: "11", dec: "12",
  };
  const month = months[match[2].toLowerCase()];
  if (!month) return null;
  const yearNumber = Number(match[3]);
  const year = match[3].length === 2 ? 2000 + yearNumber : yearNumber;
  const date = `${year}-${month}-${match[1].padStart(2, "0")}`;
  return isDate(date) ? date : null;
}

function isFresh(asOf: string, now: Date, maxAgeDays: number): boolean {
  if (!isDate(asOf)) return false;
  const ageDays = (now.getTime() - Date.parse(`${asOf}T00:00:00.000Z`)) / 86_400_000;
  return ageDays >= 0 && ageDays <= maxAgeDays;
}

function parseNumber(value: unknown): number | null {
  if (typeof value !== "string" && typeof value !== "number") return null;
  const parsed = typeof value === "number" ? value : Number(value.replaceAll(",", "").trim());
  return Number.isFinite(parsed) ? parsed : null;
}

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (quoted) {
      if (character === '"' && text[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (character === '"') {
        quoted = false;
      } else {
        field += character;
      }
    } else if (character === '"') {
      quoted = true;
    } else if (character === ",") {
      row.push(field);
      field = "";
    } else if (character === "\n") {
      row.push(field.replace(/\r$/, ""));
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += character;
    }
  }
  if (field || row.length) {
    row.push(field.replace(/\r$/, ""));
    rows.push(row);
  }
  return rows;
}

function csvObjects(text: string): Record<string, string>[] {
  const [header, ...rows] = parseCsv(text);
  if (!header || rows.length === 0) return [];
  const normalizedHeader = header.map((item) => item.replace(/^\uFEFF/, "").trim());
  return rows
    .filter((row) => row.length === normalizedHeader.length)
    .map((row) => Object.fromEntries(normalizedHeader.map((key, index) => [key, row[index]])));
}

function parseUsdaRows(text: string): WasdeRow[] {
  return csvObjects(text).map((row) => ({
    reportTitle: row["ReportTitle"] ?? "",
    attribute: row["Attribute"] ?? "",
    commodity: row["Commodity"] ?? "",
    region: row["Region"] ?? "",
    marketYear: row["MarketYear"] ?? "",
    value: row["Value"] ?? "",
    unit: row["Unit"] ?? "",
    releaseDate: row["ReleaseDate"] ?? "",
  }));
}

export function parseEiaCrudeInventoryCsv(
  text: string,
  now = new Date(),
): CommodityInventoryEvidence | null {
  const [header, ...rows] = parseCsv(text);
  if (!header || rows.length === 0) return null;
  const row = rows.find((candidate) => candidate[0]?.trim() === "Commercial (Excluding SPR)");
  if (!row) return null;

  const asOf = eiaDateOnly(header[1]);
  // EIA table CSV begins with a label followed by dates and values. The header
  // contains only the date labels, so the current inventory is column 1.
  const currentInventory = parseNumber(row[1]);
  const priorInventory = parseNumber(row[2]);
  if (!asOf || !isFresh(asOf, now, 14) || currentInventory === null
    || priorInventory === null || priorInventory <= 0) return null;

  const changePercent = ((currentInventory - priorInventory) / priorInventory) * 100;
  const roundedCurrent = currentInventory.toFixed(3);
  const roundedPrior = priorInventory.toFixed(3);
  const observation = `U.S. commercial crude stocks excluding the Strategic Petroleum Reserve: ${roundedCurrent} million barrels, ${changePercent >= 0 ? "up" : "down"} ${Math.abs(changePercent).toFixed(2)}% week over week from ${roundedPrior} million barrels.`;
  const publishedObservations = header.flatMap((dateLabel, index) => {
    const reportingPeriod = eiaDateOnly(dateLabel);
    const value = parseNumber(row[index]);
    return reportingPeriod && value !== null && value >= 0
      ? [{ reportingPeriod, value, units: "million barrels" }]
      : [];
  }).filter((item) => item.reportingPeriod <= asOf && isFresh(item.reportingPeriod, now, 120))
    .sort((left, right) => right.reportingPeriod.localeCompare(left.reportingPeriod))
    .slice(0, 12);
  return {
    provider: "EIA",
    symbol: "CL=F",
    instrument: SUPPORTED_COMMODITIES["CL=F"].name,
    metric: "weekly-stock-change-percent",
    value: changePercent,
    asOf,
    units: "million barrels",
    publishedObservations,
    source: {
      title: "EIA Weekly Petroleum Status Report, Table 4",
      url: EIA_TABLE_URL,
      asOf,
      unit: "million barrels",
      observation,
    },
  };
}

export function parseEiaNaturalGasStorageCsv(
  text: string,
  now = new Date(),
): CommodityInventoryEvidence | null {
  const rows = parseCsv(text);
  const dateHeader = rows.find((row) => eiaStorageDateOnly(row[1]) && eiaStorageDateOnly(row[4]));
  const total = rows.find((row) => row[0]?.trim() === "Total");
  if (!dateHeader || !total) return null;
  const asOf = eiaStorageDateOnly(dateHeader[1]);
  const currentStorage = parseNumber(total[1]);
  const priorStorage = parseNumber(total[4]);
  if (!asOf || !isFresh(asOf, now, 14) || currentStorage === null
    || priorStorage === null || priorStorage <= 0) return null;
  const changePercent = (currentStorage - priorStorage) / priorStorage * 100;
  const observation = `EIA Lower 48 working gas in underground storage: ${currentStorage.toLocaleString("en-US")} billion cubic feet, ${changePercent >= 0 ? "up" : "down"} ${Math.abs(changePercent).toFixed(2)}% week over week from ${priorStorage.toLocaleString("en-US")} billion cubic feet.`;
  const publishedObservations = dateHeader.flatMap((dateLabel, index) => {
    const reportingPeriod = eiaStorageDateOnly(dateLabel);
    const value = parseNumber(total[index]);
    return reportingPeriod && value !== null && value >= 0
      ? [{ reportingPeriod, value, units: "billion cubic feet" }]
      : [];
  }).filter((item) => item.reportingPeriod <= asOf && isFresh(item.reportingPeriod, now, 120))
    .sort((left, right) => right.reportingPeriod.localeCompare(left.reportingPeriod))
    .slice(0, 12);
  return {
    provider: "EIA",
    symbol: "NG=F",
    instrument: SUPPORTED_COMMODITIES["NG=F"].name,
    metric: "weekly-stock-change-percent",
    value: changePercent,
    asOf,
    units: "billion cubic feet",
    publishedObservations,
    source: {
      title: "EIA Weekly Natural Gas Storage Report",
      url: EIA_NATURAL_GAS_URL,
      asOf,
      unit: "billion cubic feet",
      observation,
    },
  };
}

function parseUsdaWasdeInventory(
  rows: WasdeRow[],
  sourceUrl: string,
  symbol: string,
  now = new Date(),
  checkFreshness = true,
): CommodityInventoryEvidence | null {
  const commodityConfig = USDA_COMMODITIES[symbol];
  if (!commodityConfig) return null;
  const commodity = commodityConfig.commodity;
  const records = rows.filter((row) => row.commodity === commodity
    && row.region === "United States"
    && /^U\.S\..*Supply and Use/i.test(row.reportTitle)
    && /^\d{4}\/\d{2}$/.test(row.marketYear)
    && isDate(row.releaseDate));
  if (!records.length) return null;
  const releaseDate = records.map((row) => row.releaseDate).sort().at(-1)!;
  if (checkFreshness && !isFresh(releaseDate, now, 60)) return null;

  const years = [...new Set(records.map((row) => row.marketYear))]
    .sort((left, right) => Number(right.slice(0, 4)) - Number(left.slice(0, 4)));
  const readYear = (year: string) => {
    const yearRows = records.filter((row) => row.marketYear === year);
    const endingStocks = yearRows.find((row) => row.attribute.toLowerCase() === "ending stocks");
    const totalUse = yearRows.find((row) => commodityConfig.useAttributes.includes(row.attribute));
    if (!endingStocks || !totalUse || endingStocks.unit !== totalUse.unit) return null;
    const stocks = parseNumber(endingStocks.value);
    const use = parseNumber(totalUse.value);
    if (stocks === null || use === null || stocks < 0 || use <= 0) return null;
    return { stocks, use, unit: endingStocks.unit };
  };

  for (let index = 0; index < years.length - 1; index += 1) {
    const current = readYear(years[index]);
    const previous = readYear(years[index + 1]);
    if (!current || !previous) continue;
    const currentRatio = current.stocks / current.use * 100;
    const previousRatio = previous.stocks / previous.use * 100;
    if (previousRatio <= 0) continue;
    const relativeChangePercent = Math.round((currentRatio / previousRatio - 1) * 10_000) / 100;
    const observation = `USDA WASDE ${commodity} ${years[index]} ending stocks are ${currentRatio.toFixed(1)}% of total use, versus ${previousRatio.toFixed(1)}% in ${years[index + 1]} (${relativeChangePercent >= 0 ? "higher" : "lower"} by ${Math.abs(relativeChangePercent).toFixed(1)}%). Source units: ${current.unit}.`;
    return {
      provider: "USDA",
      symbol,
      instrument: SUPPORTED_COMMODITIES[symbol].name,
      metric: "year-over-year-stocks-to-use-change-percent",
      value: relativeChangePercent,
      asOf: releaseDate,
      units: "percent of total use",
      source: {
        title: `USDA WASDE ${years[index]} supply and use`,
        url: sourceUrl,
        asOf: releaseDate,
        unit: current.unit,
        observation,
      },
    };
  }
  return null;
}

export function parseUsdaWasdeInventoryCsv(
  rows: WasdeRow[],
  sourceUrl: string,
  symbol: string,
  now = new Date(),
): CommodityInventoryEvidence | null {
  return parseUsdaWasdeInventory(rows, sourceUrl, symbol, now);
}

export function parseCftcPositioningRows(
  rows: CftcRow[],
  symbol: string,
  now = new Date(),
): CommodityPositioningEvidence | null {
  const expected = CFTC_INSTRUMENTS[symbol];
  const row = rows[0];
  if (!expected || !row) return null;
  const asOf = dateOnly(row["report_date_as_yyyy_mm_dd"]);
  const openInterest = parseNumber(row["open_interest_all"]);
  const nonCommercialLong = parseNumber(row["noncomm_positions_long_all"]);
  const nonCommercialShort = parseNumber(row["noncomm_positions_short_all"]);
  const contractUnits = typeof row["contract_units"] === "string" ? row["contract_units"] : "";
  const market = typeof row["market_and_exchange_names"] === "string" ? row["market_and_exchange_names"] : "";
  if (row["cftc_contract_market_code"] !== expected.code
    || row["contract_market_name"] !== expected.name
    || !market.toUpperCase().includes(expected.name)
    || !contractUnits.toUpperCase().includes(expected.unit)
    || !asOf
    || !isFresh(asOf, now, 14)
    || openInterest === null || openInterest <= 0
    || nonCommercialLong === null || nonCommercialLong < 0
    || nonCommercialShort === null || nonCommercialShort < 0) return null;
  return {
    provider: "CFTC",
    symbol,
    instrument: expected.name,
    contractCode: expected.code,
    units: contractUnits,
    asOf,
    openInterest,
    nonCommercialLong,
    nonCommercialShort,
    source: {
      title: "CFTC Commitments of Traders, Legacy Futures Only",
      url: CFTC_SOURCE_URL,
      asOf,
      unit: "contracts",
      observation: `Futures-only open interest: ${openInterest} contracts; non-commercial long ${nonCommercialLong}, short ${nonCommercialShort}.`,
    },
  };
}

async function fetchText(url: string): Promise<string> {
  const response = await fetch(url, {
    headers: { "User-Agent": "MeisnerMethod/1.0 (commodity evidence; public official data)" },
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error(`Official commodity source returned HTTP ${response.status}`);
  return response.text();
}

async function cached<T>(key: string, ttlMs: number, load: () => Promise<T>): Promise<T> {
  const existing = valueCache.get(key);
  if (existing && existing.expiresAt > Date.now()) return existing.value as T;
  const pending = pendingRequests.get(key);
  if (pending) return pending as Promise<T>;
  const request = load().then((value) => {
    const isFailedResult = value != null && typeof value === "object"
      && "failure" in value && Boolean((value as { failure?: unknown }).failure);
    const cacheTtlMs = value == null || isFailedResult ? FAILED_SOURCE_CACHE_TTL_MS : ttlMs;
    valueCache.set(key, { value, expiresAt: Date.now() + cacheTtlMs });
    return value;
  }).finally(() => {
    if (pendingRequests.get(key) === request) pendingRequests.delete(key);
  });
  pendingRequests.set(key, request);
  return request;
}

function wasdeReportCandidates(now: Date): string[] {
  const candidates: string[] = [];
  for (let offset = 0; offset < 4; offset += 1) {
    const monthDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - offset, 1));
    const year = monthDate.getUTCFullYear();
    const month = String(monthDate.getUTCMonth() + 1).padStart(2, "0");
    for (const revision of ["-V2", ""]) {
      candidates.push(
        `https://usda.azureedge.us/sites/default/files/documents/oce-wasde-report-data-${year}-${month}${revision}.csv`,
      );
    }
  }
  return candidates;
}

async function loadLatestWasdeReport(
  now: Date,
  symbol: string,
): Promise<{ rows: WasdeRow[]; sourceUrl: string } | null> {
  const cachedReport = wasdeReportCache.get(symbol);
  if (cachedReport && cachedReport.expiresAt > Date.now()) {
    return { rows: cachedReport.rows, sourceUrl: cachedReport.sourceUrl };
  }
  if (wasdeReportFailureExpiresAt > Date.now()) return null;
  const existingRequest = wasdeReportRequests.get(symbol);
  if (existingRequest) return existingRequest;
  const request = (async () => {
    try {
      for (const url of wasdeReportCandidates(now)) {
        try {
          const csv = await fetchText(url);
          const rows = parseUsdaRows(csv);
          const validReleaseExists = rows.some((row) => isDate(row.releaseDate)
            && Date.parse(`${row.releaseDate}T00:00:00.000Z`) <= now.getTime());
          const hasUsableSeries = parseUsdaSupplyDemandSeries(rows, url, symbol, now).status !== "unavailable";
          if (!rows.length || !validReleaseExists || !hasUsableSeries) continue;
          wasdeReportCache.set(symbol, { rows, sourceUrl: url, expiresAt: Date.now() + 6 * 60 * 60 * 1000 });
          wasdeReportFailureExpiresAt = 0;
          return { rows, sourceUrl: url };
        } catch {
          // A report file may not exist yet or may be served under its revision suffix.
        }
      }
      wasdeReportFailureExpiresAt = Date.now() + FAILED_WASDE_REPORT_CACHE_TTL_MS;
      return null;
    } finally {
      wasdeReportRequests.delete(symbol);
    }
  })();
  wasdeReportRequests.set(symbol, request);
  return request;
}

async function fetchInventory(
  symbol: string,
  now: Date,
): Promise<CommodityEvidenceFetchResult<CommodityInventoryEvidence>> {
  if (symbol === "CL=F" || symbol === "NG=F") {
    return cached(`eia-inventory:${symbol}`, 60 * 60 * 1000, async () => {
      try {
        const sourceUrl = symbol === "CL=F" ? EIA_TABLE_URL : EIA_NATURAL_GAS_URL;
        const csv = await fetchText(sourceUrl);
        const evidence = symbol === "CL=F"
          ? parseEiaCrudeInventoryCsv(csv, now)
          : parseEiaNaturalGasStorageCsv(csv, now);
        if (evidence) return { evidence, failure: null };
        const asOf = symbol === "CL=F"
          ? eiaDateOnly(parseCsv(csv)[0]?.[1])
          : eiaStorageDateOnly(parseCsv(csv).find((row) => eiaStorageDateOnly(row[1]) && eiaStorageDateOnly(row[4]))?.[1]);
        const failure: CommodityEvidenceFailure = {
          provider: "EIA",
          state: asOf && !isFresh(asOf, now, 14) ? "stale" : "invalid",
        };
        return { evidence: null, failure };
      } catch {
        return { evidence: null, failure: { provider: "EIA", state: "request-failed" } };
      }
    });
  }
  if (USDA_INVENTORY_COMMODITIES.has(symbol)) {
    return cached(`usda-inventory:${symbol}`, 6 * 60 * 60 * 1000, async () => {
      const report = await loadLatestWasdeReport(now, symbol);
      if (!report) {
        return { evidence: null, failure: { provider: "USDA", state: "unavailable" } };
      }
      const evidence = parseUsdaWasdeInventoryCsv(report.rows, report.sourceUrl, symbol, now);
      if (evidence) return { evidence, failure: null };
      const releaseDates = report.rows.map((row) => row.releaseDate).filter(isDate).sort();
      const latestRelease = releaseDates.at(-1);
      return {
        evidence: null,
        failure: {
          provider: "USDA",
          state: latestRelease && !isFresh(latestRelease, now, 60) ? "stale" : "invalid",
        },
      };
    });
  }
  return { evidence: null, failure: null };
}

async function fetchPositioning(
  symbol: string,
  now: Date,
): Promise<CommodityEvidenceFetchResult<CommodityPositioningEvidence>> {
  const expected = CFTC_INSTRUMENTS[symbol];
  if (!expected) return { evidence: null, failure: { provider: "CFTC", state: "unavailable" } };
  return cached(`cftc-positioning:${symbol}`, 60 * 60 * 1000, async () => {
    try {
      const url = new URL(CFTC_DATASET_URL);
      url.searchParams.set("$limit", "1");
      url.searchParams.set("$where", `cftc_contract_market_code='${expected.code}'`);
      url.searchParams.set("$order", "report_date_as_yyyy_mm_dd DESC");
      const body = await fetchText(url.toString());
      const raw: unknown = JSON.parse(body);
      if (!Array.isArray(raw)) {
        return { evidence: null, failure: { provider: "CFTC", state: "invalid" } };
      }
      const rows = raw as CftcRow[];
      const evidence = parseCftcPositioningRows(rows, symbol, now);
      if (evidence) return { evidence, failure: null };
      const asOf = dateOnly(rows[0]?.["report_date_as_yyyy_mm_dd"]);
      return {
        evidence: null,
        failure: {
          provider: "CFTC",
          state: asOf && !isFresh(asOf, now, 14) ? "stale" : rows.length === 0 ? "unavailable" : "invalid",
        },
      };
    } catch {
      return { evidence: null, failure: { provider: "CFTC", state: "request-failed" } };
    }
  });
}

export async function fetchCommodityInventoryEvidenceWithStatus(
  symbol: string,
  now = new Date(),
): Promise<CommodityEvidenceFetchResult<CommodityInventoryEvidence>> {
  try {
    return await fetchInventory(symbol.trim().toUpperCase(), now);
  } catch {
    const provider = COMMODITY_INVENTORY_PROVIDERS[symbol.trim().toUpperCase()];
    return {
      evidence: null,
      failure: provider ? { provider, state: "request-failed" } : null,
    };
  }
}

export async function fetchCommodityPositioningEvidenceWithStatus(
  symbol: string,
  now = new Date(),
): Promise<CommodityEvidenceFetchResult<CommodityPositioningEvidence>> {
  try {
    return await fetchPositioning(symbol.trim().toUpperCase(), now);
  } catch {
    return { evidence: null, failure: { provider: "CFTC", state: "request-failed" } };
  }
}

export async function fetchCommodityInventoryEvidence(
  symbol: string,
  now = new Date(),
): Promise<CommodityInventoryEvidence | null> {
  return (await fetchCommodityInventoryEvidenceWithStatus(symbol, now)).evidence;
}

export async function fetchCommodityPositioningEvidence(
  symbol: string,
  now = new Date(),
): Promise<CommodityPositioningEvidence | null> {
  return (await fetchCommodityPositioningEvidenceWithStatus(symbol, now)).evidence;
}

export async function fetchCommodityMarketEvidence(
  symbol: string,
  now = new Date(),
): Promise<CommodityMarketEvidence> {
  const normalized = symbol.trim().toUpperCase();
  if (!SUPPORTED_COMMODITIES[normalized]) return { inventory: null, positioning: null };
  const [inventory, positioning] = await Promise.all([
    fetchCommodityInventoryEvidence(normalized, now),
    fetchCommodityPositioningEvidence(normalized, now),
  ]);
  return { inventory, positioning };
}

const SUPPLY_SERIES: Pick<CommoditySupplyDemandSeries, "id" | "label">[] = [
  { id: "inventory", label: "Ending stocks / inventory" },
  { id: "production", label: "Production" },
  { id: "consumption", label: "Consumption / total use" },
  { id: "imports", label: "Imports" },
  { id: "exports", label: "Exports" },
];

function supplySeriesLabels(symbol: string): Pick<CommoditySupplyDemandSeries, "id" | "label">[] {
  const usdaLabels = USDA_COMMODITIES[symbol]?.labels;
  const usgsLabels = USGS_MCS_COMMODITIES[symbol]?.labels;
  return SUPPLY_SERIES.map(({ id, label }) => ({
    id,
    label: usdaLabels?.[id] ?? usgsLabels?.[id] ?? label,
  }));
}

function periodMatches(period: string, kind: UsdaCommodityConfig["period"]): boolean {
  return kind === "marketing-year" ? /^\d{4}\/\d{2}$/.test(period) : /^\d{4}$/.test(period);
}

function unavailableSupplySeries(
  id: CommoditySupplyDemandSeries["id"],
  label: string,
  reason: string,
): CommoditySupplyDemandSeries {
  return {
    id,
    label,
    status: "unavailable",
    units: null,
    points: [],
    historicalAverage: null,
    historicalAveragePeriod: null,
    reason,
  };
}

function unavailableAnimalInventorySeries(reason: string): CommoditySupplyDemandSeries {
  return unavailableSupplySeries("animal-inventory", "Live-animal inventory", reason);
}

function reportPublicationDate(text: string): string | null {
  const match = text.match(/\bReleased\s+([A-Za-z]+)\s+(\d{1,2}),\s*(\d{4})\b/i);
  if (!match) return null;
  const month = {
    january: "01", february: "02", march: "03", april: "04", may: "05", june: "06",
    july: "07", august: "08", september: "09", october: "10", november: "11", december: "12",
  }[match[1]!.toLowerCase()];
  if (!month) return null;
  const date = `${match[3]}-${month}-${match[2]!.padStart(2, "0")}`;
  return isDate(date) ? date : null;
}

function validUsdaAnimalReportSource(url: string, symbol: string): boolean {
  const filename = symbol === "LE=F" ? "catl\\d{4}" : "hgpg\\d{4}";
  return new RegExp(
    `^https://esmis\\.nal\\.usda\\.gov/sites/default/release-files/(?:[a-z0-9]{1,12}/){1,3}${filename}\\.txt$`,
    "i",
  ).test(url);
}

export function parseUsdaAnimalInventoryArchiveLinks(
  listing: string,
  listingUrl: string,
  symbol: string,
): string[] {
  if (symbol !== "LE=F" && symbol !== "HE=F") return [];
  return [...listing.matchAll(/href=["']([^"']+\.txt)["']/gi)]
    .map((match) => {
      try {
        return new URL(match[1]!.replaceAll("&amp;", "&"), listingUrl).toString();
      } catch {
        return null;
      }
    })
    .filter((url): url is string => Boolean(url && validUsdaAnimalReportSource(url, symbol)))
    .filter((url, index, urls) => urls.indexOf(url) === index)
    .slice(0, symbol === "LE=F" ? 10 : 8);
}

function reportCodeMatchesPublicationDate(url: string, publicationDate: string, symbol: string): boolean {
  const match = url.match(/(?:catl|hgpg)(\d{2})(\d{2})\.txt$/i);
  return Boolean(match && match[1] === publicationDate.slice(5, 7)
    && match[2] === publicationDate.slice(2, 4)
    && ((symbol === "LE=F" && match[0]?.toLowerCase().startsWith("catl"))
      || (symbol === "HE=F" && match[0]?.toLowerCase().startsWith("hgpg"))));
}

function parseReportNumber(value: string): number | null {
  return parseNumber(value.replaceAll(",", "").trim());
}

function animalInventoryAverage(
  points: CommoditySupplyDemandPoint[],
): { value: number | null; period: string | null } {
  const unitGroups = new Map<string, CommoditySupplyDemandPoint[]>();
  for (const point of points) {
    const month = point.reportingPeriod.slice(5, 7);
    const group = `${point.units}|${month}`;
    unitGroups.set(group, [...(unitGroups.get(group) ?? []), point]);
  }
  const comparable = [...unitGroups.values()]
    .map((group) => group.sort((left, right) => left.reportingPeriod.localeCompare(right.reportingPeriod)))
    .filter((group) => group.length >= 4)
    .sort((left, right) => right.at(-1)!.reportingPeriod.localeCompare(left.at(-1)!.reportingPeriod))[0];
  if (!comparable) return { value: null, period: null };
  const historical = comparable.slice(0, -1);
  return {
    value: historical.reduce((sum, point) => sum + point.value, 0) / historical.length,
    period: `${historical[0]!.reportingPeriod}–${historical.at(-1)!.reportingPeriod} (${historical.length} prior matching periods)`,
  };
}

function parseCattleInventoryRows(
  text: string,
  publicationDate: string,
  sourceUrl: string,
): CommoditySupplyDemandPoint[] {
  const headings = [...text.matchAll(/Cattle Inventory by Class and Calf Crop\s*-\s*United States:\s*(January|July)\s+1,\s*(\d{4})\s+and\s+(\d{4})/gim)];
  return headings.flatMap((heading, index) => {
    const start = heading.index ?? 0;
    const end = headings[index + 1]?.index ?? text.length;
    const table = text.slice(start, end);
    if (!/1,000 head/i.test(table)) return [];
    const row = table.match(/^[ \t]*(?:All )?Cattle and calves[ \t]*\.{2,}:?[ \t]*([^\r\n]*)/im);
    if (!row) return [];
    const month = heading[1]!.toLowerCase() === "january" ? "01" : "07";
    const years = [heading[2]!, heading[3]!];
    const values = row[1]!.trim().split(/[ \t]+/).slice(0, 2);
    return values.flatMap((rawValue, valueIndex) => {
      const value = parseReportNumber(rawValue);
      return value !== null && value >= 0
        ? [{
          commodity: "Live Cattle",
          value,
          units: "1,000 head",
          reportingPeriod: `${years[valueIndex]}-${month}-01`,
          publicationDate,
          source: { title: "USDA NASS Cattle Inventory", url: sourceUrl },
        }]
        : [];
    });
  });
}

function parseHogInventoryRows(
  text: string,
  publicationDate: string,
  sourceUrl: string,
): CommoditySupplyDemandPoint[] {
  const title = [...text.matchAll(/Hogs and Pigs Inventory by Class,\s*Weight Group,\s*and Quarter\s*-\s*United States:\s*(\d{4})\s+and\s+(\d{4})/gim)]
    .find((match) => /1,000 head/i.test(text.slice(match.index, match.index + 4000)));
  if (!title) return [];
  const years = [Number(title[1]), Number(title[2])];
  const revisionsSection = text.match(/\bRevisions\b([\s\S]*?)(?:\bRecords\b|This report was approved)/i)?.[1] ?? "";
  const inventorySections = [...text.matchAll(/^[ \t]*(March|June|September|December)[ \t]+1 inventory[ \t]*:?[^\r\n]*$/gim)];
  const points: CommoditySupplyDemandPoint[] = [];
  for (const [index, section] of inventorySections.entries()) {
    const monthName = section[1]!.toLowerCase();
    const month = { march: "03", june: "06", september: "09", december: "12" }[monthName]!;
    const start = (section.index ?? 0) + section[0].length;
    const end = inventorySections[index + 1]?.index ?? text.length;
    const block = text.slice(start, end);
    const row = block.match(/^\s*All hogs and pigs\s*\.{2,}:?\s*([^\r\n]*)/im);
    if (!row) continue;
    const values = row[1]!.trim().split(/[ \t]+/).slice(0, 2)
      .map((cell) => parseReportNumber(cell))
      .map((value) => value !== null && value >= 0 ? value : null);
    const periodYears = month === "12" && publicationDate.slice(5, 7) !== "12"
      ? [years[0]! - 1, years[1]! - 1]
      : years;
    const assigned = values.length === 1
      ? [{ year: month === "12" ? periodYears[1]! : years[1]!, value: values[0]! }]
      : values.flatMap((value, valueIndex) => value === null
        ? []
        : [{ year: periodYears[valueIndex]!, value }]);
    for (const item of assigned) {
      const reportingPeriod = `${item.year}-${month}-01`;
      if (reportingPeriod > publicationDate) continue;
      const revisionDate = new RegExp(`\\b${section[1]}\\s+${item.year}\\s+all hogs and pigs inventory\\b`, "i")
        .test(revisionsSection) ? publicationDate : undefined;
      points.push({
        commodity: "Live Hogs",
        value: item.value,
        units: "1,000 head",
        reportingPeriod,
        publicationDate,
        ...(revisionDate ? { revisionDate } : {}),
        source: { title: "USDA NASS Quarterly Hogs and Pigs", url: sourceUrl },
      });
    }
  }
  return points;
}

export function parseUsdaAnimalInventoryReports(
  reports: UsdaAnimalInventoryReport[],
  symbol: string,
  now = new Date(),
): CommoditySupplyDemandSeries {
  const cattle = symbol === "LE=F";
  const hogs = symbol === "HE=F";
  if (!cattle && !hogs) return unavailableAnimalInventorySeries("Live-animal inventory is not applicable to this contract.");
  const maxAgeDays = cattle ? USDA_CATTLE_INVENTORY_MAX_AGE_DAYS : USDA_HOG_INVENTORY_MAX_AGE_DAYS;
  const latestPublicationDate = reports
    .filter((report) => validUsdaAnimalReportSource(report.sourceUrl, symbol))
    .map((report) => reportPublicationDate(report.text))
    .filter((date): date is string => Boolean(date && isFresh(date, now, maxAgeDays)))
    .sort()
    .at(-1);
  if (!latestPublicationDate) {
    return unavailableAnimalInventorySeries("No fresh, dated USDA NASS live-animal inventory report is available.");
  }
  const newestReports = reports.filter((report) => {
    const publicationDate = reportPublicationDate(report.text);
    return validUsdaAnimalReportSource(report.sourceUrl, symbol)
      && publicationDate !== null
      && Date.parse(`${publicationDate}T00:00:00.000Z`) <= now.getTime()
      && reportCodeMatchesPublicationDate(report.sourceUrl, publicationDate, symbol);
  });
  const vintagePoints = newestReports.flatMap((report) => {
    const publicationDate = reportPublicationDate(report.text)!;
    if (cattle && !/Cattle Inventory/i.test(report.text.slice(0, 600))) return [];
    if (hogs && !/Quarterly Hogs and Pigs/i.test(report.text.slice(0, 600))) return [];
    return cattle
      ? parseCattleInventoryRows(report.text, publicationDate, report.sourceUrl)
      : parseHogInventoryRows(report.text, publicationDate, report.sourceUrl);
  });
  const latestByPeriod = new Map<string, CommoditySupplyDemandPoint>();
  for (const point of vintagePoints) {
    const previous = latestByPeriod.get(point.reportingPeriod);
    if (!previous || point.publicationDate > previous.publicationDate) latestByPeriod.set(point.reportingPeriod, point);
  }
  const points = [...latestByPeriod.values()]
    .sort((left, right) => left.reportingPeriod.localeCompare(right.reportingPeriod))
    .slice(-12);
  if (!points.length || !points.some((point) => point.publicationDate === latestPublicationDate)) {
    return unavailableAnimalInventorySeries("The current USDA NASS report does not contain a verified comparable inventory value.");
  }
  const units = new Set(points.map((point) => point.units));
  if (units.size !== 1) {
    return unavailableAnimalInventorySeries("USDA NASS inventory values do not share a consistent unit.");
  }
  const average = animalInventoryAverage(points);
  return {
    id: "animal-inventory",
    label: cattle ? "Cattle and calves inventory" : "All hogs and pigs inventory",
    status: "available",
    units: points[0]!.units,
    points,
    historicalAverage: average.value,
    historicalAveragePeriod: average.period,
    reason: null,
  };
}

export async function fetchUsdaAnimalInventorySeries(
  symbol: string,
  now: Date,
): Promise<CommoditySupplyDemandSeries> {
  const cachedResult = await cached<{ series: CommoditySupplyDemandSeries; failure: boolean }>(
    `usda-animal-inventory:${symbol}`,
    6 * 60 * 60 * 1000,
    async () => {
      try {
        const cattle = symbol === "LE=F";
        const listingUrl = cattle ? USDA_CATTLE_REPORTS_URL : USDA_HOG_REPORTS_URL;
        const listing = await fetchText(listingUrl);
        const reportUrls = parseUsdaAnimalInventoryArchiveLinks(listing, listingUrl, symbol);
        const reports = await Promise.all(reportUrls.map(async (sourceUrl) => ({
          sourceUrl,
          text: await fetchText(sourceUrl),
        })));
        const series = parseUsdaAnimalInventoryReports(reports, symbol, now);
        return { series, failure: series.status !== "available" };
      } catch {
        return {
          series: unavailableAnimalInventorySeries("The latest USDA NASS livestock report could not be retrieved or verified."),
          failure: true,
        };
      }
    },
  );
  return cachedResult.series;
}

function createWasdeSeries(
  symbol: string,
  rows: WasdeRow[],
  sourceUrl: string,
  releaseDate: string,
  id: CommoditySupplyDemandSeries["id"],
  label: string,
): CommoditySupplyDemandSeries {
  const config = USDA_COMMODITIES[symbol];
  const attrMatches = (attribute: string) => {
    const normalized = attribute.toLowerCase().trim();
    if (id === "inventory") return normalized === "ending stocks";
    if (id === "production") return normalized === "production";
    if (id === "consumption") return config?.useAttributes.some((item) => item.toLowerCase() === normalized) ?? false;
    if (id === "imports") return normalized === "imports";
    return normalized === "exports";
  };
  const selected = rows.filter((row) => row.region === "United States"
    && row.commodity === config?.commodity
    && (config?.reportTitlePattern.test(row.reportTitle) ?? false)
    && row.releaseDate === releaseDate
    && config !== undefined
    && periodMatches(row.marketYear, config.period)
    && attrMatches(row.attribute));
  const yearGroups = new Map<string, WasdeRow[]>();
  for (const row of selected) yearGroups.set(row.marketYear, [...(yearGroups.get(row.marketYear) ?? []), row]);
  const sortedYears = [...yearGroups.keys()].sort((left, right) => left.localeCompare(right)).slice(-12);
  const candidates: CommoditySupplyDemandPoint[] = [];
  let expectedUnits: string | null = null;
  for (const period of sortedYears) {
    const matches = yearGroups.get(period)!;
    const unique = [...new Map(matches.map((row) => [
      `${row.value.trim()}|${row.unit.trim()}`,
      row,
    ])).values()];
    if (unique.length !== 1) continue;
    const row = unique[0]!;
    const value = parseNumber(row.value);
    const units = row.unit.trim();
    if (value === null || value < 0 || !units) continue;
    if (expectedUnits && expectedUnits !== units) continue;
    expectedUnits = units;
    candidates.push({
      commodity: config?.pointCommodity ?? SUPPORTED_COMMODITIES[symbol]!.name,
      value,
      units,
      reportingPeriod: period,
      publicationDate: releaseDate,
      source: {
        title: `USDA WASDE ${period} supply and use`,
        url: sourceUrl,
      },
    });
  }
  if (!candidates.length || !expectedUnits) {
    return unavailableSupplySeries(id, label, "The latest validated WASDE report does not publish a comparable series.");
  }
  const average = calculateHistoricalAverage(candidates);
  return {
    id,
    label,
    status: "available",
    units: expectedUnits,
    points: candidates,
    historicalAverage: average.value,
    historicalAveragePeriod: average.period,
    reason: null,
  };
}

export function parseUsdaSupplyDemandSeries(
  rows: WasdeRow[],
  sourceUrl: string,
  symbol: string,
  now = new Date(),
): CommoditySupplyDemandContext {
  const commodity = SUPPORTED_COMMODITIES[symbol];
  const config = USDA_COMMODITIES[symbol];
  const unavailable = (reason: string): CommoditySupplyDemandContext => ({
    status: "unavailable",
    commodity: commodity?.name ?? "Unknown commodity",
    series: supplySeriesLabels(symbol).map(({ id, label }) => unavailableSupplySeries(id, label, reason)),
    ...(["LE=F", "HE=F"].includes(symbol)
      ? { animalInventory: unavailableAnimalInventorySeries(reason) }
      : {}),
  });
  if (!commodity || !config || !USDA_SERIES_COMMODITIES.has(symbol) || !validWasdeReportSource(sourceUrl)) {
    return unavailable("No matching validated USDA series is available for this commodity.");
  }
  const matched = rows.filter((row) => row.commodity === config.commodity
    && row.region === "United States"
    && config.reportTitlePattern.test(row.reportTitle)
    && periodMatches(row.marketYear, config.period)
    && isDate(row.releaseDate)
    && Date.parse(`${row.releaseDate}T00:00:00.000Z`) <= now.getTime());
  const releaseDate = matched.map((row) => row.releaseDate).sort().at(-1);
  if (!releaseDate || !isFresh(releaseDate, now, 60)) {
    return unavailable("The latest validated USDA supply-and-use report is stale or unavailable.");
  }
  const series = supplySeriesLabels(symbol).map(({ id, label }) =>
    createWasdeSeries(symbol, matched, sourceUrl, releaseDate, id, label));
  const availableCount = series.filter((item) => item.status === "available").length;
  return {
    status: availableCount === 0 ? "unavailable" : availableCount === series.length ? "available" : "partial",
    commodity: commodity.name,
    series,
  };
}

function calculateHistoricalAverage(
  points: CommoditySupplyDemandPoint[],
): { value: number | null; period: string | null } {
  const ordered = [...points].sort((left, right) => left.reportingPeriod.localeCompare(right.reportingPeriod));
  if (ordered.length < 3) return { value: null, period: null };
  const periods = ordered.map((point) => point.reportingPeriod);
  const periodKind = periods.every((period) => /^\d{4}$/.test(period))
    ? "annual"
    : periods.every((period) => /^\d{4}\/\d{2}$/.test(period))
      ? "marketing-year"
      : periods.every((period) => isDate(period))
        ? "dated"
        : null;
  const units = new Set(ordered.map((point) => point.units));
  if (!periodKind || units.size !== 1) return { value: null, period: null };
  const historical = ordered.slice(0, -1);
  return {
    value: historical.reduce((sum, point) => sum + point.value, 0) / historical.length,
    period: `${historical[0]!.reportingPeriod}–${historical.at(-1)!.reportingPeriod} (${historical.length} prior periods)`,
  };
}

type UsgsMcsDataRow = Record<string, string>;

export function parseUsgsMineralSupplyDemandCsv(
  csv: string,
  sourceUrl: string,
  symbol: string,
  publicationDate: string,
  revisionDate: string,
  now = new Date(),
): CommoditySupplyDemandContext {
  const commodity = SUPPORTED_COMMODITIES[symbol];
  const config = USGS_MCS_COMMODITIES[symbol];
  const unavailable = (reason: string): CommoditySupplyDemandContext => ({
    status: "unavailable",
    commodity: commodity?.name ?? "Unknown commodity",
    series: supplySeriesLabels(symbol).map(({ id, label }) => unavailableSupplySeries(id, label, reason)),
  });
  if (!commodity || !config || !validUsgsMcsSource(sourceUrl)) {
    return unavailable("No matching validated USGS mineral-statistics series is available.");
  }
  if (!isDate(publicationDate) || !isDate(revisionDate)
    || Date.parse(`${publicationDate}T00:00:00.000Z`) > now.getTime()
    || Date.parse(`${revisionDate}T00:00:00.000Z`) > now.getTime()
    || !isFresh(publicationDate, now, USGS_MCS_MAX_AGE_DAYS)
    || !isFresh(revisionDate, now, USGS_MCS_MAX_AGE_DAYS)) {
    return unavailable("The latest validated USGS mineral-statistics release is stale or unavailable.");
  }
  const rows = csvObjects(csv);
  const sourceRows = rows.filter((row) => row["Commodity"] === config.commodity
    && row["Country"] === "United States"
    && /^Salient Statistics.*United States$/i.test(row["Section"] ?? ""));
  const series = supplySeriesLabels(symbol).map(({ id, label }) => {
    const metric = config.rowDetails[id];
    if (!metric) {
      return unavailableSupplySeries(id, label, "USGS does not publish a matching annual series for this metric.");
    }
    const selected = sourceRows.filter((row) => row["Statistics"] === metric.statistic
      && metric.detail.test(row["Statistics_detail"] ?? "")
      && /^\d{4}$/.test(row["Year"] ?? "")
      && Number(row["Year"]) <= now.getUTCFullYear());
    const yearGroups = new Map<string, UsgsMcsDataRow[]>();
    for (const row of selected) {
      const year = row["Year"]!;
      yearGroups.set(year, [...(yearGroups.get(year) ?? []), row]);
    }
    const candidates: CommoditySupplyDemandPoint[] = [];
    let expectedUnits: string | null = null;
    for (const year of [...yearGroups.keys()].sort().slice(-12)) {
      const unique = [...new Map(yearGroups.get(year)!.map((row) => [
        `${row["Value"]?.trim()}|${row["Unit"]?.trim()}`,
        row,
      ])).values()];
      if (unique.length !== 1) continue;
      const row = unique[0]!;
      const value = parseNumber(row["Value"]);
      const units = row["Unit"]?.trim() ?? "";
      if (value === null || value < 0 || !units || (expectedUnits && units !== expectedUnits)) continue;
      expectedUnits = units;
      candidates.push({
        commodity: config.commodity,
        value,
        units,
        reportingPeriod: year,
        publicationDate,
        revisionDate,
        source: {
          title: `USGS Mineral Commodity Summaries ${new Date(`${publicationDate}T00:00:00.000Z`).getUTCFullYear()} (updated ${revisionDate})`,
          url: sourceUrl,
        },
      });
    }
    if (!candidates.length || !expectedUnits) {
      return unavailableSupplySeries(id, label, "The latest validated USGS release does not publish a comparable annual series.");
    }
    const average = calculateHistoricalAverage(candidates);
    return {
      id,
      label,
      status: "available" as const,
      units: expectedUnits,
      points: candidates,
      historicalAverage: average.value,
      historicalAveragePeriod: average.period,
      reason: null,
    };
  });
  const availableCount = series.filter((item) => item.status === "available").length;
  return {
    status: availableCount === 0 ? "unavailable" : availableCount === series.length ? "available" : "partial",
    commodity: commodity.name,
    series,
  };
}

async function loadLatestUsgsMcsReport(now: Date): Promise<UsgsMcsReport | null> {
  for (let offset = 0; offset <= USGS_MCS_SOURCE_YEAR_RANGE; offset += 1) {
    const reportYear = now.getUTCFullYear() - offset;
    try {
      const searchUrl = new URL("https://www.sciencebase.gov/catalog/items");
      searchUrl.searchParams.set("format", "json");
      searchUrl.searchParams.set("q", `Mineral Commodity Summaries ${reportYear} Data Release`);
      searchUrl.searchParams.set("max", "10");
      const search: unknown = JSON.parse(await fetchText(searchUrl.toString()));
      if (!search || typeof search !== "object" || !Array.isArray((search as { items?: unknown }).items)) continue;
      const item = (search as { items: Record<string, unknown>[] }).items.find(
        (candidate) => candidate.title === `Mineral Commodity Summaries ${reportYear} Data Release`
          && typeof candidate.id === "string",
      );
      if (!item || typeof item.id !== "string") continue;
      const metadata: unknown = JSON.parse(await fetchText(
        `https://www.sciencebase.gov/catalog/item/${item.id}?format=json`,
      ));
      if (!metadata || typeof metadata !== "object") continue;
      const data = metadata as {
        dates?: { type?: string; label?: string; dateString?: string }[];
        provenance?: { lastUpdated?: string };
        files?: { name?: string; downloadUri?: string; url?: string }[];
      };
      const publicationDate = data.dates?.find((date) =>
        date.type?.toLowerCase() === "publication" || date.label?.toLowerCase() === "publication date")?.dateString;
      const revisionDate = dateOnly(data.provenance?.lastUpdated) ?? publicationDate;
      const file = data.files?.find((candidate) => candidate.name === `MCS${reportYear}_Commodities_Data.csv`);
      const sourceUrl = file?.downloadUri ?? file?.url;
      if (!publicationDate || !revisionDate || !sourceUrl
        || !isDate(publicationDate) || !isDate(revisionDate)
        || Date.parse(`${publicationDate}T00:00:00.000Z`) > now.getTime()
        || Date.parse(`${revisionDate}T00:00:00.000Z`) > now.getTime()
        || !isFresh(publicationDate, now, USGS_MCS_MAX_AGE_DAYS)
        || !isFresh(revisionDate, now, USGS_MCS_MAX_AGE_DAYS)
        || !validUsgsMcsSource(sourceUrl)) continue;
      const csv = await fetchText(sourceUrl);
      const rows = csvObjects(csv);
      if (!rows.some((row) => row["Year"] && row["Commodity"] && row["Statistics"])) continue;
      return {
        csv,
        sourceUrl,
        publicationDate,
        revisionDate,
      };
    } catch {
      // A release may not yet exist or may be temporarily inaccessible.
    }
  }
  return null;
}

export async function fetchCommoditySupplyDemandContext(
  symbol: string,
  inventory: CommodityInventoryEvidence | null,
  eventCalendar: CommodityEventCalendar,
  now = new Date(),
): Promise<CommoditySupplyDemandContext> {
  const normalized = symbol.trim().toUpperCase();
  const commodity = SUPPORTED_COMMODITIES[normalized];
  if (!commodity) return {
    status: "unavailable",
    commodity: "Unknown commodity",
    series: supplySeriesLabels(normalized).map(({ id, label }) => unavailableSupplySeries(id, label, "Unsupported commodity.")),
  };

  let series: CommoditySupplyDemandSeries[] = [];
  let animalInventory: CommoditySupplyDemandSeries | null = null;
  if (USDA_SERIES_COMMODITIES.has(normalized)) {
    if (normalized === "LE=F" || normalized === "HE=F") {
      animalInventory = await fetchUsdaAnimalInventorySeries(normalized, now);
    }
    try {
      const report = await loadLatestWasdeReport(now, normalized);
      if (report) {
        const context = parseUsdaSupplyDemandSeries(report.rows, report.sourceUrl, normalized, now);
        if (animalInventory) {
          const availableCount = context.series.filter((item) => item.status === "available").length
            + Number(animalInventory.status === "available");
          return {
            ...context,
            status: availableCount === 0 ? "unavailable"
              : availableCount === context.series.length + 1 ? "available" : "partial",
            animalInventory,
          };
        }
        return context;
      }
    } catch {
      // Unavailable series are returned below; no values are inferred.
    }
  } else if (USGS_MCS_COMMODITIES[normalized]) {
    try {
      const report = await cached<UsgsMcsReport | null>(
        `usgs-mcs-report:${now.getUTCFullYear()}`,
        24 * 60 * 60 * 1000,
        () => loadLatestUsgsMcsReport(now),
      );
      if (report) {
        return parseUsgsMineralSupplyDemandCsv(
          report.csv,
          report.sourceUrl,
          normalized,
          report.publicationDate,
          report.revisionDate,
          now,
        );
      }
    } catch {
      // Missing, stale, or invalid USGS files stay unavailable.
    }
  } else if ((normalized === "CL=F" || normalized === "NG=F")
    && inventory?.symbol === normalized
    && inventory.publishedObservations?.length) {
    const eventName = normalized === "CL=F" ? "Petroleum Status" : "Natural Gas Storage";
    const publicationDate = eventCalendar.events
      .filter((item) => item.status === "completed" && item.name.includes(eventName))
      .sort((left, right) => right.eventDate.localeCompare(left.eventDate))[0]?.eventDate;
    if (publicationDate && isDate(publicationDate) && isFresh(publicationDate, now, 14)) {
      const points = [...inventory.publishedObservations]
        .filter((point) => isDate(point.reportingPeriod) && point.reportingPeriod <= inventory.asOf
          && Number.isFinite(point.value) && point.value >= 0 && point.units === inventory.units)
        .sort((left, right) => left.reportingPeriod.localeCompare(right.reportingPeriod))
        .map((point) => ({
          commodity: commodity.name,
          value: point.value,
          units: point.units,
          reportingPeriod: point.reportingPeriod,
          publicationDate,
          source: { title: inventory.source.title, url: inventory.source.url },
        }));
      series = [
        {
          id: "inventory",
          label: normalized === "NG=F" ? "Lower 48 working-gas storage" : "U.S. commercial crude inventory",
          status: points.length ? "available" : "unavailable",
          units: points[0]?.units ?? null,
          points,
          historicalAverage: null,
          historicalAveragePeriod: null,
          reason: points.length ? null : "The current EIA report has no comparable dated inventory observations.",
        },
        ...SUPPLY_SERIES.slice(1).map(({ id, label }) =>
          unavailableSupplySeries(id, label, "No validated comparable production, consumption, import, or export series is available in this report.")),
      ];
    }
  }

  if (!series.length) {
    series = supplySeriesLabels(normalized).map(({ id, label }) =>
      unavailableSupplySeries(id, label, "No fresh, validated historical supply-and-demand series is available."));
  }
  const availableCount = series.filter((item) => item.status === "available").length
    + Number(animalInventory?.status === "available");
  const totalCount = series.length + Number(animalInventory !== null);
  return {
    status: availableCount === 0 ? "unavailable" : availableCount === totalCount ? "available" : "partial",
    commodity: commodity.name,
    series,
    ...(animalInventory ? { animalInventory } : {}),
  };
}

export function validateCommoditySupplyDemandContext(
  context: CommoditySupplyDemandContext,
  symbol: string,
  now: Date,
): CommoditySupplyDemandContext {
  const normalized = symbol.trim().toUpperCase();
  const commodity = SUPPORTED_COMMODITIES[normalized];
  const empty = (reason: string): CommoditySupplyDemandContext => ({
    status: "unavailable",
    commodity: commodity?.name ?? "Unknown commodity",
    series: supplySeriesLabels(normalized).map(({ id, label }) => unavailableSupplySeries(id, label, reason)),
    ...(["LE=F", "HE=F"].includes(normalized)
      ? { animalInventory: unavailableAnimalInventorySeries(reason) }
      : {}),
  });
  if (!commodity || context?.commodity !== commodity.name || !Array.isArray(context.series)) {
    return empty("The supply-and-demand response did not match the selected commodity.");
  }
  const series = SUPPLY_SERIES.map(({ id, label }) => {
    const displayLabel = supplySeriesLabels(normalized).find((item) => item.id === id)?.label ?? label;
    const candidate = context.series.find((item) => item?.id === id);
    if (!candidate || !Array.isArray(candidate.points)) {
      return unavailableSupplySeries(id, displayLabel, "No validated comparable series is available.");
    }
    const points = candidate.points.filter((point) => {
      const expectedPointCommodity = USDA_COMMODITIES[normalized]?.pointCommodity
        ?? USGS_MCS_COMMODITIES[normalized]?.commodity
        ?? commodity.name;
      if (!point || point.commodity !== expectedPointCommodity || !Number.isFinite(point.value)
        || point.value < 0 || typeof point.units !== "string" || !point.units.trim()
        || typeof point.reportingPeriod !== "string"
        || typeof point.publicationDate !== "string"
        || !point.source?.title?.trim()
        || !/^https:\/\//i.test(point.source.url)) return false;
      const isUsda = validWasdeReportSource(point.source.url);
      const isEia = point.source.url === EIA_TABLE_URL || point.source.url === EIA_NATURAL_GAS_URL;
      const isUsgs = validUsgsMcsSource(point.source.url);
      if ((normalized === "CL=F" && point.source.url !== EIA_TABLE_URL)
        || (normalized === "NG=F" && point.source.url !== EIA_NATURAL_GAS_URL)
        || (USDA_SERIES_COMMODITIES.has(normalized) && !isUsda)
        || (USGS_MCS_COMMODITIES[normalized] && !isUsgs)
        || (!USDA_SERIES_COMMODITIES.has(normalized) && !USGS_MCS_COMMODITIES[normalized]
          && normalized !== "CL=F" && normalized !== "NG=F")) return false;
      if (isUsda && (!periodMatches(point.reportingPeriod, USDA_COMMODITIES[normalized]!.period)
        || !isFresh(point.publicationDate, now, 60))) return false;
      if (isEia && (!isDate(point.reportingPeriod) || !isFresh(point.reportingPeriod, now, 120)
        || !isFresh(point.publicationDate, now, 14))) return false;
      if (isUsgs && (!/^\d{4}$/.test(point.reportingPeriod)
        || !isFresh(point.publicationDate, now, USGS_MCS_MAX_AGE_DAYS)
        || !point.revisionDate || !isFresh(point.revisionDate, now, USGS_MCS_MAX_AGE_DAYS))) return false;
      return true;
    });
    const units = points[0]?.units ?? null;
    const comparablePoints = units ? points.filter((point) => point.units === units) : [];
    const valid = candidate.status === "available" && comparablePoints.length > 0;
    const calculatedAverage = candidate.historicalAverage !== null
      && Number.isFinite(candidate.historicalAverage) && candidate.historicalAverage >= 0
      ? calculateHistoricalAverage(comparablePoints)
      : { value: null, period: null };
    return {
      id,
      label: displayLabel,
      status: valid ? "available" as const : "unavailable" as const,
      units: valid ? units : null,
      points: valid ? comparablePoints.slice(-12) : [],
      historicalAverage: valid ? calculatedAverage.value : null,
      historicalAveragePeriod: valid ? calculatedAverage.period : null,
      reason: valid ? null : candidate.reason ?? "No fresh, comparable observations passed validation.",
    };
  });
  const availableCount = series.filter((item) => item.status === "available").length;
  const animalInventory = normalized === "LE=F" || normalized === "HE=F"
    ? validateAnimalInventorySeries(context.animalInventory, normalized, now)
    : null;
  const totalAvailableCount = availableCount + Number(animalInventory?.status === "available");
  const totalCount = series.length + Number(animalInventory !== null);
  return {
    status: totalAvailableCount === 0 ? "unavailable"
      : totalAvailableCount === totalCount ? "available" : "partial",
    commodity: commodity.name,
    series,
    ...(animalInventory ? { animalInventory } : {}),
  };
}

function validateAnimalInventorySeries(
  candidate: CommoditySupplyDemandSeries | null | undefined,
  symbol: string,
  now: Date,
): CommoditySupplyDemandSeries {
  const fallback = unavailableAnimalInventorySeries("No fresh, comparable USDA NASS live-animal inventory is available.");
  if (!candidate || candidate.id !== "animal-inventory" || candidate.status !== "available"
    || !Array.isArray(candidate.points)) {
    return candidate?.reason
      ? unavailableAnimalInventorySeries(candidate.reason)
      : fallback;
  }
  const maxAgeDays = symbol === "LE=F" ? USDA_CATTLE_INVENTORY_MAX_AGE_DAYS : USDA_HOG_INVENTORY_MAX_AGE_DAYS;
  const expectedCommodity = symbol === "LE=F" ? "Live Cattle" : "Live Hogs";
  const validPeriod = symbol === "LE=F"
    ? (period: string) => /^\d{4}-(01|07)-01$/.test(period)
    : (period: string) => /^\d{4}-(03|06|09|12)-01$/.test(period);
  const points = candidate.points.filter((point) => point
    && point.commodity === expectedCommodity
    && Number.isFinite(point.value) && point.value >= 0
    && point.units === "1,000 head"
    && validPeriod(point.reportingPeriod)
    && isDate(point.publicationDate)
    && Date.parse(`${point.publicationDate}T00:00:00.000Z`) <= now.getTime()
    && point.reportingPeriod <= point.publicationDate
    && point.source?.title === (symbol === "LE=F" ? "USDA NASS Cattle Inventory" : "USDA NASS Quarterly Hogs and Pigs")
    && validUsdaAnimalReportSource(point.source.url, symbol)
    && reportCodeMatchesPublicationDate(point.source.url, point.publicationDate, symbol)
    && (!point.revisionDate || (isDate(point.revisionDate)
      && point.revisionDate === point.publicationDate
      && isFresh(point.revisionDate, now, maxAgeDays))));
  const latestByPeriod = new Map<string, CommoditySupplyDemandPoint>();
  for (const point of points) {
    const previous = latestByPeriod.get(point.reportingPeriod);
    if (!previous || point.publicationDate > previous.publicationDate) latestByPeriod.set(point.reportingPeriod, point);
  }
  const comparablePoints = [...latestByPeriod.values()]
    .sort((left, right) => left.reportingPeriod.localeCompare(right.reportingPeriod))
    .slice(-12);
  const units = new Set(comparablePoints.map((point) => point.units));
  const latestPublicationDate = comparablePoints.map((point) => point.publicationDate).sort().at(-1);
  if (!comparablePoints.length || units.size !== 1
    || !latestPublicationDate || !isFresh(latestPublicationDate, now, maxAgeDays)) {
    return unavailableAnimalInventorySeries(candidate.reason ?? fallback.reason!);
  }
  const average = animalInventoryAverage(comparablePoints);
  return {
    id: "animal-inventory",
    label: symbol === "LE=F" ? "Cattle and calves inventory" : "All hogs and pigs inventory",
    status: "available",
    units: comparablePoints[0]!.units,
    points: comparablePoints,
    historicalAverage: average.value,
    historicalAveragePeriod: average.period,
    reason: null,
  };
}

function validWasdeReportSource(url: string): boolean {
  return /^https:\/\/(?:www\.usda\.gov|usda\.azureedge\.us)\/sites\/default\/files\/documents\/oce-wasde-report-data-\d{4}-\d{2}(?:-V\d+)?\.csv$/i.test(url);
}

function validUsgsMcsSource(url: string): boolean {
  return /^https:\/\/www\.sciencebase\.gov\/catalog\/file\/get\/[a-f0-9]{24}\?f=__disk__/i.test(url);
}
