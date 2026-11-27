import type { LiveQuote, OrderType, PaperOrder, PaperPosition } from './paperMath.ts';

export type OrderQuoteState = 'unavailable' | 'fresh' | 'stale';
export type PennyQuoteStatus = 'unavailable' | 'current' | 'delayed' | 'stale';

const QUOTE_MAX_AGE_MS = 15 * 60_000;
const QUOTE_RESPONSE_MAX_AGE_MS = 10 * 60_000;

export function getMarketOrderQuoteError(
  quote: Pick<LiveQuote, 'price'> | undefined,
): string | null {
  if (!quote || !Number.isFinite(quote.price) || quote.price <= 0) {
    return 'A valid provider price is unavailable. No order was submitted.';
  }
  return null;
}

export function getOrderQuoteState(
  quote: LiveQuote | undefined,
  nowMs = Date.now(),
): OrderQuoteState {
  if (!quote || !Number.isFinite(quote.price) || quote.price <= 0) return 'unavailable';

  const providerTimestamp = quote.priceTimestamp;
  if (!Number.isFinite(providerTimestamp) || (providerTimestamp ?? 0) <= 0) return 'stale';
  const ageMs = nowMs - (providerTimestamp as number) * 1000;
  if (ageMs < -60_000 || ageMs > QUOTE_MAX_AGE_MS) return 'stale';

  if (quote.fetchedAtMs == null || !Number.isFinite(quote.fetchedAtMs)) return 'stale';
  const responseAgeMs = nowMs - quote.fetchedAtMs;
  if (responseAgeMs < -60_000 || responseAgeMs > QUOTE_RESPONSE_MAX_AGE_MS) return 'stale';
  return 'fresh';
}

const REGULAR_MARKET_SESSIONS = new Set(['REGULAR', 'CORE']);
const CLOSED_MARKET_SESSIONS = new Set([
  'CLOSED',
  'PRE',
  'PREPRE',
  'PRE_MARKET',
  'EARLY',
  'POST',
  'POSTPOST',
  'AFTER_HOURS',
  'POST_MARKET',
  'LATE',
  'EXTENDED',
  'OVERNIGHT',
  'OVN',
]);

function hasValidOrderPrice(quote: LiveQuote | undefined): quote is LiveQuote {
  return !!quote && Number.isFinite(quote.price) && quote.price > 0;
}

export function isClosedMarketQuote(quote: LiveQuote | undefined): boolean {
  if (!hasValidOrderPrice(quote)) return false;
  const session = quote.marketSession?.trim().toUpperCase();
  if (session && REGULAR_MARKET_SESSIONS.has(session)) return false;
  if (session && CLOSED_MARKET_SESSIONS.has(session)) return true;
  const source = (quote.priceSource ?? '').toLowerCase().replace(/[\s-]+/g, '_');
  return source.includes('previous_close')
    || source.includes('prev_close')
    || source.includes('pre_market')
    || source.includes('premarket')
    || source.includes('after_hours')
    || source.includes('afterhours')
    || source.includes('post_market')
    || source.includes('overnight');
}

export function isRegularMarketQuote(quote: LiveQuote | undefined): boolean {
  return hasValidOrderPrice(quote)
    && REGULAR_MARKET_SESSIONS.has(quote.marketSession?.trim().toUpperCase() ?? '');
}

/** Pending market orders wait for a fresh regular-session quote; closed-market
 * limit orders may use a valid last quote to evaluate their limit condition. */
export function canEvaluatePendingOrderQuote(
  order: Pick<PaperOrder, 'orderType'>,
  quote: LiveQuote | undefined,
  nowMs = Date.now(),
): boolean {
  if (!hasValidOrderPrice(quote)) return false;
  if (order.orderType === 'market') return true;
  if (order.orderType === 'limit' && isClosedMarketQuote(quote)) return true;
  return getOrderQuoteState(quote, nowMs) === 'fresh';
}

export function getPennyQuoteStatus(
  quote: LiveQuote | undefined,
  nowMs = Date.now(),
): PennyQuoteStatus {
  const quoteState = getOrderQuoteState(quote, nowMs);
  if (quoteState === 'unavailable') return 'unavailable';
  if (quoteState === 'stale') return 'stale';
  const source = (quote?.priceSource ?? '').toLowerCase().replace(/[\s-]+/g, '_');
  if (source.includes('previous_close') || quote?.marketSession?.toUpperCase() === 'CLOSED') {
    return 'delayed';
  }
  return 'current';
}

