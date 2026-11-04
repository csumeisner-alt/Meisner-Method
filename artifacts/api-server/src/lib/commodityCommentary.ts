import {
  COMMODITY_ANALYSIS_GUIDES,
  type CommodityEvidenceSource,
  type CommodityNewsContext,
  type CommodityScore,
} from "./commodityAnalysis.ts";

export interface CommodityVerifiedEvidence {
  id: string;
  title: string;
  url: string;
  asOf: string;
  unit: string;
  observation: string;
  kind: "market-data" | "news";
  eventDate: string | null;
}

export interface CommodityCommentaryItem {
  text: string;
  evidenceIds: string[];
}

export interface CommodityAiCommentary {
  status: "available" | "unavailable";
  currentDrivers: CommodityCommentaryItem[];
  strongestBullishFactors: CommodityCommentaryItem[];
  strongestBearishFactors: CommodityCommentaryItem[];
  technicalAlignment: CommodityCommentaryItem | null;
  upcomingCatalysts: CommodityCommentaryItem[];
  risks: CommodityCommentaryItem[];
  monitorNext: string[];
}

const MAX_NEWS_AGE_DAYS = 7;
const MAX_NEWS_RETRIEVAL_AGE_MS = 60 * 60 * 1000;
const DAY_MS = 86_400_000;

function validTimestamp(value: string | null): number | null {
  if (!value || !Number.isFinite(Date.parse(value))) return null;
  return Date.parse(value);
}

export function validateCommodityNewsContext(
  context: CommodityNewsContext,
  now: Date,
): CommodityNewsContext {
  if (context.status !== "available" || !context.summary?.trim() || !context.retrievedAt) {
    return { status: "unavailable", summary: null, retrievedAt: null, sources: [] };
  }
  const retrievedAt = validTimestamp(context.retrievedAt);
  const retrievalAge = retrievedAt === null ? null : now.getTime() - retrievedAt;
  if (retrievalAge === null || retrievalAge < 0 || retrievalAge > MAX_NEWS_RETRIEVAL_AGE_MS) {
    return { status: "unavailable", summary: null, retrievedAt: null, sources: [] };
  }
  if (!context.sources.length || context.sources.some((source) => {
    const published = validTimestamp(source.publishedAt);
    const age = published === null ? null : now.getTime() - published;
    return !/^https:\/\//i.test(source.url)
      || !source.title.trim()
      || age === null
      || age < 0
      || age > MAX_NEWS_AGE_DAYS * DAY_MS;
  })) {
    return { status: "unavailable", summary: null, retrievedAt: null, sources: [] };
  }
  return context;
}

function sourceEvidence(
  id: string,
  source: CommodityEvidenceSource,
): CommodityVerifiedEvidence {
  return {
    id,
    title: source.title,
    url: source.url,
    asOf: source.asOf,
    unit: source.unit,
    observation: source.observation,
    kind: "market-data",
    eventDate: null,
  };
}

export function buildCommodityVerifiedEvidence(
  symbol: string,
  score: CommodityScore,
  news: CommodityNewsContext,
): CommodityVerifiedEvidence[] {
  const evidence: CommodityVerifiedEvidence[] = [{
    id: "price-history",
    title: "Yahoo Finance daily futures history",
    url: `https://finance.yahoo.com/quote/${encodeURIComponent(symbol)}/history/`,
    asOf: score.historyAsOf ?? "",
    unit: "percent return; annualized volatility percent",
    observation: [
      `1-month return ${score.oneMonthReturnPercent === null ? "unavailable" : `${score.oneMonthReturnPercent}%`}`,
      `3-month return ${score.threeMonthReturnPercent === null ? "unavailable" : `${score.threeMonthReturnPercent}%`}`,
      `6-month return ${score.sixMonthReturnPercent === null ? "unavailable" : `${score.sixMonthReturnPercent}%`}`,
      `annualized realized volatility ${score.annualizedVolatilityPercent}%`,
    ].join("; "),
    kind: "market-data",
    eventDate: null,
  }];
  for (const factor of score.factors) {
    for (const source of factor.sources) {
      evidence.push(sourceEvidence(factor.key, source));
    }
  }
  if (news.status === "available" && news.retrievedAt) {
    news.sources.forEach((source, index) => {
      evidence.push({
        id: `news-${index + 1}`,
        title: source.title,
        url: source.url,
        asOf: source.publishedAt ?? "",
        unit: "publication date",
        observation: `Current news context retrieved ${news.retrievedAt}: ${news.summary}`,
        kind: "news",
        eventDate: null,
      });
    });
  }
  return evidence.filter((item) => item.asOf);
}

