import type { HeatMapQuote } from "@workspace/api-client-react";

const MAX_QUOTE_AGE_SECONDS = {
  cryptocurrency: 48 * 60 * 60,
  other: 120 * 60 * 60,
} as const;
const MAX_FUTURE_TIMESTAMP_SECONDS = 60 * 60;

export function isDisplayableHeatMapQuote(
  quote: Pick<HeatMapQuote, "priceTimestamp" | "assetType">,
  nowSeconds = Date.now() / 1000,
): boolean {
  const timestamp = quote.priceTimestamp;
  if (timestamp === null || !Number.isFinite(timestamp) || timestamp <= 0) return false;
  if (timestamp > nowSeconds + MAX_FUTURE_TIMESTAMP_SECONDS) return false;

  const maxAge = quote.assetType === "cryptocurrency"
    ? MAX_QUOTE_AGE_SECONDS.cryptocurrency
    : MAX_QUOTE_AGE_SECONDS.other;
  return nowSeconds - timestamp <= maxAge;
}

export function getHeatMapSessionLabel(session: HeatMapQuote["marketSession"]): string {
  switch (session) {
    case "regular":
      return "Regular";
    case "pre_market":
      return "Pre-market";
    case "after_hours":
      return "After-hours";
    case "closed":
      return "Last close";
    case "unknown":
      return "Unknown";
  }
}

export function formatHeatMapNextOpen(
  timestamp: number | null,
  session: HeatMapQuote["marketSession"],
  assetType: HeatMapQuote["assetType"],
  nowSeconds = Date.now() / 1000,
): string | null {
  if (
    (assetType !== "stock" && assetType !== "etf") ||
    (session !== "closed" && session !== "after_hours") ||
    timestamp === null ||
    !Number.isFinite(timestamp) ||
    timestamp <= nowSeconds
  ) {
    return null;
  }

  try {
    const easternDateTime = new Intl.DateTimeFormat("en-US", {
      timeZone: "America/New_York",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    }).format(new Date(timestamp * 1000));
    const [date, time] = easternDateTime.split(", ");
    if (!date || !time) return null;
    return `Next open: ${date}\n${time} ET`;
  } catch {
    return null;
  }
}

export function formatHeatMapQuoteAge(timestamp: number | null, nowSeconds = Date.now() / 1000): string {
  if (timestamp === null || !Number.isFinite(timestamp) || timestamp <= 0 || timestamp > nowSeconds + 60) {
    return "Time unavailable";
  }

  const ageSeconds = Math.max(0, nowSeconds - timestamp);
  if (ageSeconds < 60) return "Just now";
  if (ageSeconds < 60 * 60) return `${Math.floor(ageSeconds / 60)}m ago`;
  if (ageSeconds < 24 * 60 * 60) return `${Math.floor(ageSeconds / (60 * 60))}h ago`;
  return `${Math.floor(ageSeconds / (24 * 60 * 60))}d ago`;
}