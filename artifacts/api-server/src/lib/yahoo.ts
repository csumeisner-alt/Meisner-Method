import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { join, dirname } from "node:path";
import { logger } from "./logger.js";

const execFileAsync = promisify(execFile);

const __dirname = dirname(fileURLToPath(import.meta.url));
// In production the script is bundled via build.mjs — we ship the .py file alongside the binary
const SCRIPT_PATH = join(__dirname, "fetch_stock.py");

export interface YahooStockData {
  symbol: string;
  companyName: string;
  exchange: string;
  currency: string;
  currentPrice: number;
  priceChange: number;
  priceChangePercent: number;
  volume: number;
  avgVolume: number;
  marketCap: number | null;
  week52High: number;
  week52Low: number;
  closes: number[];
  volumes: number[];
  rsi: number;
  macd: { macd: number; signal: number; histogram: number };
  ma20: number;
  ma50: number;
  ma200: number;
  bollingerUpper: number;
  bollingerMiddle: number;
  bollingerLower: number;
  support: number;
  resistance: number;
  volumeRatio: number;
  pe: number | null;
  pb: number | null;
  eps: number | null;
  revenueGrowth: number | null;
  earningsGrowth: number | null;
  debtEquity: number | null;
  dividendYield: number | null;
  profitMargin: number | null;
  returnOnEquity: number | null;
  analystRating: string;
  analystCount: number;
  priceTarget: number | null;
  shortInterest: number | null;
  buyCount: number;
  holdCount: number;
  sellCount: number;
}

// ─── Technical Indicators ─────────────────────────────────────────────────────

function computeEMA(values: number[], period: number): number[] {
  if (!values.length) return [];
  const k = 2 / (period + 1);
  let ema = values[0]!;
  const out = [ema];
  for (let i = 1; i < values.length; i++) {
    ema = values[i]! * k + ema * (1 - k);
    out.push(ema);
  }
  return out;
}

function computeRSI(closes: number[], period = 14): number {
  if (closes.length < period + 1) return 50;
  let avgGain = 0, avgLoss = 0;
  for (let i = 1; i <= period; i++) {
    const d = closes[i]! - closes[i - 1]!;
    d > 0 ? (avgGain += d) : (avgLoss += Math.abs(d));
  }
  avgGain /= period;
  avgLoss /= period;
  for (let i = period + 1; i < closes.length; i++) {
    const d = closes[i]! - closes[i - 1]!;
    avgGain = (avgGain * (period - 1) + (d > 0 ? d : 0)) / period;
    avgLoss = (avgLoss * (period - 1) + (d < 0 ? Math.abs(d) : 0)) / period;
  }
  return avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
}

function computeMACD(closes: number[]) {
  if (closes.length < 26) return { macd: 0, signal: 0, histogram: 0 };
  const ema12 = computeEMA(closes, 12);
  const ema26 = computeEMA(closes, 26);
  const line = ema12.map((v, i) => v - (ema26[i] ?? v));
  const relevant = line.slice(25);
  const sig = computeEMA(relevant, 9);
  const last = relevant.at(-1) ?? 0;
  const lastSig = sig.at(-1) ?? 0;
  return { macd: last, signal: lastSig, histogram: last - lastSig };
}

function computeSMA(values: number[], period: number): number {
  if (!values.length) return 0;
  const s = values.slice(Math.max(0, values.length - period));
  return s.reduce((a, b) => a + b, 0) / s.length;
}

function computeBollinger(closes: number[], period = 20) {
  const s = closes.slice(Math.max(0, closes.length - period));
  const mean = s.reduce((a, b) => a + b, 0) / s.length;
  const std = Math.sqrt(s.reduce((a, v) => a + (v - mean) ** 2, 0) / s.length);
  return { upper: mean + 2 * std, middle: mean, lower: mean - 2 * std };
}

// ─── Main Fetcher ─────────────────────────────────────────────────────────────

