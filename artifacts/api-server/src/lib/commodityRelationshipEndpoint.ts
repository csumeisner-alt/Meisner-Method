import type { Response } from "express";
import {
  calculateCommodityRelationship,
  calculateCommodityRelationshipHistoryRanks,
  calculateCommodityRelationshipRankTrend,
  COMMODITY_RELATIONSHIPS,
  isCommodityRelationshipId,
  isCommodityRelationshipPeriod,
  type CommodityRelationshipPeriod,
  type CommodityRelationshipResult,
  type DatedCommodityClose,
} from "./commodityRelationships.ts";

export interface CommodityRelationshipHistory {
  points: DatedCommodityClose[];
  source: "Yahoo Finance";
  latestSourceTimestamp: number | null;
}

export interface CommodityRelationshipEndpointDependencies {
  fetchHistory: (
    symbol: string,
    period: CommodityRelationshipPeriod,
  ) => Promise<CommodityRelationshipHistory>;
  interpret: (result: CommodityRelationshipResult) => Promise<string>;
  now: () => Date;
  onInterpretationFailure?: (error: unknown, relationshipId: string) => void;
}

export function buildCommodityRelationshipInterpretationPrompt(result: CommodityRelationshipResult): string {
  const recentObservations = result.points.slice(-6).map((point) => ({
    date: point.date,
    firstReturnPercent: Number(point.firstReturnPercent.toFixed(4)),
    secondReturnPercent: Number(point.secondReturnPercent.toFixed(4)),
    rollingCorrelation: point.rollingCorrelation === null
      ? null
      : Number(point.rollingCorrelation.toFixed(4)),
  }));
  return [
    "Interpret the supplied historical commodity relationship statistics for a market research app.",
    "Use only the provided calculations and dated observations. Do not add external facts, forecasts, trade instructions, or economic causal claims.",
    "Explicitly distinguish observed history from possible implications. State that correlation does not establish causation.",
    "Write two or three concise sentences, name the selected period, summarize relative performance and correlation, and mention divergence only if detected.",
    JSON.stringify({
      relationship: result.relationship.label,
      period: result.period,
      status: result.status,
      coverage: result.coverage,
      metrics: result.metrics,
      divergence: result.divergence,
      latestDatedObservations: recentObservations,
    }),
  ].join("\n\n");
}

function validInterpretation(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

export async function respondWithCommodityRelationship(
  res: Response,
  relationshipId: unknown,
  periodValue: unknown,
  dependencies: CommodityRelationshipEndpointDependencies,
): Promise<void> {
  if (!isCommodityRelationshipId(relationshipId) || !isCommodityRelationshipPeriod(periodValue)) {
    res.status(400).json({
      error: "INVALID_COMMODITY_RELATIONSHIP",
      message: "Choose a supported relationship and period.",
    });
    return;
  }
  const relationship = COMMODITY_RELATIONSHIPS.find(({ id }) => id === relationshipId)!;
  const period = periodValue;
  const needsHistoryRanks = relationship.id === "gold-silver-ratio";
  const [periodResults, rankResults] = await Promise.all([
    Promise.allSettled([
      dependencies.fetchHistory(relationship.first.symbol, period),
      dependencies.fetchHistory(relationship.second.symbol, period),
    ]),
    needsHistoryRanks && period !== "max"
      ? Promise.allSettled([
        dependencies.fetchHistory(relationship.first.symbol, "max"),
        dependencies.fetchHistory(relationship.second.symbol, "max"),
      ])
      : Promise.resolve(null),
  ]);
  const [firstResult, secondResult] = periodResults;
  const firstHistory = firstResult.status === "fulfilled" ? firstResult.value : null;
  const secondHistory = secondResult.status === "fulfilled" ? secondResult.value : null;
  const firstRankHistory = period === "max"
    ? firstHistory
    : rankResults?.[0]?.status === "fulfilled" ? rankResults[0].value : null;
  const secondRankHistory = period === "max"
    ? secondHistory
    : rankResults?.[1]?.status === "fulfilled" ? rankResults[1].value : null;
  const result = calculateCommodityRelationship(
    relationship,
    period,
    firstHistory?.points ?? [],
    secondHistory?.points ?? [],
  );
  const historyRanks = needsHistoryRanks
    ? calculateCommodityRelationshipHistoryRanks(
      relationship,
      firstRankHistory?.points ?? [],
      secondRankHistory?.points ?? [],
    )
    : [];
  const rankTrend = calculateCommodityRelationshipRankTrend(
    relationship,
    firstRankHistory?.points ?? [],
    secondRankHistory?.points ?? [],
  );
  if (result.status === "unavailable") {
    const failures = [
      firstResult.status === "rejected" ? `${relationship.first.name} history is unavailable.` : null,
      secondResult.status === "rejected" ? `${relationship.second.name} history is unavailable.` : null,
    ].filter((reason): reason is string => reason !== null);
    if (failures.length) {
      result.reason = failures.join(" ");
      result.divergence.reason = result.reason;
    }
  }

  let aiInterpretation: { status: "available" | "unavailable"; text: string | null } = {
    status: "unavailable",
    text: null,
  };
  if (result.status === "available") {
    try {
      const text = await dependencies.interpret(result);
      if (validInterpretation(text)) {
        aiInterpretation = { status: "available", text: text.trim().slice(0, 1200) };
      }
    } catch (error) {
      dependencies.onInterpretationFailure?.(error, relationship.id);
    }
  }

  const latestSourceTimestamp = [
    firstHistory?.latestSourceTimestamp ?? null,
    secondHistory?.latestSourceTimestamp ?? null,
  ].filter((timestamp): timestamp is number => timestamp !== null);
  res.json({
    ...result,
    historyRanks,
    rankTrend,
    sources: {
      provider: "Yahoo Finance",
      retrievedAt: dependencies.now().toISOString(),
      firstLatestTimestamp: firstHistory?.latestSourceTimestamp ?? null,
      secondLatestTimestamp: secondHistory?.latestSourceTimestamp ?? null,
      latestObservationTimestamp: latestSourceTimestamp.length ? Math.min(...latestSourceTimestamp) : null,
      alignmentNote: relationship.first.venue === "ICE Futures U.S." || relationship.second.venue === "ICE Futures U.S."
        ? "DX-Y.NYB is Yahoo Finance's ICE-listed U.S. Dollar Index series (an index proxy, not a specific futures contract). ICE weekdays and full-day closures are used for date validation; CME calendars are not applied."
        : "Futures quotes are provider-reported settlements/close observations, aligned by their exact trading-date labels.",
    },
    aiInterpretation,
  });
}
