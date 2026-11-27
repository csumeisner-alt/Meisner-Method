import { Router, type Request, type Response } from "express";
import OpenAI from "openai";
import pg from "pg";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { join, dirname } from "node:path";
import {
  fetchStockData,
  computeTechnicalScore,
  computeFundamentalScore,
  computeBehavioralScore,
} from "../lib/yahoo.js";
import { searchYahooHeatMapInstruments, searchYahooStocks } from "../lib/stockSymbolSearch.js";
import { normalizeDividendYield } from "../lib/dividendYield.js";
import { buildStockRecommendation } from "../lib/stockRecommendation.js";
import {
  parseCommodityNewsSources,
  SUPPORTED_COMMODITIES,
  unavailableCommodityNews,
} from "../lib/commodityAnalysis.js";
import {
  fetchCommodityInventoryEvidenceWithStatus,
  fetchCommodityPositioningEvidenceWithStatus,
  fetchCommoditySupplyDemandContext,
} from "../lib/commodityMarketData.js";
import { fetchCommodityEventCalendar } from "../lib/commodityEvents.js";
import { respondWithCommodityAnalysis } from "../lib/commodityAnalysisEndpoint.js";
import {
  buildCommodityRelationshipInterpretationPrompt,
  respondWithCommodityRelationship,
  type CommodityRelationshipHistory,
} from "../lib/commodityRelationshipEndpoint.js";
import type {
  CommodityRelationshipPeriod,
  CommodityRelationshipResult,
  DatedCommodityClose,
} from "../lib/commodityRelationships.js";
import { isValidCommodityRelationshipTradingDate } from "../lib/commodityRelationships.js";
import { respondWithEtfAnalysis } from "../lib/etfAnalysisEndpoint.js";
import { fallbackAiAnalysis, parseAiAnalysis } from "../lib/analysisResponse.js";
import { logger } from "../lib/logger.js";
import {
  heatMapRequestCacheKey,
  isHeatMapCategory,
  isHeatMapPeriod,
  isHeatMapSector,
  isHeatMapResponse,
  normalizeHeatMapSymbols,
  type HeatMapCategory,
  type HeatMapPeriod,
  type HeatMapQuote,
  type HeatMapSector,
  type HeatMapResponse,
} from "../lib/marketHeatMap.js";
import {
  createMarketPulseService,
  getMarketPulseErrorCategory,
} from "../lib/marketPulseService.ts";
import type { MarketPulseRefreshObservation } from "../lib/marketPulseService.ts";
import { createMarketPulseStore } from "../lib/marketPulseStore.js";
import {
  rememberServerMarketPrice,
  rememberServerMarketPriceBatch,
} from "../lib/marketPrice.ts";
import { createMarketPulseRouter } from "./marketPulse.js";

const { Pool } = pg;
const execFileAsync = promisify(execFile);
const __dirname = dirname(fileURLToPath(import.meta.url));
const QUOTE_SCRIPT = join(__dirname, "fetch_quote.py");
const INFO_SCRIPT = join(__dirname, "fetch_info_brief.py");
const CRYPTO_SUPPLY_HISTORY_SCRIPT = join(__dirname, "fetch_crypto_supply_history.py");
const TRENDING_SCRIPT = join(__dirname, "fetch_trending.py");
const TOP_PICKS_SCRIPT = join(__dirname, "fetch_top_picks.py");
const CHART_SCRIPT = join(__dirname, "fetch_chart.py");
const HEAT_MAP_SCRIPT = join(__dirname, "fetch_heatmap.py");

// Cache top picks for 4 hours (screener is expensive — 100+ stocks)
let topPicksCache: { data: unknown; ts: number } | null = null;
const TOP_PICKS_TTL = 4 * 60 * 60 * 1000;
const HEAT_MAP_TTL = 2 * 60 * 1000;
const MARKET_BREADTH_TTL = 60 * 1000;
const MARKET_PULSE_SESSION_TTL = 30 * 1000;
const MARKET_PULSE_FRESHNESS_LIMIT_SECONDS = 5 * 60;
const HEAT_MAP_DETAIL_SUMMARY_TTL = 30 * 1000;
const HEAT_MAP_DETAIL_FUND_DATA_TTL = 15 * 60 * 1000;
const HEAT_MAP_DETAIL_HISTORY_TTL = 6 * 60 * 60 * 1000;
const CRYPTO_SUPPLY_HISTORY_TTL = 6 * 60 * 60 * 1000;
const COMMODITY_NEWS_TTL = 30 * 60 * 1000;
const COMMODITY_RELATIONSHIP_HISTORY_TTL = 10 * 60 * 1000;
const commodityNewsCache = new Map<string, { data: ReturnType<typeof unavailableCommodityNews>; expiresAt: number }>();
const commodityNewsRequests = new Map<string, Promise<ReturnType<typeof unavailableCommodityNews>>>();
const commodityRelationshipHistoryCache = new Map<string, { data: CommodityRelationshipHistory; expiresAt: number }>();
const commodityRelationshipHistoryRequests = new Map<string, Promise<CommodityRelationshipHistory>>();
const heatMapCache = new Map<string, { data: HeatMapResponse; ts: number }>();
const heatMapRequests = new Map<string, Promise<HeatMapResponse>>();
type HeatMapDetailSummaryEntry = {
  summary: Record<string, unknown>;
  etfContext: Record<string, unknown>;
  expiresAt: number;
};
const heatMapDetailSummaryCache = new Map<string, HeatMapDetailSummaryEntry>();
const heatMapDetailSummaryRequests = new Map<string, Promise<HeatMapDetailSummaryEntry>>();
const heatMapDetailSectionCache = new Map<string, { data: unknown; expiresAt: number }>();
const heatMapDetailSectionRequests = new Map<string, Promise<unknown>>();
let marketBreadthCache: { data: HeatMapResponse; ts: number } | null = null;
let marketBreadthRequest: Promise<HeatMapResponse> | null = null;
let marketPulseSessionCache: { marketOpen: boolean; ts: number } | null = null;
let marketPulseSessionRequest: Promise<boolean> | null = null;
let lastMarketPulseProviderTimestamp: number | null = null;
let lastMarketPulseRefreshError: unknown = null;
let marketPulseRefreshFailureActive = false;
let consecutiveMarketPulseRefreshFailures = 0;
let marketPulseStaleActive = false;
let marketPulseFreshnessCheckSequence = 0;
const cryptoSupplyHistoryCache = new Map<
  string,
  { data: CryptoSupplyHistoryPayload; expiresAt: number }
>();
const cryptoSupplyHistoryRequests = new Map<string, Promise<CryptoSupplyHistoryPayload>>();
const marketPulsePool = new Pool({
  connectionString: process.env["DATABASE_URL"],
  connectionTimeoutMillis: 3_000,
});
marketPulsePool.on("error", (err) => {
  logger.error({ err }, "Market-pulse cache database connection error");
});
const marketPulseStore = createMarketPulseStore(
  (text, values) => marketPulsePool.query(text, values),
);

const router = Router();

function isProviderDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const timestamp = Date.parse(`${value}T00:00:00.000Z`);
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString().slice(0, 10) === value;
}