export async function fetchStockData(symbol: string): Promise<YahooStockData> {
  const upper = symbol.toUpperCase().trim();

  logger.debug({ symbol: upper }, "Calling Python yfinance fetcher");

  let raw: Record<string, any>;
  try {
    const { stdout, stderr } = await execFileAsync("python3", [SCRIPT_PATH, upper], {
      timeout: 60_000,
      maxBuffer: 10 * 1024 * 1024, // 10 MB
    });
    if (stderr) logger.debug({ stderr }, "Python stderr");
    raw = JSON.parse(stdout.trim());
  } catch (err: any) {
    // execFileAsync may still populate stdout on non-zero exit
    const stdout = err?.stdout?.trim?.() ?? "";
    if (stdout) {
      try {
        raw = JSON.parse(stdout);
      } catch {
        throw new Error(`Failed to fetch data for ${upper}: ${err.message}`);
      }
    } else {
      throw new Error(`Failed to fetch data for ${upper}: ${err.message}`);
    }
  }

  if (raw["error"]) {
    throw new Error(raw["error"] as string);
  }

  const closes: number[] = raw["closes"] ?? [];
  const volumes: number[] = raw["volumes"] ?? [];

  if (closes.length < 20) {
    throw new Error(`Insufficient price history for: ${upper}`);
  }

  const rsi = computeRSI(closes);
  const macd = computeMACD(closes);
  const ma20 = computeSMA(closes, 20);
  const ma50 = computeSMA(closes, 50);
  const ma200 = computeSMA(closes, 200);
  const bollinger = computeBollinger(closes);
  const recent20 = closes.slice(-20);
  const support = Math.min(...recent20);
  const resistance = Math.max(...recent20);
  const volume: number = raw["volume"] ?? volumes.at(-1) ?? 0;
  const avgVolume: number = raw["avgVolume"] ?? volume;
  const volumeRatio = avgVolume > 0 ? volume / avgVolume : 1;

  return {
    symbol: upper,
    companyName: raw["companyName"] ?? upper,
    exchange: raw["exchange"] ?? "Unknown",
    currency: raw["currency"] ?? "USD",
    currentPrice: raw["currentPrice"] ?? closes.at(-1) ?? 0,
    priceChange: raw["priceChange"] ?? 0,
    priceChangePercent: raw["priceChangePercent"] ?? 0,
    volume,
    avgVolume,
    marketCap: raw["marketCap"] ?? null,
    week52High: raw["week52High"] ?? resistance,
    week52Low: raw["week52Low"] ?? support,
    closes,
    volumes,
    rsi,
    macd,
    ma20,
    ma50,
    ma200,
    bollingerUpper: bollinger.upper,
    bollingerMiddle: bollinger.middle,
    bollingerLower: bollinger.lower,
    support,
    resistance,
    volumeRatio,
    pe: raw["pe"] ?? null,
    pb: raw["pb"] ?? null,
    eps: raw["eps"] ?? null,
    revenueGrowth: raw["revenueGrowth"] ?? null,
    earningsGrowth: raw["earningsGrowth"] ?? null,
    debtEquity: raw["debtEquity"] ?? null,
    dividendYield: raw["dividendYield"] ?? null,
    profitMargin: raw["profitMargin"] ?? null,
    returnOnEquity: raw["returnOnEquity"] ?? null,
    analystRating: raw["analystRating"] ?? "Neutral",
    analystCount: raw["analystCount"] ?? 0,
    priceTarget: raw["priceTarget"] ?? null,
    shortInterest: raw["shortInterest"] ?? null,
    buyCount: raw["buyCount"] ?? 0,
    holdCount: raw["holdCount"] ?? 0,
    sellCount: raw["sellCount"] ?? 0,
  };
}

// ─── Scoring ──────────────────────────────────────────────────────────────────

export function computeTechnicalScore(d: YahooStockData): number {
  let s = 50;
  const p = d.currentPrice;
  if (d.rsi < 30) s += 15; else if (d.rsi < 40) s += 7;
  else if (d.rsi > 70) s -= 15; else if (d.rsi > 60) s -= 7;
  if (p > d.ma200) s += 15; else s -= 10;
  if (p > d.ma50) s += 8; else s -= 5;
  if (p > d.ma20) s += 5; else s -= 3;
  if (d.macd.histogram > 0.05) s += 10; else if (d.macd.histogram < -0.05) s -= 10;
  if (d.volumeRatio > 1.5) s += 5; else if (d.volumeRatio < 0.5) s -= 3;
  const bRange = d.bollingerUpper - d.bollingerLower;
  const bPos = bRange > 0 ? (p - d.bollingerLower) / bRange : 0.5;
  if (bPos < 0.2) s += 5; else if (bPos > 0.8) s -= 5;
  return Math.max(0, Math.min(100, Math.round(s)));
}

export function computeFundamentalScore(d: YahooStockData): number {
  let s = 50;
  if (d.pe != null) {
    if (d.pe < 0) s -= 20; else if (d.pe < 15) s += 15;
    else if (d.pe < 25) s += 5; else if (d.pe > 50) s -= 10; else if (d.pe > 35) s -= 5;
  }
  if (d.revenueGrowth != null) {
    if (d.revenueGrowth > 0.2) s += 15; else if (d.revenueGrowth > 0.1) s += 8;
    else if (d.revenueGrowth > 0) s += 3; else s -= 10;
  }
  if (d.earningsGrowth != null) {
    if (d.earningsGrowth > 0.2) s += 10; else if (d.earningsGrowth > 0.05) s += 5;
    else if (d.earningsGrowth < 0) s -= 10;
  }
  if (d.profitMargin != null) {
    if (d.profitMargin > 0.2) s += 10; else if (d.profitMargin > 0.1) s += 5;
    else if (d.profitMargin < 0) s -= 15;
  }
  if (d.returnOnEquity != null) {
    if (d.returnOnEquity > 0.2) s += 10; else if (d.returnOnEquity > 0.1) s += 5;
    else if (d.returnOnEquity < 0) s -= 10;
  }
  if (d.debtEquity != null) {
    if (d.debtEquity < 50) s += 5; else if (d.debtEquity > 200) s -= 10; else if (d.debtEquity > 100) s -= 5;
  }
  return Math.max(0, Math.min(100, Math.round(s)));
}

export function computeBehavioralScore(d: YahooStockData): number {
  let s = 50;
  const total = d.buyCount + d.holdCount + d.sellCount;
  if (total > 0) {
    const bp = d.buyCount / total, sp = d.sellCount / total;
    if (bp > 0.7) s += 20; else if (bp > 0.5) s += 10;
    else if (sp > 0.4) s -= 15; else if (sp > 0.2) s -= 8;
  }
  if (d.priceTarget != null && d.currentPrice > 0) {
    const up = (d.priceTarget - d.currentPrice) / d.currentPrice;
    if (up > 0.2) s += 15; else if (up > 0.1) s += 8; else if (up > 0) s += 3;
    else if (up < -0.1) s -= 10; else s -= 5;
  }
  if (d.shortInterest != null) {
    if (d.shortInterest > 0.2) s -= 10; else if (d.shortInterest > 0.1) s -= 5;
    else if (d.shortInterest < 0.03) s += 5;
  }
  return Math.max(0, Math.min(100, Math.round(s)));
}
