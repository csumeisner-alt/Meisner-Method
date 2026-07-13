import { logger } from "./logger.js";

const YAHOO_BASE = "https://query1.finance.yahoo.com";

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

async function fetchJSON(url: string): Promise<any> {
  const res = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
      "Accept": "application/json",
    },
  });
  if (!res.ok) {
    throw new Error(`Yahoo Finance request failed: ${res.status} ${url}`);
  }
  return res.json();
}

function computeEMA(values: number[], period: number): number[] {
  if (values.length === 0) return [];
  const k = 2 / (period + 1);
  const emas: number[] = [];
  let ema = values[0]!;
  emas.push(ema);
  for (let i = 1; i < values.length; i++) {
    ema = (values[i]!) * k + ema * (1 - k);
    emas.push(ema);
  }
  return emas;
}

function computeRSI(closes: number[], period = 14): number {
  if (closes.length < period + 1) return 50;

  let avgGain = 0;
  let avgLoss = 0;
  for (let i = 1; i <= period; i++) {
    const diff = (closes[i]!) - (closes[i - 1]!);
    if (diff > 0) avgGain += diff;
    else avgLoss += Math.abs(diff);
  }
  avgGain /= period;
  avgLoss /= period;

  for (let i = period + 1; i < closes.length; i++) {
    const diff = (closes[i]!) - (closes[i - 1]!);
    const gain = diff > 0 ? diff : 0;
    const loss = diff < 0 ? Math.abs(diff) : 0;
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
  }

  if (avgLoss === 0) return 100;
  return 100 - 100 / (1 + avgGain / avgLoss);
}

function computeMACD(closes: number[]): { macd: number; signal: number; histogram: number } {
  if (closes.length < 26) return { macd: 0, signal: 0, histogram: 0 };
  const ema12 = computeEMA(closes, 12);
  const ema26 = computeEMA(closes, 26);
  const macdLine = ema12.map((v, i) => v - (ema26[i] ?? v));
  const relevantMacd = macdLine.slice(25);
  const signalLine = computeEMA(relevantMacd, 9);
  const lastMACD = relevantMacd[relevantMacd.length - 1] ?? 0;
  const lastSignal = signalLine[signalLine.length - 1] ?? 0;
  return { macd: lastMACD, signal: lastSignal, histogram: lastMACD - lastSignal };
}

function computeSMA(values: number[], period: number): number {
  if (values.length === 0) return 0;
  const slice = values.slice(Math.max(0, values.length - period));
  return slice.reduce((a, b) => a + b, 0) / slice.length;
}

function computeBollinger(closes: number[], period = 20): { upper: number; middle: number; lower: number } {
  const slice = closes.slice(Math.max(0, closes.length - period));
  const mean = slice.reduce((a, b) => a + b, 0) / slice.length;
  const variance = slice.reduce((acc, v) => acc + Math.pow(v - mean, 2), 0) / slice.length;
  const stdDev = Math.sqrt(variance);
  return { upper: mean + 2 * stdDev, middle: mean, lower: mean - 2 * stdDev };
}

