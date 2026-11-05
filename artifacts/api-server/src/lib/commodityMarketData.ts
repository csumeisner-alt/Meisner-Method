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
const FAILED_SOURCE_CACHE_TTL_MS = 5 * 60 * 1000;
const FAILED_WASDE_REPORT_CACHE_TTL_MS = 15 * 60 * 1000;
const USDA_COMMODITIES: Record<string, { commodity: string; useAttributes: string[] }> = {
  "ZC=F": { commodity: "Corn", useAttributes: ["Use, Total", "Total Use"] },
  "ZW=F": { commodity: "Wheat", useAttributes: ["Use, Total", "Total Use"] },
  "ZS=F": { commodity: "Oilseed, Soybean", useAttributes: ["Use, Total", "Total Use"] },
  "CT=F": { commodity: "Cotton", useAttributes: ["Use, Total", "Total Use"] },
  "SB=F": { commodity: "Sugar", useAttributes: ["Total Use", "Use, Total"] },
};
const USDA_SERIES_COMMODITIES = new Set(["ZC=F", "ZW=F", "ZS=F", "CT=F", "SB=F"]);

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
        `https://www.usda.gov/sites/default/files/documents/oce-wasde-report-data-${year}-${month}${revision}.csv`,
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
          const validInventoryExists = parseUsdaWasdeInventory(rows, url, symbol, now, false) !== null;
          if (!rows.length || !validReleaseExists || !validInventoryExists) continue;
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
  if (USDA_COMMODITIES[symbol]) {
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
    && /^U\.S\..*Supply and Use/i.test(row.reportTitle)
    && row.releaseDate === releaseDate
    && /^\d{4}\/\d{2}$/.test(row.marketYear)
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
      commodity: SUPPORTED_COMMODITIES[symbol]!.name,
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
  const historical = candidates.slice(0, -1);
  const historicalAverage = historical.length >= 2
    ? historical.reduce((sum, point) => sum + point.value, 0) / historical.length
    : null;
  const historicalAveragePeriod = historical.length >= 2
    ? `${historical[0]!.reportingPeriod}–${historical.at(-1)!.reportingPeriod} (${historical.length} prior periods)`
    : null;
  return {
    id,
    label,
    status: "available",
    units: expectedUnits,
    points: candidates,
    historicalAverage,
    historicalAveragePeriod,
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
    series: SUPPLY_SERIES.map(({ id, label }) => unavailableSupplySeries(id, label, reason)),
  });
  if (!commodity || !config || !USDA_SERIES_COMMODITIES.has(symbol) || !validWasdeReportSource(sourceUrl)) {
    return unavailable("No matching validated USDA series is available for this commodity.");
  }
  const matched = rows.filter((row) => row.commodity === config.commodity
    && row.region === "United States"
    && /^U\.S\..*Supply and Use/i.test(row.reportTitle)
    && /^\d{4}\/\d{2}$/.test(row.marketYear)
    && isDate(row.releaseDate)
    && Date.parse(`${row.releaseDate}T00:00:00.000Z`) <= now.getTime());
  const releaseDate = matched.map((row) => row.releaseDate).sort().at(-1);
  if (!releaseDate || !isFresh(releaseDate, now, 60)) {
    return unavailable("The latest validated USDA supply-and-use report is stale or unavailable.");
  }
  const series = SUPPLY_SERIES.map(({ id, label }) =>
    createWasdeSeries(symbol, matched, sourceUrl, releaseDate, id, label));
  const availableCount = series.filter((item) => item.status === "available").length;
  return {
    status: availableCount === 0 ? "unavailable" : availableCount === series.length ? "available" : "partial",
    commodity: commodity.name,
    series,
  };
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
    series: SUPPLY_SERIES.map(({ id, label }) => unavailableSupplySeries(id, label, "Unsupported commodity.")),
  };

  let series: CommoditySupplyDemandSeries[] = [];
  if (USDA_SERIES_COMMODITIES.has(normalized)) {
    try {
      const report = await loadLatestWasdeReport(now, normalized);
      if (report) return parseUsdaSupplyDemandSeries(report.rows, report.sourceUrl, normalized, now);
    } catch {
      // Unavailable series are returned below; no values are inferred.
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
    series = SUPPLY_SERIES.map(({ id, label }) =>
      unavailableSupplySeries(id, label, "No fresh, validated historical supply-and-demand series is available."));
  }
  const availableCount = series.filter((item) => item.status === "available").length;
  return {
    status: availableCount === 0 ? "unavailable" : availableCount === series.length ? "available" : "partial",
    commodity: commodity.name,
    series,
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
    series: SUPPLY_SERIES.map(({ id, label }) => unavailableSupplySeries(id, label, reason)),
  });
  if (!commodity || context?.commodity !== commodity.name || !Array.isArray(context.series)) {
    return empty("The supply-and-demand response did not match the selected commodity.");
  }
  const series = SUPPLY_SERIES.map(({ id, label }) => {
    const candidate = context.series.find((item) => item?.id === id);
    if (!candidate || !Array.isArray(candidate.points)) {
      return unavailableSupplySeries(id, label, "No validated comparable series is available.");
    }
    const points = candidate.points.filter((point) => {
      if (!point || point.commodity !== commodity.name || !Number.isFinite(point.value)
        || point.value < 0 || typeof point.units !== "string" || !point.units.trim()
        || typeof point.reportingPeriod !== "string"
        || typeof point.publicationDate !== "string"
        || !point.source?.title?.trim()
        || !/^https:\/\//i.test(point.source.url)) return false;
      const isUsda = validWasdeReportSource(point.source.url);
      const isEia = point.source.url === EIA_TABLE_URL || point.source.url === EIA_NATURAL_GAS_URL;
      if ((normalized === "CL=F" && point.source.url !== EIA_TABLE_URL)
        || (normalized === "NG=F" && point.source.url !== EIA_NATURAL_GAS_URL)
        || (USDA_SERIES_COMMODITIES.has(normalized) && !isUsda)
        || (!USDA_SERIES_COMMODITIES.has(normalized) && normalized !== "CL=F" && normalized !== "NG=F")) return false;
      if (isUsda && (!/^\d{4}\/\d{2}$/.test(point.reportingPeriod)
        || !isFresh(point.publicationDate, now, 60))) return false;
      if (isEia && (!isDate(point.reportingPeriod) || !isFresh(point.reportingPeriod, now, 120)
        || !isFresh(point.publicationDate, now, 14))) return false;
      return true;
    });
    const units = points[0]?.units ?? null;
    const comparablePoints = units ? points.filter((point) => point.units === units) : [];
    const valid = candidate.status === "available" && comparablePoints.length > 0;
    const historicalAverage = candidate.historicalAverage !== null
      && Number.isFinite(candidate.historicalAverage) && candidate.historicalAverage >= 0
      ? candidate.historicalAverage
      : null;
    const historicalAveragePeriod = historicalAverage !== null
      && typeof candidate.historicalAveragePeriod === "string"
      && candidate.historicalAveragePeriod.length > 0
      ? candidate.historicalAveragePeriod
      : null;
    return {
      id,
      label,
      status: valid ? "available" as const : "unavailable" as const,
      units: valid ? units : null,
      points: valid ? comparablePoints.slice(-12) : [],
      historicalAverage: valid ? historicalAverage : null,
      historicalAveragePeriod: valid ? historicalAveragePeriod : null,
      reason: valid ? null : candidate.reason ?? "No fresh, comparable observations passed validation.",
    };
  });
  const availableCount = series.filter((item) => item.status === "available").length;
  return {
    status: availableCount === 0 ? "unavailable" : availableCount === series.length ? "available" : "partial",
    commodity: commodity.name,
    series,
  };
}

function validWasdeReportSource(url: string): boolean {
  return /^https:\/\/www\.usda\.gov\/sites\/default\/files\/documents\/oce-wasde-report-data-\d{4}-\d{2}(?:-V\d+)?\.csv$/i.test(url);
}
