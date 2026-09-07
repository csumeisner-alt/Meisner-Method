export type StockRecommendationAction = "buy" | "hold" | "sell";

export interface StockRecommendationInput {
  currentPrice: number;
  support: number;
  resistance: number;
  week52High: number;
  week52Low: number;
  analystPriceTarget: number | null;
  technicalScore: number;
  fundamentalScore: number;
  behavioralScore: number;
}

export interface StockRecommendationLevels {
  action: StockRecommendationAction;
  buyPrice: number;
  sellPrice: number;
  stopLoss: number;
  confidence: number;
  timeHorizon: "1-3 months" | "3-6 months" | "6-12 months" | "1-2 years";
  compositeScore: number;
}

const roundMoney = (value: number): number => Math.round(value * 100) / 100;
const isPositiveFinite = (value: number | null | undefined): value is number =>
  typeof value === "number" && Number.isFinite(value) && value > 0;

/**
 * Recommendation direction and price levels are deliberately deterministic.
 * The language model may explain these values, but it must not invent or
 * override them.
 */
export function buildStockRecommendation(
  input: StockRecommendationInput,
): StockRecommendationLevels {
  if (!isPositiveFinite(input.currentPrice)) {
    throw new Error("A positive current price is required to build a recommendation");
  }

  const compositeScore = Math.round(
    input.technicalScore * 0.45
    + input.fundamentalScore * 0.35
    + input.behavioralScore * 0.20,
  );
  const action: StockRecommendationAction = compositeScore >= 65
    ? "buy"
    : compositeScore <= 40
      ? "sell"
      : "hold";

  const entry = input.currentPrice;
  const minimumTarget = entry * 1.03;
  const targetCandidates = [
    input.analystPriceTarget,
    input.resistance,
    input.week52High,
  ].filter((value): value is number => isPositiveFinite(value) && value >= minimumTarget);
  const target = targetCandidates[0] ?? entry * (action === "buy" ? 1.12 : 1.08);

  const maximumStop = entry * 0.99;
  const stopCandidates = [input.support, input.week52Low]
    .filter((value): value is number => isPositiveFinite(value) && value <= maximumStop)
    .sort((left, right) => right - left);
  const stopLoss = stopCandidates[0] ?? entry * 0.92;

  const confidence = Math.min(
    90,
    Math.max(50, Math.round(50 + Math.abs(compositeScore - 50) * 1.25)),
  );
  const timeHorizon: StockRecommendationLevels["timeHorizon"] = action === "sell"
    ? "1-3 months"
    : compositeScore >= 75
      ? "6-12 months"
      : "3-6 months";

  return {
    action,
    buyPrice: roundMoney(entry),
    sellPrice: roundMoney(Math.max(target, minimumTarget)),
    stopLoss: roundMoney(Math.min(stopLoss, maximumStop)),
    confidence,
    timeHorizon,
    compositeScore,
  };
}