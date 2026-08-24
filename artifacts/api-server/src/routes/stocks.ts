import { Router } from "express";
import OpenAI from "openai";
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

const execFileAsync = promisify(execFile);
const __dirname = dirname(fileURLToPath(import.meta.url));
const QUOTE_SCRIPT = join(__dirname, "fetch_quote.py");
const INFO_SCRIPT = join(__dirname, "fetch_info_brief.py");
const TRENDING_SCRIPT = join(__dirname, "fetch_trending.py");
const TOP_PICKS_SCRIPT = join(__dirname, "fetch_top_picks.py");
const CHART_SCRIPT = join(__dirname, "fetch_chart.py");

// Cache top picks for 4 hours (screener is expensive — 100+ stocks)
let topPicksCache: { data: unknown; ts: number } | null = null;
const TOP_PICKS_TTL = 4 * 60 * 60 * 1000;

const router = Router();

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
  const VALID_PERIODS = ["5d", "1mo", "3mo", "6mo", "1y", "2y"];
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
    res.json(raw);
  } catch (err: any) {
    res.status(422).json({ error: "INFO_FAILED", message: err.message });
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

router.post("/stocks/analyze", async (req, res) => {
  const { symbol } = req.body as { symbol?: string };

  if (!symbol || typeof symbol !== "string") {
    res.status(400).json({ error: "INVALID_SYMBOL", message: "Symbol is required" });
    return;
  }

  try {
    req.log.info({ symbol }, "Analyzing stock");

    const data = await fetchStockData(symbol);

    const technicalScore = computeTechnicalScore(data);
    const fundamentalScore = computeFundamentalScore(data);
    const behavioralScore = computeBehavioralScore(data);

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

    const prompt = `You are a senior financial analyst. Analyze the following real market data and provide an investment recommendation.

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
Debt/Equity: ${fmt(data.debtEquity)}, Dividend Yield: ${pct(data.dividendYield)}

BEHAVIORAL (Score ${behavioralScore}/100):
Analysts: ${data.analystRating} (${data.buyCount} Buy, ${data.holdCount} Hold, ${data.sellCount} Sell, ${data.analystCount} total)
Price Target: ${data.priceTarget ? `$${fmt(data.priceTarget)} (${upside}% upside)` : "N/A"}
Short Interest: ${data.shortInterest ? pct(data.shortInterest) : "N/A"}

Based on all three models, provide a structured recommendation. Include specific price levels. Be direct.

Respond ONLY with valid JSON (no markdown):
{
  "action": "buy" | "sell" | "hold",
  "buyPrice": number or null,
  "sellPrice": number or null,
  "stopLoss": number or null,
  "confidence": number 0-100,
  "timeHorizon": "1-3 months" | "3-6 months" | "6-12 months" | "1-2 years",
  "reasoning": "3-4 paragraph analysis",
  "risks": ["risk 1", "risk 2", "risk 3"],
  "strengths": ["strength 1", "strength 2", "strength 3"]
}`;

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      max_tokens: 2000,
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" },
    });

    const rawContent = completion.choices[0]?.message?.content ?? "{}";
    const rec = JSON.parse(rawContent) as {
      action?: string;
      buyPrice?: number | null;
      sellPrice?: number | null;
      stopLoss?: number | null;
      confidence?: number;
      timeHorizon?: string;
      reasoning?: string;
      risks?: string[];
      strengths?: string[];
    };

    res.json({
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
        dividendYield: data.dividendYield,
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
        action: rec.action ?? "hold",
        buyPrice: rec.buyPrice ?? null,
        sellPrice: rec.sellPrice ?? null,
        stopLoss: rec.stopLoss ?? null,
        confidence: rec.confidence ?? 50,
        timeHorizon: rec.timeHorizon ?? "3-6 months",
        reasoning: rec.reasoning ?? "Analysis complete.",
        risks: rec.risks ?? [],
        strengths: rec.strengths ?? [],
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