export function buildCommodityCommentaryPrompt(
  symbol: string,
  commodityName: string,
  family: string,
  score: CommodityScore,
  evidence: CommodityVerifiedEvidence[],
): string {
  const guide = COMMODITY_ANALYSIS_GUIDES[symbol];
  const guideLines = guide
    ? `Commodity-specific monitoring lenses (not verified facts): ${guide.focus.join("; ")}
Unavailable without a suitable dated source: ${guide.unavailable.join("; ")}
Permitted next-monitoring suggestions (repeat exactly, do not add others): ${JSON.stringify(guide.monitorNext)}`
    : "";
  const suppliedEvidence = evidence.map((item) => ({
    id: item.id,
    source: item.title,
    url: item.url,
    observationDate: item.asOf,
    upcomingEventDate: item.eventDate,
    unit: item.unit,
    observation: item.observation,
  }));
  const unavailableFactors = score.factors
    .filter((factor) => factor.status === "unavailable")
    .map((factor) => `${factor.label}: ${factor.detail}`);
  return `Write evidence-grounded commentary for this rules-based commodity score. The numeric score, factor values, and technical calculations are locked. Do not change them, give price targets, or provide personalized advice.

Commodity: ${commodityName} (${symbol}), family: ${family}
Score: ${score.score}/100; confidence ${score.confidence}/100; history through ${score.historyAsOf ?? "unavailable"}
Validated evidence (the only source of factual claims; cite its IDs):
${JSON.stringify(suppliedEvidence)}
Unavailable factors (do not fill these gaps with assumptions):
${JSON.stringify(unavailableFactors)}
${guideLines}

Return only JSON with this exact shape:
{"currentDrivers":[{"text":"...","evidenceIds":["price-history"]}],"strongestBullishFactors":[{"text":"...","evidenceIds":["..."]}],"strongestBearishFactors":[{"text":"...","evidenceIds":["..."]}],"technicalAlignment":{"text":"...","evidenceIds":["price-history"]},"upcomingCatalysts":[{"text":"...","evidenceIds":["news-1"]}],"risks":[{"text":"...","evidenceIds":["..."]}],"monitorNext":["exact permitted suggestion"]}
Use concise items. Every factual item must cite one or more supplied evidence IDs. Never invent IDs, sources, publication dates, catalysts, or values. A source publication date is not an upcoming event date: only include a catalyst when its cited evidence has a non-null upcomingEventDate. Leave a section empty when evidence does not support it. Technical alignment must describe only the supplied dated price trend. State unavailable factors as unavailable rather than interpreting them. For monitorNext, select only exact strings from the permitted list.`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function parseItems(value: unknown, allowedIds: Set<string>): CommodityCommentaryItem[] | null {
  if (!Array.isArray(value) || value.length > 4) return null;
  const items: CommodityCommentaryItem[] = [];
  for (const item of value) {
    if (!isRecord(item)
      || typeof item.text !== "string"
      || item.text.trim().length < 4
      || item.text.length > 300
      || !Array.isArray(item.evidenceIds)
      || item.evidenceIds.length === 0
      || item.evidenceIds.length > 4
      || item.evidenceIds.some((id) => typeof id !== "string" || !allowedIds.has(id))) {
      return null;
    }
    items.push({
      text: item.text.trim(),
      evidenceIds: [...new Set(item.evidenceIds as string[])],
    });
  }
  return items;
}

function parseUpcomingCatalysts(
  value: unknown,
  allowedEvidence: CommodityVerifiedEvidence[],
  now: Date,
): CommodityCommentaryItem[] | null {
  if (!Array.isArray(value) || value.length > 4) return null;
  const futureEventIds = new Set(allowedEvidence
    .filter((item) => item.eventDate && Date.parse(`${item.eventDate}T00:00:00.000Z`) > now.getTime())
    .map((item) => item.id));
  const supported = value.filter((item) => isRecord(item)
    && Array.isArray(item.evidenceIds)
    && item.evidenceIds.length > 0
    && item.evidenceIds.every((id) => typeof id === "string" && futureEventIds.has(id)));
  return parseItems(supported, futureEventIds);
}

function extractJson(raw: string): string | null {
  const withoutFence = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
  if (withoutFence.startsWith("{") && withoutFence.endsWith("}")) return withoutFence;
  const start = withoutFence.indexOf("{");
  const end = withoutFence.lastIndexOf("}");
  return start >= 0 && end > start ? withoutFence.slice(start, end + 1) : null;
}

export function parseCommodityAiCommentary(
  raw: string,
  evidence: CommodityVerifiedEvidence[],
  monitorOptions: string[],
  now = new Date(),
): CommodityAiCommentary | null {
  const candidate = extractJson(raw);
  if (!candidate) return null;
  try {
    const parsed: unknown = JSON.parse(candidate);
    if (!isRecord(parsed)) return null;
    const allowedIds = new Set(evidence.map((item) => item.id));
    const currentDrivers = parseItems(parsed.currentDrivers, allowedIds);
    const strongestBullishFactors = parseItems(parsed.strongestBullishFactors, allowedIds);
    const strongestBearishFactors = parseItems(parsed.strongestBearishFactors, allowedIds);
    const upcomingCatalysts = parseUpcomingCatalysts(parsed.upcomingCatalysts, evidence, now);
    const risks = parseItems(parsed.risks, allowedIds);
    const technicalAlignment = parsed.technicalAlignment === null
      ? null
      : parseItems([parsed.technicalAlignment], allowedIds)?.[0] ?? null;
    if (!currentDrivers || !strongestBullishFactors || !strongestBearishFactors
      || !upcomingCatalysts || !risks || !technicalAlignment) return null;
    if (!Array.isArray(parsed.monitorNext) || parsed.monitorNext.length > 4
      || parsed.monitorNext.some((item) => typeof item !== "string" || !monitorOptions.includes(item))) {
      return null;
    }
    return {
      status: "available",
      currentDrivers,
      strongestBullishFactors,
      strongestBearishFactors,
      technicalAlignment,
      upcomingCatalysts,
      risks,
      monitorNext: [...new Set(parsed.monitorNext as string[])],
    };
  } catch {
    return null;
  }
}

export function unavailableCommodityCommentary(): CommodityAiCommentary {
  return {
    status: "unavailable",
    currentDrivers: [],
    strongestBullishFactors: [],
    strongestBearishFactors: [],
    technicalAlignment: null,
    upcomingCatalysts: [],
    risks: [],
    monitorNext: [],
  };
}