export async function fetchStockData(symbol: string): Promise<YahooStockData> {
  const upper = symbol.toUpperCase().trim();

  const chartUrl = `${YAHOO_BASE}/v8/finance/chart/${upper}?range=1y&interval=1d`;
  const summaryUrl = `${YAHOO_BASE}/v10/finance/quoteSummary/${upper}?modules=financialData,defaultKeyStatistics,summaryDetail,recommendationTrend`;

  const [chartData, summaryData] = await Promise.all([
    fetchJSON(chartUrl),
    fetchJSON(summaryUrl).catch(() => null),
  ]);

  const chartResult = chartData?.chart?.result?.[0];
  if (!chartResult) throw new Error(`No data found for symbol: ${upper}`);

  const meta = chartResult.meta ?? {};
  const quotes = chartResult.indicators?.quote?.[0];
  if (!quotes) throw new Error(`No quote data for symbol: ${upper}`);

  const allCloses: number[] = (quotes.close ?? []).filter((v: unknown) => v != null);
  const allVolumes: number[] = (quotes.volume ?? []).filter((v: unknown) => v != null);

  if (allCloses.length < 20) throw new Error(`Insufficient price history for: ${upper}`);

  const currentPrice: number = meta.regularMarketPrice ?? allCloses[allCloses.length - 1] ?? 0;
  const prevClose = allCloses[allCloses.length - 2] ?? currentPrice;
  const priceChange: number = meta.regularMarketChange ?? (currentPrice - prevClose);
  const priceChangePercent: number = meta.regularMarketChangePercent ?? (prevClose > 0 ? (priceChange / prevClose) * 100 : 0);
  const volume: number = meta.regularMarketVolume ?? allVolumes[allVolumes.length - 1] ?? 0;

  const rsi = computeRSI(allCloses);
  const macd = computeMACD(allCloses);
  const ma20 = computeSMA(allCloses, 20);
  const ma50 = computeSMA(allCloses, 50);
  const ma200 = computeSMA(allCloses, 200);
  const bollinger = computeBollinger(allCloses);
  const recent20 = allCloses.slice(-20);
  const support = Math.min(...recent20);
  const resistance = Math.max(...recent20);
  const avgVolume = allVolumes.length >= 20
    ? allVolumes.slice(-20).reduce((a, b) => a + b, 0) / 20
    : volume;
  const volumeRatio = avgVolume > 0 ? volume / avgVolume : 1;

  const fin = summaryData?.quoteSummary?.result?.[0]?.financialData ?? {};
  const ks = summaryData?.quoteSummary?.result?.[0]?.defaultKeyStatistics ?? {};
  const sd = summaryData?.quoteSummary?.result?.[0]?.summaryDetail ?? {};
  const rec = summaryData?.quoteSummary?.result?.[0]?.recommendationTrend?.trend?.[0] ?? {};

  const buyCount: number = (rec.strongBuy ?? 0) + (rec.buy ?? 0);
  const holdCount: number = rec.hold ?? 0;
  const sellCount: number = (rec.sell ?? 0) + (rec.strongSell ?? 0);
  const totalAnalysts = buyCount + holdCount + sellCount;

  let analystRating = "Neutral";
  if (totalAnalysts > 0) {
    const buyPct = buyCount / totalAnalysts;
    const sellPct = sellCount / totalAnalysts;
    if (buyPct > 0.6) analystRating = "Strong Buy";
    else if (buyPct > 0.4) analystRating = "Buy";
    else if (sellPct > 0.4) analystRating = "Sell";
    else analystRating = "Hold";
  }

  return {
    symbol: upper,
    companyName: meta.longName ?? meta.shortName ?? upper,
    exchange: meta.exchangeName ?? "Unknown",
    currency: meta.currency ?? "USD",
    currentPrice,
    priceChange,
    priceChangePercent,
    volume,
    avgVolume,
    marketCap: meta.marketCap ?? null,
    week52High: meta.fiftyTwoWeekHigh ?? resistance,
    week52Low: meta.fiftyTwoWeekLow ?? support,
    closes: allCloses,
    volumes: allVolumes,
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
    pe: sd.trailingPE?.raw ?? null,
    pb: ks.priceToBook?.raw ?? null,
    eps: ks.trailingEps?.raw ?? null,
    revenueGrowth: fin.revenueGrowth?.raw ?? null,
    earningsGrowth: fin.earningsGrowth?.raw ?? null,
    debtEquity: fin.debtToEquity?.raw ?? null,
    dividendYield: sd.dividendYield?.raw ?? null,
    profitMargin: fin.profitMargins?.raw ?? null,
    returnOnEquity: fin.returnOnEquity?.raw ?? null,
    analystRating,
    analystCount: totalAnalysts,
    priceTarget: fin.targetMeanPrice?.raw ?? null,
    shortInterest: ks.shortPercentOfFloat?.raw ?? null,
    buyCount,
    holdCount,
    sellCount,
  };
}

