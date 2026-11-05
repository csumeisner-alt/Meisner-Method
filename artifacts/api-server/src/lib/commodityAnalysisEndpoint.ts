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
  type CommodityEventCalendar,
  type CommoditySupplyDemandContext,
} from "./commodityAnalysis.ts";
import { fallbackAiAnalysis } from "./analysisResponse.ts";
import {
  buildCommodityCommentaryPrompt,
  buildCommodityVerifiedEvidence,
  parseCommodityAiCommentary,
  unavailableCommodityCommentary,
  validateCommodityNewsContext,
} from "./commodityCommentary.ts";
import { validateCommodityEventCalendar } from "./commodityEvents.ts";
import { validateCommoditySupplyDemandContext } from "./commodityMarketData.ts";

export interface CommodityAnalysisQuote {
  symbol: string;
  exchange: string;
  currency: string;
  currentPrice: number;
  priceChange: number;
  priceChangePercent: number;
  priceTimestamp?: number | null;
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
  fetchEvents?: (symbol: string, now: Date) => Promise<CommodityEventCalendar>;
  fetchSupplyDemand?: (
    symbol: string,
    inventory: CommodityInventoryEvidence | null,
    eventCalendar: CommodityEventCalendar,
    now: Date,
  ) => Promise<CommoditySupplyDemandContext>;
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
  let eventCalendar: CommodityEventCalendar;
  try {
    eventCalendar = validateCommodityEventCalendar(
      await dependencies.fetchEvents?.(symbol, now) ?? {
        status: "unavailable",
        checkedAt: now.toISOString(),
        events: [],
        unavailable: ["Official event schedules are not configured."],
      },
      symbol,
      now,
    );
  } catch {
    eventCalendar = {
      status: "unavailable",
      checkedAt: now.toISOString(),
      events: [],
      unavailable: ["Official event schedules are temporarily unavailable."],
    };
  }
  if (inventory?.provider === "EIA") {
    const reportDate = eventCalendar.events
      .filter((item) => item.status === "completed"
        && (item.name.includes("Petroleum Status") || item.name.includes("Natural Gas Storage")))
      .map((item) => item.eventDate)
      .sort()
      .at(-1);
    const observations = [...(inventory.publishedObservations ?? [])]
      .filter((item) => item.units === inventory.units
        && Number.isFinite(item.value) && item.value >= 0)
      .sort((left, right) => right.reportingPeriod.localeCompare(left.reportingPeriod));
    const current = observations.find((item) => item.reportingPeriod === inventory.asOf);
    const previous = observations.find((item) => item.reportingPeriod < inventory.asOf);
    if (reportDate && current) {
      eventCalendar = {
        ...eventCalendar,
        events: eventCalendar.events.map((item) => item.eventDate === reportDate
          && (item.name.includes("Petroleum Status") || item.name.includes("Natural Gas Storage"))
          ? {
            ...item,
            source: { ...item.source, publicationDate: reportDate },
            values: {
              previous: previous ? { value: previous.value, units: previous.units } : null,
              consensus: null,
              actual: { value: current.value, units: current.units },
            },
          }
          : item),
      };
    }
  }
  let supplyDemand: CommoditySupplyDemandContext;
  try {
    supplyDemand = validateCommoditySupplyDemandContext(
      await dependencies.fetchSupplyDemand?.(symbol, inventory, eventCalendar, now) ?? {
        status: "unavailable",
        commodity: commodity.name,
        series: [],
      },
      symbol,
      now,
    );
  } catch {
    supplyDemand = validateCommoditySupplyDemandContext({
      status: "unavailable",
      commodity: commodity.name,
      series: [],
    }, symbol, now);
  }
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
  const researchEvidence = [
    ...supplyDemand.series.flatMap((series) => series.points.slice(-4).map((point, index) => ({
      id: `supply-${series.id}-${point.reportingPeriod}-${index}`,
      title: point.source.title,
      url: point.source.url,
      asOf: point.publicationDate,
      unit: point.units,
      observation: `${point.commodity} ${series.label}: ${point.value} ${point.units} for ${point.reportingPeriod}, published ${point.publicationDate}.`,
      kind: "market-data" as const,
      eventDate: null,
    }))),
    ...eventCalendar.events.filter((item) => item.status === "upcoming").map((item) => ({
      id: `event-${item.id}`,
      title: item.source.title,
      url: item.source.url,
      asOf: eventCalendar.checkedAt.slice(0, 10),
      unit: "scheduled event",
      observation: `${item.name} is scheduled for ${item.eventDate}${item.time ? ` at ${item.time} ${item.timezone ?? ""}` : ""}; affected commodities: ${item.affectedCommodities.join(", ")}.`,
      kind: "market-data" as const,
      eventDate: item.eventDate,
    })),
  ];
  const verifiedEvidence = [...buildCommodityVerifiedEvidence(symbol, score), ...researchEvidence];
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
    priceTimestamp: data.priceTimestamp ?? null,
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
      eventCalendar,
      supplyDemand,
      provider: "Yahoo Finance",
    },
  });
}
