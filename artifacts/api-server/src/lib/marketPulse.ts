export interface MarketPulseResponse {
  changePercent: number;
  priceTimestamp: number;
  updatedAt: number;
}

export function isMarketPulseResponse(value: unknown): value is MarketPulseResponse {
  if (!value || typeof value !== "object") return false;
  const response = value as Record<string, unknown>;
  return (
    typeof response["changePercent"] === "number" &&
    Number.isFinite(response["changePercent"]) &&
    typeof response["priceTimestamp"] === "number" &&
    Number.isInteger(response["priceTimestamp"]) &&
    response["priceTimestamp"] > 0 &&
    typeof response["updatedAt"] === "number" &&
    Number.isInteger(response["updatedAt"]) &&
    response["updatedAt"] > 0
  );
}