export function computeTechnicalScore(d: YahooStockData): number {
  let score = 50;
  const p = d.currentPrice;

  if (d.rsi < 30) score += 15;
  else if (d.rsi < 40) score += 7;
  else if (d.rsi > 70) score -= 15;
  else if (d.rsi > 60) score -= 7;

  if (p > d.ma200) score += 15; else score -= 10;
  if (p > d.ma50) score += 8; else score -= 5;
  if (p > d.ma20) score += 5; else score -= 3;

  if (d.macd.histogram > 0.05) score += 10;
  else if (d.macd.histogram < -0.05) score -= 10;

  if (d.volumeRatio > 1.5) score += 5;
  else if (d.volumeRatio < 0.5) score -= 3;

  const bRange = d.bollingerUpper - d.bollingerLower;
  const bPos = bRange > 0 ? (p - d.bollingerLower) / bRange : 0.5;
  if (bPos < 0.2) score += 5;
  else if (bPos > 0.8) score -= 5;

  return Math.max(0, Math.min(100, Math.round(score)));
}

export function computeFundamentalScore(d: YahooStockData): number {
  let score = 50;

  if (d.pe != null) {
    if (d.pe < 0) score -= 20;
    else if (d.pe < 15) score += 15;
    else if (d.pe < 25) score += 5;
    else if (d.pe > 50) score -= 10;
    else if (d.pe > 35) score -= 5;
  }

  if (d.revenueGrowth != null) {
    if (d.revenueGrowth > 0.2) score += 15;
    else if (d.revenueGrowth > 0.1) score += 8;
    else if (d.revenueGrowth > 0) score += 3;
    else score -= 10;
  }

  if (d.earningsGrowth != null) {
    if (d.earningsGrowth > 0.2) score += 10;
    else if (d.earningsGrowth > 0.05) score += 5;
    else if (d.earningsGrowth < 0) score -= 10;
  }

  if (d.profitMargin != null) {
    if (d.profitMargin > 0.2) score += 10;
    else if (d.profitMargin > 0.1) score += 5;
    else if (d.profitMargin < 0) score -= 15;
  }

  if (d.returnOnEquity != null) {
    if (d.returnOnEquity > 0.2) score += 10;
    else if (d.returnOnEquity > 0.1) score += 5;
    else if (d.returnOnEquity < 0) score -= 10;
  }

  if (d.debtEquity != null) {
    if (d.debtEquity < 50) score += 5;
    else if (d.debtEquity > 200) score -= 10;
    else if (d.debtEquity > 100) score -= 5;
  }

  return Math.max(0, Math.min(100, Math.round(score)));
}

export function computeBehavioralScore(d: YahooStockData): number {
  let score = 50;
  const total = d.buyCount + d.holdCount + d.sellCount;

  if (total > 0) {
    const buyPct = d.buyCount / total;
    const sellPct = d.sellCount / total;
    if (buyPct > 0.7) score += 20;
    else if (buyPct > 0.5) score += 10;
    else if (sellPct > 0.4) score -= 15;
    else if (sellPct > 0.2) score -= 8;
  }

  if (d.priceTarget != null && d.currentPrice > 0) {
    const upside = (d.priceTarget - d.currentPrice) / d.currentPrice;
    if (upside > 0.2) score += 15;
    else if (upside > 0.1) score += 8;
    else if (upside > 0) score += 3;
    else if (upside < -0.1) score -= 10;
    else score -= 5;
  }

  if (d.shortInterest != null) {
    if (d.shortInterest > 0.2) score -= 10;
    else if (d.shortInterest > 0.1) score -= 5;
    else if (d.shortInterest < 0.03) score += 5;
  }

  return Math.max(0, Math.min(100, Math.round(score)));
}