export function isPennyStockMayhemEligible(
  assetType: string | undefined,
  quote: LiveQuote | undefined,
  nowMs = Date.now(),
): boolean {
  return (assetType === 'stock' || assetType === 'etf')
    && getPennyQuoteStatus(quote, nowMs) === 'current'
    && !!quote
    && Number.isFinite(quote.price)
    && quote.price > 0
    && quote.price < 20;
}

export function getOrderEstimatePrice(args: {
  orderType: OrderType;
  currentPrice: number;
  limitPrice?: number;
  stopPrice?: number;
  trailPct?: number;
  trailAbs?: number;
}): number {
  const { orderType, currentPrice, limitPrice, stopPrice, trailPct, trailAbs } = args;
  switch (orderType) {
    case 'limit':
      return limitPrice ?? currentPrice;
    case 'stop':
      return stopPrice ?? currentPrice;
    case 'stop_limit':
      return Math.max(limitPrice ?? currentPrice, stopPrice ?? currentPrice);
    case 'trailing_stop':
      return trailPct != null
        ? currentPrice * (1 + trailPct / 100)
        : trailAbs != null
          ? currentPrice + trailAbs
          : currentPrice;
    default:
      return currentPrice;
  }
}

/** Round down so a buying-power shortcut can never exceed the selected budget. */
export function calculateSharesForBuyingPower(buyingPower: number, price: number, fraction = 1): number {
  if (
    !Number.isFinite(buyingPower) || buyingPower <= 0 ||
    !Number.isFinite(price) || price <= 0 ||
    !Number.isFinite(fraction) || fraction <= 0 || fraction > 1
  ) return 0;
  return Math.floor((buyingPower * fraction / price) * 1_000_000) / 1_000_000;
}

export function getAvailableSellShares(
  position: PaperPosition | null | undefined,
  pendingOrders: PaperOrder[],
  accountId: string,
  symbol: string,
  excludeOrderId?: string,
): number {
  if (!position || position.accountId !== accountId || position.symbol !== symbol) return 0;
  const reserved = pendingOrders
    .filter((order) => order.accountId === accountId
      && order.symbol === symbol
      && order.side === 'sell'
      && order.status === 'pending'
      && order.id !== excludeOrderId)
    .reduce((sum, order) => sum + order.shares, 0);
  return Math.max(0, position.shares - reserved);
}

export function getAvailableShortShares(
  position: PaperPosition | null | undefined,
  pendingOrders: PaperOrder[],
  accountId: string,
  symbol: string,
  excludeOrderId?: string,
): number {
  if (!position || position.accountId !== accountId || position.symbol !== symbol || position.positionType !== 'short') return 0;
  const reserved = pendingOrders
    .filter((order) => order.accountId === accountId
      && order.symbol === symbol
      && order.intent === 'cover'
      && order.status === 'pending'
      && order.id !== excludeOrderId)
    .reduce((sum, order) => sum + order.shares, 0);
  return Math.max(0, position.shares - reserved);
}

export function formatProviderMarketSession(session: string | undefined): string | null {
  if (!session) return null;
  const normalized = session.toUpperCase();
  const labels: Record<string, string> = {
    REGULAR: 'Regular session',
    CORE: 'Regular session',
    PRE: 'Pre-market',
    PREPRE: 'Pre-market',
    PRE_MARKET: 'Pre-market',
    EARLY: 'Pre-market',
    POST: 'After-hours',
    POSTPOST: 'After-hours',
    AFTER_HOURS: 'After-hours',
    POST_MARKET: 'After-hours',
    LATE: 'After-hours',
    OVERNIGHT: 'Overnight',
    OVN: 'Overnight',
    CLOSED: 'Market closed',
  };
  return labels[normalized] ?? null;
}

export function formatProviderPriceSource(source: string | undefined): string | null {
  if (!source) return null;
  const normalized = source.toLowerCase().replace(/[\s-]+/g, '_');
  if (normalized.includes('previous_close') || normalized.includes('prev_close')) return 'Previous close';
  if (normalized.includes('pre_market') || normalized.includes('premarket')) return 'Pre-market price';
  if (normalized.includes('after_hours') || normalized.includes('afterhours') || normalized.includes('post_market')) {
    return 'After-hours price';
  }
  if (normalized.includes('regular')) return 'Regular-session price';
  return null;
}
