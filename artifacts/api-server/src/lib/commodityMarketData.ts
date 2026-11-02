import {
  CFTC_INSTRUMENTS,
  SUPPORTED_COMMODITIES,
  type CommodityInventoryEvidence,
  type CommodityMarketEvidence,
  type CommodityPositioningEvidence,
} from "./commodityAnalysis.ts";

const CFTC_DATASET_URL = "https://publicreporting.cftc.gov/resource/6dca-aqww.json";
const CFTC_SOURCE_URL = "https://publicreportinghub.cftc.gov/Commitments-of-Traders/Legacy-Futures-Only/6dca-aqww";
const EIA_TABLE_URL = "https://ir.eia.gov/wpsr/table4.csv";
const EIA_NATURAL_GAS_URL = "https://ir.eia.gov/ngs/wngsr.csv";
const USDA_COMMODITIES: Record<string, { commodity: string; useAttributes: string[] }> = {
  "ZC=F": { commodity: "Corn", useAttributes: ["Use, Total", "Total Use"] },
  "ZW=F": { commodity: "Wheat", useAttributes: ["Use, Total", "Total Use"] },
  "ZS=F": { commodity: "Oilseed, Soybean", useAttributes: ["Use, Total", "Total Use"] },
  "CT=F": { commodity: "Cotton", useAttributes: ["Use, Total", "Total Use"] },
  "SB=F": { commodity: "Sugar", useAttributes: ["Total Use", "Use, Total"] },
};

type CftcRow = Record<string, unknown>;
type WasdeRow = {
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
let wasdeReportCache: { rows: WasdeRow[]; sourceUrl: string; expiresAt: number } | null = null;
let wasdeReportRequest: Promise<{ rows: WasdeRow[]; sourceUrl: string } | null> | null = null;

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
  return {
    provider: "EIA",
    symbol: "CL=F",
    instrument: SUPPORTED_COMMODITIES["CL=F"].name,
    metric: "weekly-stock-change-percent",
    value: changePercent,
    asOf,
    units: "million barrels",
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
  return {
    provider: "EIA",
    symbol: "NG=F",
    instrument: SUPPORTED_COMMODITIES["NG=F"].name,
    metric: "weekly-stock-change-percent",
    value: changePercent,
    asOf,
    units: "billion cubic feet",
    source: {
      title: "EIA Weekly Natural Gas Storage Report",
      url: EIA_NATURAL_GAS_URL,
      asOf,
      unit: "billion cubic feet",
      observation,
    },
  };
}

export function parseUsdaWasdeInventoryCsv(
  rows: WasdeRow[],
  sourceUrl: string,
  symbol: string,
  now = new Date(),
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
  if (!isFresh(releaseDate, now, 60)) return null;

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
    valueCache.set(key, { value, expiresAt: Date.now() + ttlMs });
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

async function loadLatestWasdeReport(now: Date): Promise<{ rows: WasdeRow[]; sourceUrl: string } | null> {
  if (wasdeReportCache && wasdeReportCache.expiresAt > Date.now()) {
    return { rows: wasdeReportCache.rows, sourceUrl: wasdeReportCache.sourceUrl };
  }
  if (wasdeReportRequest) return wasdeReportRequest;
  wasdeReportRequest = (async () => {
    try {
      for (const url of wasdeReportCandidates(now)) {
        try {
          const csv = await fetchText(url);
          const rows = parseUsdaRows(csv);
          const validReleaseExists = rows.some((row) => isDate(row.releaseDate)
            && Date.parse(`${row.releaseDate}T00:00:00.000Z`) <= now.getTime());
          if (!rows.length || !validReleaseExists) continue;
          wasdeReportCache = { rows, sourceUrl: url, expiresAt: Date.now() + 6 * 60 * 60 * 1000 };
          return { rows, sourceUrl: url };
        } catch {
          // A report file may not exist yet or may be served under its revision suffix.
        }
      }
      return null;
    } finally {
      wasdeReportRequest = null;
    }
  })();
  return wasdeReportRequest;
}

async function fetchInventory(
  symbol: string,
  now: Date,
): Promise<CommodityInventoryEvidence | null> {
  if (symbol === "CL=F" || symbol === "NG=F") {
    return cached(`eia-inventory:${symbol}`, 60 * 60 * 1000, async () => {
      try {
        const sourceUrl = symbol === "CL=F" ? EIA_TABLE_URL : EIA_NATURAL_GAS_URL;
        const csv = await fetchText(sourceUrl);
        return symbol === "CL=F"
          ? parseEiaCrudeInventoryCsv(csv, now)
          : parseEiaNaturalGasStorageCsv(csv, now);
      } catch {
        return null;
      }
    });
  }
  if (USDA_COMMODITIES[symbol]) {
    return cached(`usda-inventory:${symbol}`, 6 * 60 * 60 * 1000, async () => {
      const report = await loadLatestWasdeReport(now);
      return report
        ? parseUsdaWasdeInventoryCsv(report.rows, report.sourceUrl, symbol, now)
        : null;
    });
  }
  return null;
}

async function fetchPositioning(
  symbol: string,
  now: Date,
): Promise<CommodityPositioningEvidence | null> {
  const expected = CFTC_INSTRUMENTS[symbol];
  if (!expected) return null;
  return cached(`cftc-positioning:${symbol}`, 60 * 60 * 1000, async () => {
    try {
      const url = new URL(CFTC_DATASET_URL);
      url.searchParams.set("$limit", "1");
      url.searchParams.set("$where", `cftc_contract_market_code='${expected.code}'`);
      url.searchParams.set("$order", "report_date_as_yyyy_mm_dd DESC");
      const rows = await fetchText(url.toString()).then((body) => JSON.parse(body) as CftcRow[]);
      return Array.isArray(rows) ? parseCftcPositioningRows(rows, symbol, now) : null;
    } catch {
      return null;
    }
  });
}

export async function fetchCommodityInventoryEvidence(
  symbol: string,
  now = new Date(),
): Promise<CommodityInventoryEvidence | null> {
  try {
    return await fetchInventory(symbol.trim().toUpperCase(), now);
  } catch {
    return null;
  }
}

export async function fetchCommodityPositioningEvidence(
  symbol: string,
  now = new Date(),
): Promise<CommodityPositioningEvidence | null> {
  try {
    return await fetchPositioning(symbol.trim().toUpperCase(), now);
  } catch {
    return null;
  }
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
