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
  type HeatMapSector,
  type HeatMapResponse,
} from "../lib/marketHeatMap.js";
import {
  createMarketPulseService,
} from "../lib/marketPulseService.ts";
import { createMarketPulseStore } from "../lib/marketPulseStore.js";
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
const CRYPTO_SUPPLY_HISTORY_TTL = 6 * 60 * 60 * 1000;
const heatMapCache = new Map<string, { data: HeatMapResponse; ts: number }>();
const heatMapRequests = new Map<string, Promise<HeatMapResponse>>();
let marketBreadthCache: { data: HeatMapResponse; ts: number } | null = null;
let marketBreadthRequest: Promise<HeatMapResponse> | null = null;
let marketPulseSessionCache: { marketOpen: boolean; ts: number } | null = null;
let marketPulseSessionRequest: Promise<boolean> | null = null;
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
): Promise<HeatMapResponse> {
  const key = heatMapRequestCacheKey(category, period, symbols, requestedSector);
  const now = Date.now();
  const cached = heatMapCache.get(key);
  if (cached && now - cached.ts < HEAT_MAP_TTL) return orderCustomHeatMapResponse(cached.data, symbols);

  const pending = heatMapRequests.get(key);
  if (pending) return pending.then((data) => orderCustomHeatMapResponse(data, symbols));

  const request = (async () => {
    const { stdout } = await execFileAsync(
      "python3",
      [HEAT_MAP_SCRIPT, category, symbols.join(","), period, requestedSector ?? ""],
      { timeout: 75_000, maxBuffer: 5 * 1024 * 1024 },
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
    logger.info(
      { priceTimestamp: data.priceTimestamp, updatedAt: data.updatedAt },
      "Restored market-pulse cache",
    );
  },
  onRestoreFailure: (err) => logger.warn({ err }, "Failed to restore market-pulse cache"),
  onRefreshFailure: (err) => logger.warn({ err }, "Background market-pulse refresh failed"),
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
  (err) => logger.error({ err }, "Market-pulse quote fetch failed"),
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

// Chart OHLCV + moving averages
router.get("/stocks/chart/:symbol", async (req, res) => {
  const symbol = (req.params["symbol"] ?? "").toUpperCase().trim();
  const period = (req.query["period"] as string) || "3mo";
  const interval = (req.query["interval"] as string) || "1d";
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

  try {
    req.log.info({ symbol }, "Analyzing stock");

    const data = await fetchStockData(symbol);
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

    if (msg.includes("No data found") || msg.includes("No quote data") || msg.includes("Insufficient")) {
      res.status(400).json({ error: "INVALID_SYMBOL", message: `Could not find data for: ${symbol.toUpperCase()}` });
    } else {
      res.status(422).json({ error: "ANALYSIS_FAILED", message: msg });
    }
  }
});

export default router;
