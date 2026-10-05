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

export function getNextHeatMapRegularOpenTimestamp(
  quotes: readonly Pick<HeatMapQuote, "assetType" | "marketSession" | "nextRegularOpenTimestamp">[],
  nowSeconds = Date.now() / 1000,
): number | null {
  let nextOpen: number | null = null;
  for (const quote of quotes) {
    if (
      (quote.assetType !== "stock" && quote.assetType !== "etf") ||
      (quote.marketSession !== "closed" && quote.marketSession !== "after_hours")
    ) {
      continue;
    }
    const timestamp = quote.nextRegularOpenTimestamp;
    if (
      timestamp !== null &&
      Number.isFinite(timestamp) &&
      timestamp > nowSeconds &&
      (nextOpen === null || timestamp < nextOpen)
    ) {
      nextOpen = timestamp;
    }
  }
  return nextOpen;
}

export function formatHeatMapNextOpen(
  timestamp: number | null,
  session: HeatMapQuote["marketSession"],
  assetType: HeatMapQuote["assetType"],
  exchangeTimezone: string | null,
  nowSeconds = Date.now() / 1000,
): string | null {
  if (
    (assetType !== "stock" && assetType !== "etf") ||
    (session !== "closed" && session !== "after_hours") ||
    timestamp === null ||
    !Number.isFinite(timestamp) ||
    timestamp <= nowSeconds ||
    !exchangeTimezone
  ) {
    return null;
  }

  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: exchangeTimezone,
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      timeZoneName: "short",
    }).formatToParts(new Date(timestamp * 1000));
    const getPart = (type: Intl.DateTimeFormatPartTypes) =>
      parts.find((part) => part.type === type)?.value;
    const month = getPart("month");
    const day = getPart("day");
    const hour = getPart("hour");
    const minute = getPart("minute");
    const dayPeriod = getPart("dayPeriod");
    const timeZoneName = getPart("timeZoneName");
    if (!month || !day || !hour || !minute || !timeZoneName) return null;
    return `Next open: ${month} ${day}\n${hour}:${minute}${dayPeriod ? ` ${dayPeriod}` : ""} ${timeZoneName}`;
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