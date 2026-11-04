import type { Response } from "express";
import {
  assessCommodityHistory,
  buildCommodityIntelligenceScorecard,
  buildCommodityScore,
  COMMODITY_ANALYSIS_GUIDES,
  COMMODITY_INVENTORY_PROVIDERS,
  CFTC_INSTRUMENTS,
  SUPPORTED_COMMODITIES,
  unavailableCommodityNews,
  type CommodityEvidenceFetchResult,
  type CommodityInventoryEvidence,
  type CommodityNewsContext,
  type CommodityPositioningEvidence,
} from "./commodityAnalysis.ts";
import { fallbackAiAnalysis } from "./analysisResponse.ts";
import {
  buildCommodityCommentaryPrompt,
  buildCommodityVerifiedEvidence,
  parseCommodityAiCommentary,
  unavailableCommodityCommentary,
  validateCommodityNewsContext,
} from "./commodityCommentary.ts";

export interface CommodityAnalysisQuote {
  symbol: string;
  exchange: string;
  currency: string;
  currentPrice: number;
  priceChange: number;
  priceChangePercent: number;
  volume: number;
  week52High: number;
  week52Low: number;
  closes: number[];
  historyDates: string[];
  historySessions: string[] | null;
  historyAsOf: string | null;
}

export interface CommodityAnalysisEndpointDependencies {
  fetchInventory: (symbol: string, now: Date) => Promise<CommodityEvidenceFetchResult<CommodityInventoryEvidence>>;
  fetchPositioning: (symbol: string, now: Date) => Promise<CommodityEvidenceFetchResult<CommodityPositioningEvidence>>;
  fetchNews: (symbol: string, name: string) => Promise<CommodityNewsContext>;
  createCompletion: (prompt: string, maxTokens: number) => Promise<string>;
  now: () => Date;
  onCommentaryFailure?: (error: unknown, symbol: string) => void;
}

export async function respondWithCommodityAnalysis(
  res: Response,
  data: CommodityAnalysisQuote,
  dependencies: CommodityAnalysisEndpointDependencies,
  options: { includeCommentary?: boolean } = {},
) {
  const symbol = data.symbol.trim().toUpperCase();
  const commodity = SUPPORTED_COMMODITIES[symbol];
  if (!commodity) {
    res.status(400).json({ error: "UNSUPPORTED_COMMODITY", message: "Unsupported commodity symbol." });
    return;
  }

  const now = dependencies.now();
  const [inventoryResult, positioningResult] = await Promise.all([
    Promise.resolve().then(() => dependencies.fetchInventory(symbol, now)).catch(() => ({
      evidence: null,
      failure: COMMODITY_INVENTORY_PROVIDERS[symbol]
        ? { provider: COMMODITY_INVENTORY_PROVIDERS[symbol]!, state: "request-failed" as const }
        : null,
    })),
    Promise.resolve().then(() => dependencies.fetchPositioning(symbol, now)).catch(() => ({
      evidence: null,
      failure: { provider: "CFTC" as const, state: "request-failed" as const },
    })),
  ]);
  const inventory = inventoryResult.evidence;
  const positioning = positioningResult.evidence;
  const scoreInput = {
    symbol,
    closes: data.closes,
    historyDates: data.historyDates,
    historySessions: data.historySessions,
    currentPrice: data.currentPrice,
    historyAsOf: data.historyAsOf,
    marketEvidence: {
      inventory,
      positioning,
      inventoryFailure: inventoryResult.failure,
      positioningFailure: positioningResult.failure
        ?? (CFTC_INSTRUMENTS[symbol] && !positioning
          ? { provider: "CFTC", state: "unavailable" as const }
          : null),
    },
    now,
  };
  const historyAssessment = assessCommodityHistory(scoreInput);
  if (historyAssessment.status === "unavailable") {
    res.status(422).json({
      error: "COMMODITY_HISTORY_UNAVAILABLE",
      message: historyAssessment.reason,
      reason: historyAssessment.reason,
      lastUsableDate: historyAssessment.lastUsableDate,
    });
    return;
  }
  const score = buildCommodityScore(scoreInput);
  if (!score) {
    res.status(422).json({
      error: "COMMODITY_HISTORY_UNAVAILABLE",
      message: "Commodity history is unavailable for scoring.",
      reason: "Commodity history is unavailable for scoring.",
      lastUsableDate: historyAssessment.lastUsableDate,
    });
    return;
  }

  let newsContext: CommodityNewsContext;
  try {
    newsContext = await dependencies.fetchNews(symbol, commodity.name);
  } catch {
    newsContext = unavailableCommodityNews();
  }
  newsContext = validateCommodityNewsContext(newsContext, now);

  let explanation = fallbackAiAnalysis();
  let commentary = unavailableCommodityCommentary();
  const verifiedEvidence = buildCommodityVerifiedEvidence(symbol, score, newsContext);
  const guide = COMMODITY_ANALYSIS_GUIDES[symbol];
  if (options.includeCommentary !== false) {
    try {
      const prompt = buildCommodityCommentaryPrompt(
        symbol,
        commodity.name,
        commodity.family,
        score,
        verifiedEvidence,
      );
      const parsed = parseCommodityAiCommentary(
        await dependencies.createCompletion(prompt, 1600),
        verifiedEvidence,
        guide?.monitorNext ?? [],
        now,
      );
      if (parsed) {
        commentary = parsed;
        const alignment = parsed.technicalAlignment?.text;
        explanation = {
          reasoning: alignment ?? fallbackAiAnalysis().reasoning,
          strengths: parsed.strongestBullishFactors.map((item) => item.text),
          risks: parsed.risks.map((item) => item.text),
        };
      }
    } catch (error) {
      dependencies.onCommentaryFailure?.(error, symbol);
    }
  }

  res.json({
    assetType: "commodity",
    symbol: data.symbol,
    companyName: commodity.name,
    exchange: data.exchange,
    currency: data.currency,
    currentPrice: data.currentPrice,
    priceChange: data.priceChange,
    priceChangePercent: data.priceChangePercent,
    volume: data.volume,
    marketCap: null,
    week52High: data.week52High,
    week52Low: data.week52Low,
    commodityAnalysis: {
      ...score,
      intelligenceScorecard: buildCommodityIntelligenceScorecard(symbol, score),
      reasoning: explanation.reasoning,
      risks: explanation.risks,
      strengths: explanation.strengths,
      analysisGuide: guide ?? { focus: [], unavailable: [], monitorNext: [] },
      verifiedEvidence,
      commentary,
      newsContext,
      provider: "Yahoo Finance",
    },
  });
}