async function fetchCommodityRelationshipHistory(
  symbol: string,
  period: CommodityRelationshipPeriod,
): Promise<CommodityRelationshipHistory> {
  const key = `${symbol}:${period}`;
  const cached = commodityRelationshipHistoryCache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.data;
  const pending = commodityRelationshipHistoryRequests.get(key);
  if (pending) return pending;

  const request = (async () => {
    const { stdout } = await execFileAsync(
      "python3",
      [CHART_SCRIPT, symbol, period, "1d"],
      { timeout: 35_000, maxBuffer: 5 * 1024 * 1024 },
    );
    const raw: unknown = JSON.parse(stdout.trim());
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      throw new Error("Market data provider returned an invalid chart response");
    }
    const payload = raw as Record<string, unknown>;
    if (payload["symbol"] !== symbol
      || payload["period"] !== period
      || payload["interval"] !== "1d"
      || !Array.isArray(payload["candles"])) {
      throw new Error("Market data provider returned mismatched chart history");
    }
    const now = Date.now();
    const today = new Date(now).toISOString().slice(0, 10);
    const points: DatedCommodityClose[] = [];
    const seen = new Set<string>();
    for (const rawCandle of payload["candles"]) {
      if (!rawCandle || typeof rawCandle !== "object" || Array.isArray(rawCandle)) continue;
      const candle = rawCandle as Record<string, unknown>;
      const { date, t, c } = candle;
      if (!isProviderDate(date)
        || !isValidCommodityRelationshipTradingDate({
          symbol,
          name: symbol,
          unit: "provider quote units",
          venue: symbol === "DX-Y.NYB" ? "ICE Futures U.S." : "Provider venue",
        }, date)
        || date > today
        || !Number.isSafeInteger(t)
        || (t as number) <= 0
        || (t as number) > Math.floor(now / 1000) + 86_400
        || typeof c !== "number"
        || !Number.isFinite(c)
        || c <= 0
        || seen.has(date)) {
        continue;
      }
      const timestampDate = new Date((t as number) * 1000).toISOString().slice(0, 10);
      if (Math.abs(Date.parse(`${date}T00:00:00.000Z`) - Date.parse(`${timestampDate}T00:00:00.000Z`)) > 86_400_000) {
        continue;
      }
      seen.add(date);
      points.push({ date, timestamp: t as number, close: c });
    }
    points.sort((left, right) => left.date.localeCompare(right.date));
    const last = points.at(-1);
    if (!last || now - Date.parse(`${last.date}T23:59:59.999Z`) > 7 * 86_400_000) {
      throw new Error("Market data provider returned stale chart history");
    }
    const data: CommodityRelationshipHistory = {
      points,
      source: "Yahoo Finance",
      latestSourceTimestamp: last.timestamp,
    };
    commodityRelationshipHistoryCache.set(key, {
      data,
      expiresAt: now + COMMODITY_RELATIONSHIP_HISTORY_TTL,
    });
    if (commodityRelationshipHistoryCache.size > 80) {
      const oldest = commodityRelationshipHistoryCache.keys().next().value;
      if (oldest !== undefined) commodityRelationshipHistoryCache.delete(oldest);
    }
    return data;
  })();

  commodityRelationshipHistoryRequests.set(key, request);
  try {
    return await request;
  } finally {
    if (commodityRelationshipHistoryRequests.get(key) === request) {
      commodityRelationshipHistoryRequests.delete(key);
    }
  }
}

type CryptoSupplyHistoryPayload = {
  symbol: string;
  provider: "Coin Metrics";
  metric: "SplyCur";
  rangeDays: 30 | 90 | 365;
  interval: "daily";
  startDate: string | null;
  endDate: string | null;
  points: { date: string; supply: number }[];
};

