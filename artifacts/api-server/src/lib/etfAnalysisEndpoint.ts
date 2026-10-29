import type { Response } from "express";
import {
  buildEtfPeerComparisonFields,
  buildEtfScenarios,
  calculateEtfRiskMetrics,
} from "./etfAnalysis.ts";

export interface EtfAnalysisQuote {
  symbol: string;
  companyName: string;
  exchange: string;
  currency: string;
  currentPrice: number;
  priceChange: number;
  priceChangePercent: number;
  volume: number;
  marketCap: number | null;
  week52High: number;
  week52Low: number;
  closes: number[];
}

export interface EtfAnalysisEndpointDependencies {
  fetchEtfInfo: (symbol: string) => Promise<Record<string, any>>;
  createCompletion: (prompt: string, maxTokens: number) => Promise<string>;
  now: () => Date;
}

export async function respondWithEtfAnalysis(
  res: Response,
  data: EtfAnalysisQuote,
  dependencies: EtfAnalysisEndpointDependencies,
) {
  const info = await dependencies.fetchEtfInfo(data.symbol);
  const profile = info["etfProfile"] as Record<string, any> | undefined;
  if (!profile) {
    throw new Error("Fund details are temporarily unavailable for this ETF");
  }
  const regime = profile["marketRegime"] as Record<string, any> | null;
  const periods = regime?.["periods"] as Record<string, any> | undefined;
  const scenarios = buildEtfScenarios(
    data.currentPrice,
    typeof profile["expenseRatio"] === "number" ? profile["expenseRatio"] : null,
    periods,
  );
  const riskMetrics = calculateEtfRiskMetrics(data.closes);
  const holdings = Array.isArray(profile["topHoldings"])
    ? profile["topHoldings"].map((holding: Record<string, unknown>) => ({
      symbol: String(holding["symbol"] ?? ""),
      name: String(holding["name"] ?? holding["symbol"] ?? ""),
      weight: typeof holding["weight"] === "number" ? holding["weight"] : null,
    }))
    : [];
  const asOf = dependencies.now().toISOString();
  const withSourceContext = (value: unknown) => {
    if (!value || typeof value !== "object" || Array.isArray(value)) return null;
    return {
      ...(value as Record<string, unknown>),
      source: "Yahoo Finance",
      asOf,
    };
  };
  const benchmark = withSourceContext(profile["benchmark"]);
  const trackingComparison = withSourceContext(profile["trackingComparison"]);
  const peerComparisons = buildEtfPeerComparisonFields(profile, asOf);
  const { peerExpenseComparison, peerAssetSizeComparison } = peerComparisons;
  const concentration = holdings.length
    ? holdings.reduce((sum: number, holding: { weight: number | null }) => sum + (holding.weight ?? 0), 0)
    : null;
  const prompt = `You are explaining an ETF using only the supplied facts. Do not invent data, peer comparisons, benchmark fit, tracking error, turnover, tax characteristics, or holdings beyond those listed. Do not claim the fund tracks a particular index or has a particular strategy unless that exact fact is supplied. State unavailable facts plainly. Explain what the reported holdings and weights imply, costs, diversification/concentration, historical market-regime observations, and risks. Distinguish historical observations from the illustrative scenarios. Do not give personalized advice or change scenario calculations.

ETF: ${data.symbol} — ${data.companyName}
Category: ${profile["fundCategory"] ?? "unavailable"}; family: ${profile["fundFamily"] ?? "unavailable"}
Expense ratio: ${profile["expenseRatio"] ?? "unavailable"} (decimal)
Assets under management: ${profile["totalAssets"] ?? "unavailable"}
Distribution yield: ${profile["dividendYield"] ?? "unavailable"} (decimal)
3-year beta: ${profile["beta3Year"] ?? "unavailable"}
Average daily volume: ${info["averageVolume3Month"] ?? "unavailable"}
Largest reported sector: ${profile["largestSector"] ?? "unavailable"} (${profile["largestSectorWeight"] ?? "unavailable"})
Top reported holdings: ${JSON.stringify(holdings)}
Combined weight of reported top holdings: ${concentration ?? "unavailable"}
Explicitly reported benchmark: ${JSON.stringify(benchmark ?? "unavailable")}
Benchmark tracking comparison: ${JSON.stringify(trackingComparison ?? "unavailable")}
Provider category expense comparison: ${JSON.stringify(peerExpenseComparison ?? "unavailable")}
Provider category total-net-assets comparison: ${JSON.stringify(peerAssetSizeComparison ?? "unavailable")}
One-year annualized return: ${riskMetrics.annualizedReturn ?? "unavailable"}
One-year annualized volatility: ${riskMetrics.annualizedVolatility ?? "unavailable"}
One-year maximum drawdown: ${riskMetrics.maxDrawdown ?? "unavailable"}
Annualized return / volatility ratio (0% risk-free proxy): ${riskMetrics.riskAdjustedReturn ?? "unavailable"}
Market regime history: ${JSON.stringify(regime ?? "unavailable")}
Illustrative scenarios: ${JSON.stringify(scenarios)}

Return JSON only: {"analysis":"2-4 concise paragraphs","risks":["..."],"strengths":["..."]}`;
  const completionContent = await dependencies.createCompletion(prompt, 1400);
  let ai: { analysis?: string; risks?: string[]; strengths?: string[] } = {};
  try {
    ai = JSON.parse(completionContent);
  } catch {
    ai = {};
  }

  res.json({
    assetType: "etf",
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
    etfAnalysis: {
      fundCategory: profile["fundCategory"] ?? null,
      fundFamily: profile["fundFamily"] ?? null,
      expenseRatio: profile["expenseRatio"] ?? null,
      totalAssets: profile["totalAssets"] ?? null,
      dividendYield: profile["dividendYield"] ?? null,
      beta3Year: profile["beta3Year"] ?? null,
      averageVolume: info["averageVolume3Month"] ?? null,
      annualizedReturn: riskMetrics.annualizedReturn,
      annualizedVolatility: riskMetrics.annualizedVolatility,
      maxDrawdown: riskMetrics.maxDrawdown,
      riskAdjustedReturn: riskMetrics.riskAdjustedReturn,
      topHoldings: holdings,
      sectorWeights: Array.isArray(profile["sectorWeights"]) ? profile["sectorWeights"] : [],
      sectorWeightsRetrievedAt: String(profile["sectorWeightsRetrievedAt"] ?? asOf),
      marketRegime: regime,
      benchmark,
      topHoldingsReportedCount: Number(profile["topHoldingsReportedCount"] ?? holdings.length),
      topHoldingsRetrievedAt: String(profile["topHoldingsRetrievedAt"] ?? asOf),
      trackingComparison,
      ...peerComparisons,
      scenarios,
      risks: Array.isArray(ai.risks) ? ai.risks.filter((item): item is string => typeof item === "string") : [],
      strengths: Array.isArray(ai.strengths) ? ai.strengths.filter((item): item is string => typeof item === "string") : [],
      topHoldingsCombinedWeight: concentration,
      analysis: typeof ai.analysis === "string" ? ai.analysis : "AI commentary is temporarily unavailable.",
      provider: "Yahoo Finance",
      asOf,
    },
  });
}