function isCryptoSupplyHistoryPayload(
  value: unknown,
  symbol: string,
  rangeDays: CryptoSupplyHistoryPayload["rangeDays"],
): value is CryptoSupplyHistoryPayload {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const payload = value as Record<string, unknown>;
  const isDate = (date: unknown) => {
    if (typeof date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
    const timestamp = Date.parse(`${date}T00:00:00Z`);
    return Number.isFinite(timestamp) && new Date(timestamp).toISOString().slice(0, 10) === date;
  };
  return payload["symbol"] === symbol
    && payload["provider"] === "Coin Metrics"
    && payload["metric"] === "SplyCur"
    && payload["rangeDays"] === rangeDays
    && payload["interval"] === "daily"
    && (payload["startDate"] === null || isDate(payload["startDate"]))
    && (payload["endDate"] === null || isDate(payload["endDate"]))
    && Array.isArray(payload["points"])
    && payload["points"].length <= rangeDays + 1
    && payload["points"].every((point) => {
      if (!point || typeof point !== "object" || Array.isArray(point)) return false;
      const entry = point as Record<string, unknown>;
      return isDate(entry["date"])
        && typeof entry["supply"] === "number"
        && Number.isFinite(entry["supply"])
        && entry["supply"] > 0;
    });
}

async function fetchCryptoSupplyHistory(
  symbol: string,
  rangeDays: CryptoSupplyHistoryPayload["rangeDays"],
): Promise<CryptoSupplyHistoryPayload> {
  const cacheKey = `${symbol}:${rangeDays}`;
  const cached = cryptoSupplyHistoryCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.data;

  const pending = cryptoSupplyHistoryRequests.get(cacheKey);
  if (pending) return pending;

  const request = (async () => {
    const { stdout } = await execFileAsync(
      "python3",
      [CRYPTO_SUPPLY_HISTORY_SCRIPT, symbol, String(rangeDays)],
      { timeout: 20_000, maxBuffer: 2 * 1024 * 1024 },
    );
    const raw: unknown = JSON.parse(stdout.trim());
    if (!isCryptoSupplyHistoryPayload(raw, symbol, rangeDays)) {
      throw new Error("Market data provider returned an invalid crypto supply history");
    }
    cryptoSupplyHistoryCache.set(cacheKey, {
      data: raw,
      expiresAt: Date.now() + CRYPTO_SUPPLY_HISTORY_TTL,
    });
    if (cryptoSupplyHistoryCache.size > 64) {
      const oldestKey = cryptoSupplyHistoryCache.keys().next().value;
      if (oldestKey !== undefined) cryptoSupplyHistoryCache.delete(oldestKey);
    }
    return raw;
  })();

  cryptoSupplyHistoryRequests.set(cacheKey, request);
  try {
    return await request;
  } finally {
    if (cryptoSupplyHistoryRequests.get(cacheKey) === request) {
      cryptoSupplyHistoryRequests.delete(cacheKey);
    }
  }
}

async function fetchMarketPulseSession(): Promise<boolean> {
  const now = Date.now();
  if (marketPulseSessionCache && now - marketPulseSessionCache.ts < MARKET_PULSE_SESSION_TTL) {
    return marketPulseSessionCache.marketOpen;
  }
  if (marketPulseSessionRequest) return marketPulseSessionRequest;

  const request = (async () => {
    const { stdout } = await execFileAsync(
      "python3",
      [HEAT_MAP_SCRIPT, "stocks", "", "1d", "", "market-pulse-session"],
      { timeout: 10_000, maxBuffer: 1024 * 1024 },
    );
    const raw: unknown = JSON.parse(stdout.trim());
    if (
      !raw ||
      typeof raw !== "object" ||
      typeof (raw as Record<string, unknown>)["marketOpen"] !== "boolean"
    ) {
      throw new Error("Market data provider returned an invalid market-session response");
    }
    const marketOpen = (raw as { marketOpen: boolean }).marketOpen;
    marketPulseSessionCache = { marketOpen, ts: Date.now() };
    return marketOpen;
  })();

  marketPulseSessionRequest = request;
  try {
    return await request;
  } finally {
    if (marketPulseSessionRequest === request) marketPulseSessionRequest = null;
  }
}

const openai = new OpenAI({
  apiKey: process.env["AI_INTEGRATIONS_OPENAI_API_KEY"] ?? process.env["OPENAI_API_KEY"],
  baseURL: process.env["AI_INTEGRATIONS_OPENAI_BASE_URL"] ?? undefined,
});

// ── TTS endpoint — Microsoft Edge neural voice (free, no API key needed) ────
router.get("/tts", async (req, res) => {
  try {
    const text = String(req.query["text"] ?? "").slice(0, 500);
    if (!text) { res.status(400).json({ error: "text required" }); return; }

    // Lazy-require so the import only runs when the route is hit
    const { MsEdgeTTS, OUTPUT_FORMAT } = await import("msedge-tts");
    const tts = new MsEdgeTTS();
    await tts.setMetadata(
      "en-US-AriaNeural",          // warm, natural female voice — comparable to Nova
      OUTPUT_FORMAT.AUDIO_24KHZ_96KBITRATE_MONO_MP3,
    );

    res.set("Content-Type", "audio/mpeg");
    res.set("Cache-Control", "no-store");

    // toStream() returns { audioStream, metadataStream, requestId }
    const { audioStream } = tts.toStream(text);
    audioStream.on("error", (e: Error) => {
      if (!res.headersSent) res.status(500).json({ error: e.message });
    });
    audioStream.pipe(res);
  } catch (e: any) {
    if (!res.headersSent) res.status(500).json({ error: e?.message ?? "tts failed" });
  }
});

const fmt = (n: number | null, d = 2) => (n != null ? n.toFixed(d) : "N/A");
const pct = (n: number | null) => (n != null ? `${(n * 100).toFixed(1)}%` : "N/A");

async function fetchCommodityNews(symbol: string, name: string) {
  const cacheKey = symbol.toUpperCase();
  const cached = commodityNewsCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.data;
  const pending = commodityNewsRequests.get(cacheKey);
  if (pending) return pending;

  const request = (async () => {
    const response = await openai.responses.create({
      model: "gpt-4o-mini",
      tools: [{ type: "web_search" }],
      include: ["web_search_call.action.sources"],
      input: `Search for credible news published in the last 7 days about the ${name} futures market (${symbol}). Summarize only specific, current events that could affect supply, demand, inventories, weather, policy, or market structure. Do not predict prices or infer direction from the number of mentions. If relevant current reporting is unavailable, say so.`,
    }, { timeout: 18_000 });

    const searchCalls = response.output.filter((item) => item.type === "web_search_call");
    const rawSources = searchCalls.flatMap((item) => (
      item.action.type === "search" ? item.action.sources ?? [] : []
    ));
    const sources = parseCommodityNewsSources(rawSources);
    const summary = response.output_text.trim();
    return summary && sources.length
      ? { status: "available" as const, summary: summary.slice(0, 1200), retrievedAt: new Date().toISOString(), sources }
      : unavailableCommodityNews();
  })();

  commodityNewsRequests.set(cacheKey, request);
  try {
    const data = await request;
    commodityNewsCache.set(cacheKey, { data, expiresAt: Date.now() + COMMODITY_NEWS_TTL });
    if (commodityNewsCache.size > 64) {
      const oldest = commodityNewsCache.keys().next().value;
      if (oldest !== undefined) commodityNewsCache.delete(oldest);
    }
    return data;
  } catch (err) {
    logger.warn({ err, symbol }, "Commodity news search unavailable");
    const data = unavailableCommodityNews();
    commodityNewsCache.set(cacheKey, { data, expiresAt: Date.now() + COMMODITY_NEWS_TTL });
    return data;
  } finally {
    if (commodityNewsRequests.get(cacheKey) === request) commodityNewsRequests.delete(cacheKey);
  }
}

function orderCustomHeatMapResponse(data: HeatMapResponse, symbols: string[]): HeatMapResponse {
  if (data.category !== "custom") return data;
  const quotes = new Map(data.quotes.map((quote) => [quote.symbol, quote]));
  const unavailable = new Set(data.unavailableSymbols);
  return {
    ...data,
    quotes: symbols.flatMap((symbol) => {
      const quote = quotes.get(symbol);
      return quote ? [quote] : [];
    }),
    unavailableSymbols: symbols.filter((symbol) => unavailable.has(symbol)),
  };
}

async function fetchHeatMapBatch(
  category: HeatMapCategory,
  symbols: string[],
  period: HeatMapPeriod,
  requestedSector: HeatMapSector | null,
  forceRefresh = false,
  timeoutMs = 75_000,
): Promise<HeatMapResponse> {
  const key = heatMapRequestCacheKey(category, period, symbols, requestedSector);
  const now = Date.now();
  const cached = heatMapCache.get(key);
  if (!forceRefresh && cached && now - cached.ts < HEAT_MAP_TTL) {
    return orderCustomHeatMapResponse(cached.data, symbols);
  }

  const pending = heatMapRequests.get(key);
  if (pending) return pending.then((data) => orderCustomHeatMapResponse(data, symbols));

  const request = (async () => {
    const { stdout } = await execFileAsync(
      "python3",
      [HEAT_MAP_SCRIPT, category, symbols.join(","), period, requestedSector ?? ""],
      { timeout: timeoutMs, maxBuffer: 5 * 1024 * 1024 },
    );
    const raw: unknown = JSON.parse(stdout.trim());
    if (
      raw &&
      typeof raw === "object" &&
      typeof (raw as Record<string, unknown>)["error"] === "string"
    ) {
      throw new Error(String((raw as Record<string, unknown>)["error"]));
    }
    if (!isHeatMapResponse(raw, category, period, requestedSector)) {
      throw new Error("Market data provider returned an invalid heat-map response");
    }
    heatMapCache.set(key, { data: raw, ts: Date.now() });
    if (heatMapCache.size > 100) {
      const oldestKey = heatMapCache.keys().next().value;
      if (oldestKey) heatMapCache.delete(oldestKey);
    }
    return raw;
  })();

  heatMapRequests.set(key, request);
  try {
    return orderCustomHeatMapResponse(await request, symbols);
  } finally {
    heatMapRequests.delete(key);
  }
}

function heatMapProviderErrorStatus(error: unknown): number {
  const detail = error && typeof error === "object"
    ? `${String((error as { message?: unknown }).message ?? "")} ${String((error as { stderr?: unknown }).stderr ?? "")}`
    : String(error ?? "");
  if (/\b429\b|too many requests|rate.?limit/i.test(detail)) return 429;
  if (/timed?\s*out|timeout|ETIMEDOUT|SIGTERM/i.test(detail)) return 504;
  return 503;
}

function respondWithHeatMapProviderError(
  req: Request,
  res: Response,
  error: unknown,
  message: string,
): void {
  const status = heatMapProviderErrorStatus(error);
  req.log.warn({ err: error, status }, "Heat-map detail provider request failed");
  if (status === 429) res.set("Retry-After", "5");
  res.status(status).json({
    error: status === 429 ? "RATE_LIMITED" : status === 504 ? "PROVIDER_TIMEOUT" : "PROVIDER_UNAVAILABLE",
    message,
  });
}

async function fetchHeatMapDetailSummary(
  symbol: string,
): Promise<HeatMapDetailSummaryEntry> {
  const cached = heatMapDetailSummaryCache.get(symbol);
  if (cached && cached.expiresAt > Date.now()) return cached;
  const pending = heatMapDetailSummaryRequests.get(symbol);
  if (pending) return pending;

  const request = (async () => {
    const { stdout } = await execFileAsync(
      "python3",
      [INFO_SCRIPT, symbol, "summary"],
      { timeout: 12_000, maxBuffer: 1024 * 1024 },
    );
    const raw: unknown = JSON.parse(stdout.trim());
    if (!raw || typeof raw !== "object") throw new Error("Invalid market detail summary");
    const result = raw as Record<string, unknown>;
    const summary = result["summary"];
    const etfContext = result["etfContext"];
    if (!summary || typeof summary !== "object" || !etfContext || typeof etfContext !== "object") {
      throw new Error("Market detail summary was incomplete");
    }
    const summaryRecord = summary as Record<string, unknown>;
    const entry: HeatMapDetailSummaryEntry = {
      summary: {
        ...summaryRecord,
        dividendYield: normalizeDividendYield(
          summaryRecord["dividendYield"],
          summaryRecord["dividendRate"],
          summaryRecord["currentPrice"],
        ) ?? null,
      },
      etfContext: etfContext as Record<string, unknown>,
      expiresAt: Date.now() + HEAT_MAP_DETAIL_SUMMARY_TTL,
    };
    heatMapDetailSummaryCache.set(symbol, entry);
    if (heatMapDetailSummaryCache.size > 100) {
      const oldestKey = heatMapDetailSummaryCache.keys().next().value;
      if (oldestKey) heatMapDetailSummaryCache.delete(oldestKey);
    }
    return entry;
  })();
  heatMapDetailSummaryRequests.set(symbol, request);
  try {
    return await request;
  } finally {
    if (heatMapDetailSummaryRequests.get(symbol) === request) {
      heatMapDetailSummaryRequests.delete(symbol);
    }
  }
}

async function fetchHeatMapEtfDetailSection(
  symbol: string,
  section: "etf-fund-data" | "etf-history-fit",
): Promise<unknown> {
  const ttl = section === "etf-fund-data"
    ? HEAT_MAP_DETAIL_FUND_DATA_TTL
    : HEAT_MAP_DETAIL_HISTORY_TTL;
  const key = `${section}:${symbol}`;
  const cached = heatMapDetailSectionCache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.data;
  const pending = heatMapDetailSectionRequests.get(key);
  if (pending) return pending;

  const request = (async () => {
    const summary = await fetchHeatMapDetailSummary(symbol);
    const quoteType = String(summary.etfContext["quoteType"] ?? "").toUpperCase();
    const isEtf = quoteType === "ETF"
      || Boolean(summary.etfContext["category"] && summary.etfContext["fundFamily"]);
    if (!isEtf) {
      const data = section === "etf-fund-data"
        ? {
            symbol,
            status: "unsupported",
            sectorWeights: [],
            sectorWeightsRetrievedAt: null,
            topHoldings: [],
            topHoldingsReportedCount: 0,
            topHoldingsRetrievedAt: null,
            largestSector: null,
            largestSectorWeight: null,
          }
        : { symbol, status: "unsupported", marketRegime: null };
      heatMapDetailSectionCache.set(key, { data, expiresAt: Date.now() + ttl });
      return data;
    }

    const { stdout } = await execFileAsync(
      "python3",
      [INFO_SCRIPT, symbol, section, JSON.stringify(summary.etfContext)],
      {
        timeout: section === "etf-fund-data" ? 18_000 : 24_000,
        maxBuffer: 1024 * 1024,
      },
    );
    const data: unknown = JSON.parse(stdout.trim());
    if (!data || typeof data !== "object" || (data as Record<string, unknown>)["symbol"] !== symbol) {
      throw new Error("Invalid ETF detail response");
    }
    heatMapDetailSectionCache.set(key, { data, expiresAt: Date.now() + ttl });
    if (heatMapDetailSectionCache.size > 200) {
      const oldestKey = heatMapDetailSectionCache.keys().next().value;
      if (oldestKey) heatMapDetailSectionCache.delete(oldestKey);
    }
    return data;
  })();
  heatMapDetailSectionRequests.set(key, request);
  try {
    return await request;
  } finally {
    if (heatMapDetailSectionRequests.get(key) === request) {
      heatMapDetailSectionRequests.delete(key);
    }
  }
}

function refreshMarketBreadthSnapshot(logFailure: boolean): Promise<HeatMapResponse> {
  if (marketBreadthRequest) return marketBreadthRequest;
  const request = (async () => {
    const { stdout } = await execFileAsync(
      "python3",
      [HEAT_MAP_SCRIPT, "stocks", "", "1d", "", "breadth"],
      { timeout: 30_000, maxBuffer: 5 * 1024 * 1024 },
    );
    const raw: unknown = JSON.parse(stdout.trim());
    if (
      raw &&
      typeof raw === "object" &&
      typeof (raw as Record<string, unknown>)["error"] === "string"
    ) {
      throw new Error(String((raw as Record<string, unknown>)["error"]));
    }
    if (!isHeatMapResponse(raw, "stocks", "1d", null)) {
      throw new Error("Market data provider returned an invalid breadth response");
    }
    marketBreadthCache = { data: raw, ts: Date.now() };
    return raw;
  })();
  marketBreadthRequest = request;
  void request.then(
    () => {
      if (marketBreadthRequest === request) marketBreadthRequest = null;
    },
    (err: unknown) => {
      if (marketBreadthRequest === request) marketBreadthRequest = null;
      if (logFailure) logger.warn({ err }, "Background market breadth refresh failed");
    },
  );
  return request;
}

async function fetchMarketBreadthSnapshot(): Promise<HeatMapResponse> {
  const now = Date.now();
  if (marketBreadthCache) {
    if (now - marketBreadthCache.ts >= MARKET_BREADTH_TTL && !marketBreadthRequest) {
      void refreshMarketBreadthSnapshot(true).catch(() => {});
    }
    return marketBreadthCache.data;
  }
  if (marketBreadthRequest) return marketBreadthRequest;
  return refreshMarketBreadthSnapshot(false);
}

const marketPulseService = createMarketPulseService({
  fetchSnapshot: async () => {
    const { stdout } = await execFileAsync(
      "python3",
      [HEAT_MAP_SCRIPT, "stocks", "", "1d", "", "market-pulse"],
      { timeout: 30_000, maxBuffer: 1024 * 1024 },
    );
    const raw: unknown = JSON.parse(stdout.trim());
    if (
      raw &&
      typeof raw === "object" &&
      typeof (raw as Record<string, unknown>)["error"] === "string"
    ) {
      throw new Error(String((raw as Record<string, unknown>)["error"]));
    }
    return raw;
  },
  store: marketPulseStore,
  onRestored: (data) => {
    lastMarketPulseProviderTimestamp = data.priceTimestamp;
    logger.info(
      { priceTimestamp: data.priceTimestamp, updatedAt: data.updatedAt },
      "Restored market-pulse cache",
    );
  },
  onRestoreFailure: (err) => logger.warn({ err }, "Failed to restore market-pulse cache"),
  onRefreshFailure: (err, consecutiveFailures) => {
    if (!marketPulseRefreshFailureActive) {
      const priceTimestamp = lastMarketPulseProviderTimestamp;
      logger.warn({
        provider: "Yahoo",
        success: false,
        priceTimestamp,
        quoteAgeSeconds: priceTimestamp === null
          ? null
          : Math.max(0, Math.floor(Date.now() / 1000) - priceTimestamp),
        timestampAdvanced: false,
        marketOpen: marketPulseSessionCache?.marketOpen ?? null,
        errorCategory: getMarketPulseErrorCategory(err),
        consecutiveFailures,
      }, "Market-pulse quote refresh failed");
    }
    marketPulseRefreshFailureActive = true;
    consecutiveMarketPulseRefreshFailures = consecutiveFailures;
    lastMarketPulseRefreshError = err;
  },
  onRefreshSuccess: (observation: MarketPulseRefreshObservation) => {
    lastMarketPulseProviderTimestamp = observation.priceTimestamp;
    if (marketPulseRefreshFailureActive) {
      logger.info({
        provider: "Yahoo",
        success: true,
        ...observation,
        consecutiveFailures: consecutiveMarketPulseRefreshFailures,
      }, "Market-pulse quote refresh recovered");
      marketPulseRefreshFailureActive = false;
      consecutiveMarketPulseRefreshFailures = 0;
      lastMarketPulseRefreshError = null;
    }

    const sequence = ++marketPulseFreshnessCheckSequence;
    void fetchMarketPulseSession().then((marketOpen) => {
      if (sequence !== marketPulseFreshnessCheckSequence) return;
      const quoteAgeSeconds = Math.max(
        0,
        Math.floor(Date.now() / 1000) - observation.priceTimestamp,
      );
      const stale = marketOpen && quoteAgeSeconds > MARKET_PULSE_FRESHNESS_LIMIT_SECONDS;
      if (stale && !marketPulseStaleActive) {
        logger.warn({
          provider: "Yahoo",
          success: true,
          marketOpen,
          stale: true,
          freshnessLimitSeconds: MARKET_PULSE_FRESHNESS_LIMIT_SECONDS,
          priceTimestamp: observation.priceTimestamp,
          updatedAt: observation.updatedAt,
          quoteAgeSeconds,
          previousPriceTimestamp: observation.previousPriceTimestamp,
          timestampAdvanced: observation.timestampAdvanced,
        }, "Market-pulse quote became stale during regular session");
      } else if (!stale && marketPulseStaleActive) {
        logger.info({
          provider: "Yahoo",
          success: true,
          marketOpen,
          stale: false,
          priceTimestamp: observation.priceTimestamp,
          updatedAt: observation.updatedAt,
          quoteAgeSeconds,
          previousPriceTimestamp: observation.previousPriceTimestamp,
          timestampAdvanced: observation.timestampAdvanced,
          recoveredBy: marketOpen ? "fresh_quote" : "market_closed",
        }, "Market-pulse stale state cleared");
      }
      marketPulseStaleActive = stale;
    }).catch(() => {
      // The endpoint's existing error handler reports market-session failures.
    });
  },
  onPersistFailure: (err) => logger.warn({ err }, "Failed to persist market-pulse snapshot"),
  onWarmed: (data, elapsedMs) => {
    logger.info(
      { priceTimestamp: data.priceTimestamp, elapsedMs },
      "Market-pulse cache warmed",
    );
  },
});
router.use(createMarketPulseRouter(
  marketPulseService,
  fetchMarketPulseSession,
  (err) => {
    if (err === lastMarketPulseRefreshError) return;
    logger.error({
      errorCategory: getMarketPulseErrorCategory(err),
      marketOpen: marketPulseSessionCache?.marketOpen ?? null,
    }, "Market-pulse endpoint request failed");
  },
));

export function warmMarketPulseCache(): void {
  void marketPulseService.warm();
}

router.get("/stocks/market-breadth", async (req, res) => {
  try {
    const data = await fetchMarketBreadthSnapshot();
    res.set("Cache-Control", "public, max-age=30").json(data);
  } catch (err: any) {
    req.log.error({ err }, "Market breadth quote batch failed");
    res.status(422).json({
      error: "MARKET_BREADTH_FAILED",
      message: "Market breadth is temporarily unavailable. Try again shortly.",
    });
  }
});

router.get("/stocks/heat-map", async (req, res) => {
  const rawCategory = req.query["category"];
  const category = typeof rawCategory === "string" ? rawCategory.toLowerCase() : "";
  if (!isHeatMapCategory(category)) {
    res.status(400).json({
      error: "INVALID_CATEGORY",
      message: "Choose stocks, ETFs, commodities, futures, cryptocurrency, or custom.",
    });
    return;
  }

  const rawPeriod = req.query["period"] ?? "1d";
  const period = typeof rawPeriod === "string" ? rawPeriod.toLowerCase() : "";
  if (!isHeatMapPeriod(period)) {
    res.status(400).json({
      error: "INVALID_PERIOD",
      message: "Choose 1d, 1w, 1m, 3m, 6m, 1y, 3y, 5y, or max.",
    });
    return;
  }

  const rawSector = req.query["sector"];
  let requestedSector: HeatMapSector | null = null;
  if (rawSector !== undefined) {
    if (category !== "stocks" || typeof rawSector !== "string" || !isHeatMapSector(rawSector)) {
      res.status(400).json({
        error: "INVALID_SECTOR",
        message: "Choose a supported sector for the Stocks heat map.",
      });
      return;
    }
    requestedSector = rawSector;
  }

  const normalized = normalizeHeatMapSymbols(req.query["symbols"]);
  if (normalized.invalid || (category === "custom" && normalized.symbols.length > 40)) {
    res.status(400).json({
      error: "INVALID_SYMBOLS",
      message: "Use up to 40 valid ticker symbols.",
    });
    return;
  }
  if (category !== "custom" && normalized.symbols.length > 0) {
    res.status(400).json({
      error: "UNEXPECTED_SYMBOLS",
      message: "Ticker symbols are only accepted for a custom heat map.",
    });
    return;
  }

  if (category === "custom" && normalized.symbols.length === 0) {
    res.set("Cache-Control", "private, max-age=30").json({
      category,
      period,
      requestedSector: null,
      quotes: [],
      unavailableSymbols: [],
      updatedAt: Math.floor(Date.now() / 1000),
    });
    return;
  }

  try {
    const data = await fetchHeatMapBatch(category, normalized.symbols, period, requestedSector);
    res
      .set("Cache-Control", category === "custom" ? "private, max-age=60" : "public, max-age=60")
      .json(data);
  } catch (err: any) {
    req.log.error({ err, category }, "Market heat-map quote batch failed");
    res.status(422).json({
      error: "HEAT_MAP_FAILED",
      message: "Market data is temporarily unavailable. Try refreshing the map.",
    });
  }
});

router.get("/stocks/heat-map/quote/:symbol", async (req, res) => {
  const normalized = normalizeHeatMapSymbols(req.params["symbol"]);
  if (normalized.invalid || normalized.symbols.length !== 1) {
    res.status(400).json({ error: "INVALID_SYMBOL", message: "Use one valid ticker symbol." });
    return;
  }
  const [symbol] = normalized.symbols;
  if (!symbol) {
    res.status(400).json({ error: "INVALID_SYMBOL", message: "Use one valid ticker symbol." });
    return;
  }
  try {
    const data = await fetchHeatMapBatch("custom", [symbol], "1d", null, true, 20_000);
    const quote = data.quotes.find((item) => item.symbol.toUpperCase() === symbol);
    if (!quote) {
      res.status(404).json({ error: "QUOTE_NOT_FOUND", message: "A current heat-map quote is unavailable for this ticker." });
      return;
    }
    res.set("Cache-Control", "private, no-store").json(quote);
  } catch (error) {
    respondWithHeatMapProviderError(req, res, error, "This ticker's quote is temporarily unavailable.");
  }
});

router.get("/stocks/heat-map/detail/:symbol/summary", async (req, res) => {
  const normalized = normalizeHeatMapSymbols(req.params["symbol"]);
  if (normalized.invalid || normalized.symbols.length !== 1) {
    res.status(400).json({ error: "INVALID_SYMBOL", message: "Use one valid ticker symbol." });
    return;
  }
  const [symbol] = normalized.symbols;
  if (!symbol) {
    res.status(400).json({ error: "INVALID_SYMBOL", message: "Use one valid ticker symbol." });
    return;
  }
  try {
    const result = await fetchHeatMapDetailSummary(symbol);
    res.set("Cache-Control", "private, max-age=30").json(result.summary);
  } catch (error) {
    respondWithHeatMapProviderError(req, res, error, "Market statistics are temporarily unavailable.");
  }
});

router.get("/stocks/heat-map/detail/:symbol/etf-fund-data", async (req, res) => {
  const normalized = normalizeHeatMapSymbols(req.params["symbol"]);
  if (normalized.invalid || normalized.symbols.length !== 1) {
    res.status(400).json({ error: "INVALID_SYMBOL", message: "Use one valid ticker symbol." });
    return;
  }
  const [symbol] = normalized.symbols;
  if (!symbol) {
    res.status(400).json({ error: "INVALID_SYMBOL", message: "Use one valid ticker symbol." });
    return;
  }
  try {
    const data = await fetchHeatMapEtfDetailSection(symbol, "etf-fund-data");
    res.set("Cache-Control", "private, max-age=900").json(data);
  } catch (error) {
    respondWithHeatMapProviderError(req, res, error, "ETF holdings data is temporarily unavailable.");
  }
});

router.get("/stocks/heat-map/detail/:symbol/etf-history-fit", async (req, res) => {
  const normalized = normalizeHeatMapSymbols(req.params["symbol"]);
  if (normalized.invalid || normalized.symbols.length !== 1) {
    res.status(400).json({ error: "INVALID_SYMBOL", message: "Use one valid ticker symbol." });
    return;
  }
  const [symbol] = normalized.symbols;
  if (!symbol) {
    res.status(400).json({ error: "INVALID_SYMBOL", message: "Use one valid ticker symbol." });
    return;
  }
  try {
    const data = await fetchHeatMapEtfDetailSection(symbol, "etf-history-fit");
    res.set("Cache-Control", "private, max-age=21600").json(data);
  } catch (error) {
    respondWithHeatMapProviderError(req, res, error, "ETF market-history data is temporarily unavailable.");
  }
});

router.post("/stocks/heat-map/validate", async (req, res) => {
  const rawSymbol = req.body?.symbol;
  const normalized = normalizeHeatMapSymbols(rawSymbol);
  if (
    typeof rawSymbol !== "string" ||
    rawSymbol.includes(",") ||
    normalized.invalid ||
    normalized.symbols.length !== 1
  ) {
    res.status(400).json({
      error: "INVALID_SYMBOL",
      message: "Enter one valid ticker symbol.",
    });
    return;
  }

  try {
    const data = await fetchHeatMapBatch("custom", normalized.symbols, "1d", null);
    const quote = data.quotes.find((item) => item.symbol === normalized.symbols[0]);
    if (!quote) {
      res.status(422).json({
        error: "QUOTE_UNAVAILABLE",
        message: "No current or recent quote was found for that ticker.",
      });
      return;
    }
    res.set("Cache-Control", "private, max-age=60").json(quote);
  } catch (err: any) {
    req.log.error({ err, symbol: normalized.symbols[0] }, "Custom heat-map ticker validation failed");
    res.status(422).json({
      error: "MARKET_DATA_TEMPORARILY_UNAVAILABLE",
      message: "Market data is temporarily unavailable. Try again.",
    });
  }
});

// Top picks — multi-factor screener with 4-hour cache
router.get("/stocks/top-picks", async (_req, res) => {
  const now = Date.now();
  if (topPicksCache && now - topPicksCache.ts < TOP_PICKS_TTL) {
    res.json(topPicksCache.data);
    return;
  }
  try {
    const { stdout } = await execFileAsync("python3", [TOP_PICKS_SCRIPT], {
      timeout: 180_000,
      maxBuffer: 5 * 1024 * 1024,
    });
    const data = JSON.parse(stdout.trim());
    if ((data as any).error) {
      res.status(422).json({ error: "PICKS_FAILED", message: (data as any).error });
      return;
    }
    topPicksCache = { data, ts: now };
    res.json(data);
  } catch (err: any) {
    res.status(422).json({ error: "PICKS_FAILED", message: err.message });
  }
});

// Chart OHLCV + moving averages, including provider-backed adjusted-return metadata.
async function respondWithStockChart(
  symbolValue: string,
  period: string,
  interval: string,
  res: Response,
) {
  const symbol = symbolValue.toUpperCase().trim();
  const VALID_PERIODS = ["5d", "1mo", "3mo", "6mo", "1y", "2y", "3y", "5y", "max"];
  const VALID_INTERVALS = ["15m", "1h", "1d", "1wk"];
  if (!symbol || !VALID_PERIODS.includes(period) || !VALID_INTERVALS.includes(interval)) {
    res.status(400).json({ error: "INVALID_PARAMS" });
    return;
  }
  try {
    const { stdout } = await execFileAsync(
      "python3", [CHART_SCRIPT, symbol, period, interval],
      { timeout: 30_000, maxBuffer: 5 * 1024 * 1024 }
    );
    res.json(JSON.parse(stdout.trim()));
  } catch (err: any) {
    res.status(422).json({ error: "CHART_FAILED", message: err.message });
  }
}

// Typed path-based endpoint for the generated mobile API client.
router.get("/stocks/chart/:symbol/:period/:interval", async (req, res) => {
  await respondWithStockChart(
    req.params["symbol"] ?? "",
    req.params["period"] ?? "",
    req.params["interval"] ?? "",
    res,
  );
});

// Backwards-compatible query-string endpoint used by existing chart-history callers.
router.get("/stocks/chart/:symbol", async (req, res) => {
  await respondWithStockChart(
    req.params["symbol"] ?? "",
    (req.query["period"] as string) || "3mo",
    (req.query["interval"] as string) || "1d",
    res,
  );
});

router.get("/stocks/commodity-relationships/:relationshipId/:period", async (req, res) => {
  await respondWithCommodityRelationship(
    res,
    req.params["relationshipId"],
    req.params["period"],
    {
      fetchHistory: fetchCommodityRelationshipHistory,
      interpret: async (result: CommodityRelationshipResult) => {
        const response = await openai.responses.create({
          model: "gpt-4o-mini",
          input: buildCommodityRelationshipInterpretationPrompt(result),
        }, { timeout: 15_000 });
        const text = response.output_text.trim();
        if (!text) throw new Error("The interpretation model returned no text");
        return text;
      },
      now: () => new Date(),
      onInterpretationFailure: (err, relationshipId) => {
        logger.warn({ err, relationshipId }, "Commodity relationship interpretation unavailable");
      },
    },
  );
});

// Trending / most-active stocks with live price data
router.get("/stocks/trending", async (_req, res) => {
  try {
    const { stdout } = await execFileAsync("python3", [TRENDING_SCRIPT], {
      timeout: 45_000,
      maxBuffer: 1024 * 1024,
    });
    const raw = JSON.parse(stdout.trim());
    if (raw["error"]) {
      res.status(422).json({ error: "TRENDING_FAILED", message: raw["error"] });
      return;
    }
    res.json(raw);
  } catch (err: any) {
    res.status(422).json({ error: "TRENDING_FAILED", message: err.message });
  }
});

// Historical on-chain supply, separate from current quote statistics and max-supply share.
async function respondWithCryptoSupplyHistory(
  req: Request<{ symbol: string; rangeDays?: string }>,
  res: Response,
  requestedRange: unknown,
) {
  const symbol = (req.params["symbol"] ?? "").toUpperCase().trim();
  const rangeDays = requestedRange === undefined
    ? 365
    : requestedRange === "30"
      ? 30
      : requestedRange === "90"
        ? 90
        : requestedRange === "365"
          ? 365
          : null;
  if (!/^[A-Z0-9]+-USD$/.test(symbol)) {
    res.status(400).json({ error: "INVALID_SYMBOL", message: "A crypto symbol ending in -USD is required" });
    return;
  }
  if (rangeDays === null) {
    res.status(400).json({ error: "INVALID_RANGE", message: "rangeDays must be 30, 90, or 365" });
    return;
  }
  try {
    res.json(await fetchCryptoSupplyHistory(symbol, rangeDays));
  } catch (err: any) {
    logger.warn({ err, symbol }, "Crypto supply history provider request failed");
    res.status(422).json({ error: "SUPPLY_HISTORY_FAILED", message: "Historical crypto supply is temporarily unavailable" });
  }
}
router.get("/stocks/crypto/:symbol/supply-history", async (req, res) => {
  await respondWithCryptoSupplyHistory(req, res, undefined);
});
router.get("/stocks/crypto/:symbol/supply-history/:rangeDays", async (req, res) => {
  await respondWithCryptoSupplyHistory(req, res, req.params["rangeDays"]);
});

// Brief stock info — company name, sector, dividend yield (for paper trading)
router.get("/stocks/info/:symbol", async (req, res) => {
  const symbol = (req.params["symbol"] ?? "").toUpperCase().trim();
  if (!symbol) {
    res.status(400).json({ error: "INVALID_SYMBOL", message: "Symbol is required" });
    return;
  }
  try {
    const { stdout } = await execFileAsync("python3", [INFO_SCRIPT, symbol], {
      timeout: 30_000,
      maxBuffer: 1024 * 1024,
    });
    const raw = JSON.parse(stdout.trim());
    if (raw["error"]) {
      res.status(422).json({ error: "INFO_FAILED", message: raw["error"] });
      return;
    }
    res.json({
      ...raw,
      dividendYield: normalizeDividendYield(raw["dividendYield"], raw["dividendRate"], raw["currentPrice"]) || null,
    });
  } catch (err: any) {
    res.status(422).json({ error: "INFO_FAILED", message: err.message });
  }
});

// Company-name and ticker autocomplete for the Analyze Stock search field.
router.get("/stocks/search", async (req, res) => {
  const rawQuery = req.query["q"];
  const query = typeof rawQuery === "string" ? rawQuery.trim() : "";
  if (query.length < 2 || query.length > 80) {
    res.status(400).json({
      error: "INVALID_QUERY",
      message: "Search text must be between 2 and 80 characters.",
    });
    return;
  }

  try {
    const suggestions = await searchYahooStocks(query);
    res.set("Cache-Control", "private, max-age=30").json(suggestions);
  } catch (err: any) {
    req.log.error({ err }, "Company symbol search failed");
    res.status(502).json({
      error: "STOCK_SEARCH_FAILED",
      message: "Company search is temporarily unavailable.",
    });
  }
});

router.get("/stocks/heat-map/search", async (req, res) => {
  const rawQuery = req.query["q"];
  const query = typeof rawQuery === "string" ? rawQuery.trim() : "";
  const rawCategory = req.query["category"];
  const category = typeof rawCategory === "string" ? rawCategory.toLowerCase() : "";
  const searchCategory = category === "etfs"
    ? "etf"
    : category === "commodities"
      ? "commodity"
      : category === "futures"
        ? "future"
        : category === "cryptocurrency"
          ? "cryptocurrency"
          : null;

  if (query.length < 2 || query.length > 80 || !searchCategory) {
    res.status(400).json({
      error: "INVALID_QUERY",
      message: "Enter 2 to 80 characters and choose ETFs, commodities, futures, or cryptocurrency.",
    });
    return;
  }

  try {
    const suggestions = await searchYahooHeatMapInstruments(query, searchCategory);
    res.set("Cache-Control", "private, max-age=30").json(suggestions);
  } catch (err: any) {
    req.log.error({ err, category }, "Custom heat-map instrument search failed");
    res.status(502).json({
      error: "INSTRUMENT_SEARCH_FAILED",
      message: "Instrument search is temporarily unavailable.",
    });
  }
});

// Fast quote — current price only, no AI
router.get("/stocks/quote/:symbol", async (req, res) => {
  const symbol = (req.params["symbol"] ?? "").toUpperCase().trim();
  if (!symbol) {
    res.status(400).json({ error: "INVALID_SYMBOL", message: "Symbol is required" });
    return;
  }
  try {
    const { stdout } = await execFileAsync("python3", [QUOTE_SCRIPT, symbol], {
      timeout: 30_000,
      maxBuffer: 1024 * 1024,
    });
    const raw = JSON.parse(stdout.trim());
    if (raw["error"]) {
      res.status(422).json({ error: "QUOTE_FAILED", message: raw["error"] });
      return;
    }
    if (typeof raw["currentPrice"] === "number") {
      rememberServerMarketPrice(symbol, raw["currentPrice"]);
    }
    res.json(raw);
  } catch (err: any) {
    res.status(422).json({ error: "QUOTE_FAILED", message: err.message });
  }
});

router.post("/stocks/quotes", async (req, res) => {
  const rawSymbols: unknown = req.body?.symbols;
  const symbolPattern = /^[A-Z0-9.^=-]{1,15}$/;
  if (
    !Array.isArray(rawSymbols) ||
    rawSymbols.length === 0 ||
    rawSymbols.length > 500 ||
    rawSymbols.some((symbol) => typeof symbol !== "string" || !symbolPattern.test(symbol.trim().toUpperCase()))
  ) {
    res.status(400).json({
      error: "INVALID_SYMBOLS",
      message: "Provide between 1 and 500 valid ticker symbols.",
    });
    return;
  }

  const symbols = [...new Set((rawSymbols as string[]).map((symbol) => symbol.trim().toUpperCase()))];
  try {
    const { stdout } = await execFileAsync(
      "python3",
      [QUOTE_SCRIPT, "--batch", JSON.stringify(symbols)],
      { timeout: 60_000, maxBuffer: 2 * 1024 * 1024 },
    );
    const raw: unknown = JSON.parse(stdout.trim());
    if (
      !raw ||
      typeof raw !== "object" ||
      !Array.isArray((raw as Record<string, unknown>)["quotes"]) ||
      !Array.isArray((raw as Record<string, unknown>)["unavailableSymbols"])
    ) {
      throw new Error("Market data provider returned an invalid quote batch");
    }
    rememberServerMarketPriceBatch((raw as { quotes: unknown[] }).quotes);
    res.set("Cache-Control", "private, max-age=0").json(raw);
  } catch (err: any) {
    req.log.error({ err }, "Portfolio quote batch failed");
    res.status(422).json({
      error: "QUOTE_BATCH_FAILED",
      message: "Market data is temporarily unavailable. Try refreshing your portfolio.",
    });
  }
});

router.post("/stocks/analyze", async (req, res) => {
  const { symbol, includeCommentary } = req.body as {
    symbol?: string;
    includeCommentary?: boolean;
  };

  if (!symbol || typeof symbol !== "string") {
    res.status(400).json({ error: "INVALID_SYMBOL", message: "Symbol is required" });
    return;
  }

  const commodity = SUPPORTED_COMMODITIES[symbol.trim().toUpperCase()];
  try {
    req.log.info({ symbol }, "Analyzing stock");

    const commodityDataAsOf = new Date();
    const inventoryRequest = commodity
      ? fetchCommodityInventoryEvidenceWithStatus(symbol, commodityDataAsOf)
      : Promise.resolve({ evidence: null, failure: null });
    const positioningRequest = commodity
      ? fetchCommodityPositioningEvidenceWithStatus(symbol, commodityDataAsOf)
      : Promise.resolve({ evidence: null, failure: null });
    const data = await fetchStockData(symbol);
    if (commodity) {
      await respondWithCommodityAnalysis(res, data, {
        fetchInventory: async () => inventoryRequest,
        fetchPositioning: async () => positioningRequest,
        fetchNews: fetchCommodityNews,
        fetchEvents: fetchCommodityEventCalendar,
        fetchSupplyDemand: fetchCommoditySupplyDemandContext,
        async createCompletion(prompt, maxTokens) {
          const completion = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            max_tokens: maxTokens,
            temperature: 0,
            messages: [{ role: "user", content: prompt }],
            response_format: { type: "json_object" },
          });
          return completion.choices[0]?.message?.content ?? "";
        },
        now: () => commodityDataAsOf,
        onCommentaryFailure(err, failedSymbol) {
          req.log.warn({ err, symbol: failedSymbol }, "Commodity AI explanation unavailable");
        },
      }, { includeCommentary });
      return;
    }
    if (data.quoteType === "ETF") {
      await respondWithEtfAnalysis(res, data, {
        async fetchEtfInfo(etfSymbol) {
          const { stdout } = await execFileAsync(
            "python3",
            [INFO_SCRIPT, etfSymbol],
            { timeout: 45_000, maxBuffer: 3 * 1024 * 1024 },
          );
          return JSON.parse(stdout.trim()) as Record<string, any>;
        },
        async createCompletion(prompt, maxTokens) {
          const completion = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            max_tokens: maxTokens,
            temperature: 0,
            messages: [{ role: "user", content: prompt }],
            response_format: { type: "json_object" },
          });
          return completion.choices[0]?.message?.content ?? "";
        },
        now: () => new Date(),
      }, { includeCommentary: includeCommentary !== false });
      return;
    }
    // Keep the public analysis contract in decimal-fraction form even if a
    // provider or a future fetcher returns a percent-like value such as 0.43.
    const normalizedDividendYield = normalizeDividendYield(
      data.dividendYield,
      undefined,
      data.currentPrice,
    );

    const technicalScore = computeTechnicalScore(data);
    const fundamentalScore = computeFundamentalScore(data);
    const behavioralScore = computeBehavioralScore(data);
    const recommendation = buildStockRecommendation({
      currentPrice: data.currentPrice,
      support: data.support,
      resistance: data.resistance,
      week52High: data.week52High,
      week52Low: data.week52Low,
      analystPriceTarget: data.priceTarget,
      technicalScore,
      fundamentalScore,
      behavioralScore,
    });

    const price = data.currentPrice;

    let trend: "uptrend" | "downtrend" | "sideways";
    if (price > data.ma50 && data.ma50 > data.ma200) trend = "uptrend";
    else if (price < data.ma50 && data.ma50 < data.ma200) trend = "downtrend";
    else trend = "sideways";

    let macdSignal: "bullish" | "bearish" | "neutral";
    if (data.macd.histogram > 0.05) macdSignal = "bullish";
    else if (data.macd.histogram < -0.05) macdSignal = "bearish";
    else macdSignal = "neutral";

    let insiderSentiment: "positive" | "negative" | "neutral" = "neutral";
    if (behavioralScore >= 65) insiderSentiment = "positive";
    else if (behavioralScore <= 35) insiderSentiment = "negative";

    const upside = data.priceTarget != null && price > 0
      ? ((data.priceTarget - price) / price * 100).toFixed(1)
      : "N/A";

    const prompt = `You are a senior financial analyst. Explain the following rules-based investment recommendation using the supplied real market data.

STOCK: ${data.symbol} (${data.companyName}) — ${data.exchange}
PRICE: $${fmt(price)} | Change: ${data.priceChange >= 0 ? "+" : ""}${fmt(data.priceChange)} (${data.priceChangePercent >= 0 ? "+" : ""}${fmt(data.priceChangePercent)}%)
52-WEEK: $${fmt(data.week52Low)} – $${fmt(data.week52High)}
MARKET CAP: ${data.marketCap ? `$${(data.marketCap / 1e9).toFixed(1)}B` : "N/A"}

TECHNICAL (Score ${technicalScore}/100):
RSI(14): ${data.rsi.toFixed(1)} (${data.rsi < 30 ? "Oversold" : data.rsi > 70 ? "Overbought" : "Neutral"})
MACD: ${macdSignal} (histogram: ${data.macd.histogram.toFixed(3)})
Trend: ${trend}
MA20=$${fmt(data.ma20)}, MA50=$${fmt(data.ma50)}, MA200=$${fmt(data.ma200)}
Price vs MA200: ${price > data.ma200 ? "Above (bullish)" : "Below (bearish)"}
Bollinger: Upper=$${fmt(data.bollingerUpper)}, Mid=$${fmt(data.bollingerMiddle)}, Lower=$${fmt(data.bollingerLower)}
Volume ratio: ${data.volumeRatio.toFixed(2)}x avg
Support=$${fmt(data.support)}, Resistance=$${fmt(data.resistance)}

FUNDAMENTAL (Score ${fundamentalScore}/100):
P/E: ${fmt(data.pe)}, P/B: ${fmt(data.pb)}, EPS: $${fmt(data.eps)}
Revenue Growth: ${pct(data.revenueGrowth)}, Earnings Growth: ${pct(data.earningsGrowth)}
Profit Margin: ${pct(data.profitMargin)}, ROE: ${pct(data.returnOnEquity)}
Debt/Equity: ${fmt(data.debtEquity)}, Dividend Yield: ${pct(normalizedDividendYield)}

BEHAVIORAL (Score ${behavioralScore}/100):
Analysts: ${data.analystRating} (${data.buyCount} Buy, ${data.holdCount} Hold, ${data.sellCount} Sell, ${data.analystCount} total)
Price Target: ${data.priceTarget ? `$${fmt(data.priceTarget)} (${upside}% upside)` : "N/A"}
Short Interest: ${data.shortInterest ? pct(data.shortInterest) : "N/A"}

LOCKED RULES-BASED RECOMMENDATION:
Action: ${recommendation.action.toUpperCase()}
Composite Score: ${recommendation.compositeScore}/100
Entry: $${fmt(recommendation.buyPrice)}
Target: $${fmt(recommendation.sellPrice)}
Stop Loss: $${fmt(recommendation.stopLoss)}
Confidence: ${recommendation.confidence}%
Time Horizon: ${recommendation.timeHorizon}

Respond ONLY with valid JSON (no markdown):
{
  "reasoning": "3-4 paragraph analysis supporting the locked recommendation without changing it",
  "risks": ["risk 1", "risk 2", "risk 3"],
  "strengths": ["strength 1", "strength 2", "strength 3"]
}`;

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      max_tokens: 2000,
      temperature: 0,
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" },
    });

    const rawContent = completion.choices[0]?.message?.content ?? "";
    const rec = parseAiAnalysis(rawContent);
    const aiAnalysis = rec ?? fallbackAiAnalysis();
    if (!rec) {
      req.log.warn(
        { symbol, contentLength: rawContent.length },
        "AI recommendation response was not valid JSON; using fallback explanation",
      );
    }

    res.json({
      assetType: "stock",
      symbol: data.symbol,
      companyName: data.companyName,
      exchange: data.exchange,
      currency: data.currency,
      currentPrice: data.currentPrice,
      priceChange: data.priceChange,
      priceChangePercent: data.priceChangePercent,
      volume: data.volume,
      marketCap: data.marketCap,
      week52High: data.week52High,
      week52Low: data.week52Low,
      technical: {
        rsi: data.rsi,
        macdSignal,
        trend,
        support: data.support,
        resistance: data.resistance,
        ma20: data.ma20,
        ma50: data.ma50,
        ma200: data.ma200,
        bollingerUpper: data.bollingerUpper,
        bollingerLower: data.bollingerLower,
        bollingerMiddle: data.bollingerMiddle,
        volumeRatio: data.volumeRatio,
        score: technicalScore,
      },
      fundamental: {
        pe: data.pe,
        pb: data.pb,
        eps: data.eps,
        revenueGrowth: data.revenueGrowth,
        earningsGrowth: data.earningsGrowth,
        debtEquity: data.debtEquity,
        dividendYield: normalizedDividendYield || null,
        profitMargin: data.profitMargin,
        returnOnEquity: data.returnOnEquity,
        score: fundamentalScore,
      },
      behavioral: {
        analystRating: data.analystRating,
        analystCount: data.analystCount,
        priceTarget: data.priceTarget,
        shortInterest: data.shortInterest,
        insiderSentiment,
        buyCount: data.buyCount,
        holdCount: data.holdCount,
        sellCount: data.sellCount,
        score: behavioralScore,
      },
      recommendation: {
        action: recommendation.action,
        buyPrice: recommendation.buyPrice,
        sellPrice: recommendation.sellPrice,
        stopLoss: recommendation.stopLoss,
        confidence: recommendation.confidence,
        timeHorizon: recommendation.timeHorizon,
        reasoning: aiAnalysis.reasoning,
        risks: aiAnalysis.risks,
        strengths: aiAnalysis.strengths,
      },
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    req.log.error({ err, symbol }, "Failed to analyze stock");

    if (commodity) {
      const reason = "Dated price history could not be retrieved and verified for this commodity.";
      res.status(422).json({
        error: "COMMODITY_HISTORY_UNAVAILABLE",
        message: reason,
        reason,
        lastUsableDate: null,
      });
      return;
    }

    if (msg.includes("No data found") || msg.includes("No quote data") || msg.includes("Insufficient")) {
      res.status(400).json({ error: "INVALID_SYMBOL", message: `Could not find data for: ${symbol.toUpperCase()}` });
    } else {
      res.status(422).json({ error: "ANALYSIS_FAILED", message: msg });
    }
  }
});

export default router;
