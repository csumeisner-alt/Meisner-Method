/**
 * Pure paper-trading execution engine.
 * No React/React-Native imports — safe for unit testing with Node.
 *
 * Covers:
 *  - Order evaluation (limit, stop, stop-limit, trailing stop)
 *  - Slippage simulation
 *  - FIFO cost-basis sell
 *  - T+1 cash settlement for regular paper portfolios; instant settlement for event portfolios
 *  - Monthly dividend credits
 *  - Risk checks (buying power, max position size, share availability)
 */

import {
  DEFAULT_SHORT_COLLATERAL_RATIO,
  isShortPosition,
  type PaperAccount,
  type PaperLot,
  type PaperOrder,
  type PaperPosition,
  type PaperTransaction,
  type UnsettledItem,
  type LiveQuote,
  fundFee,
  normalizeDividendYield,
} from './paperMath.ts';
import { isPaperChallengeAccountId } from './paperChallenge.ts';

// ── Constants ─────────────────────────────────────────────────────────────
/** Maximum fraction of portfolio value a single position may represent (40 %). */
export const MAX_POSITION_FRACTION = 0.4;

/** How many milliseconds between monthly dividend credits (~30 days). */
export const DIVIDEND_INTERVAL_MS = 30 * 24 * 60 * 60 * 1000;

const UTC_DAY_MS = 24 * 60 * 60 * 1000;

function utcDateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function observedFixedHoliday(year: number, month: number, day: number): string {
  const date = new Date(Date.UTC(year, month, day));
  if (date.getUTCDay() === 6) date.setUTCDate(date.getUTCDate() - 1);
  else if (date.getUTCDay() === 0) date.setUTCDate(date.getUTCDate() + 1);
  return utcDateKey(date);
}

function nthWeekdayOfMonth(year: number, month: number, weekday: number, occurrence: number): string {
  const firstDay = new Date(Date.UTC(year, month, 1)).getUTCDay();
  const day = 1 + ((weekday - firstDay + 7) % 7) + (occurrence - 1) * 7;
  return utcDateKey(new Date(Date.UTC(year, month, day)));
}

function lastWeekdayOfMonth(year: number, month: number, weekday: number): string {
  const lastDate = new Date(Date.UTC(year, month + 1, 0));
  const day = lastDate.getUTCDate() - ((lastDate.getUTCDay() - weekday + 7) % 7);
  return utcDateKey(new Date(Date.UTC(year, month, day)));
}

function easterSunday(year: number): Date {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(Date.UTC(year, month - 1, day));
}

function getUsMarketHolidays(year: number): Set<string> {
  const holidays = new Set([
    observedFixedHoliday(year, 0, 1),   // New Year's Day
    nthWeekdayOfMonth(year, 0, 1, 3),   // Martin Luther King Jr. Day
    nthWeekdayOfMonth(year, 1, 1, 3),   // Presidents Day
    lastWeekdayOfMonth(year, 4, 1),     // Memorial Day
    observedFixedHoliday(year, 6, 4),   // Independence Day
    nthWeekdayOfMonth(year, 8, 1, 1),  // Labor Day
    nthWeekdayOfMonth(year, 10, 4, 4), // Thanksgiving
    observedFixedHoliday(year, 11, 25), // Christmas
  ]);
  if (year >= 2022) holidays.add(observedFixedHoliday(year, 5, 19)); // Juneteenth
  const goodFriday = easterSunday(year);
  goodFriday.setUTCDate(goodFriday.getUTCDate() - 2);
  holidays.add(utcDateKey(goodFriday));
  return holidays;
}

function isUsMarketSettlementDay(date: Date): boolean {
  const weekday = date.getUTCDay();
  if (weekday === 0 || weekday === 6) return false;
  const key = utcDateKey(date);
  const year = date.getUTCFullYear();
  return ![year - 1, year, year + 1].some((holidayYear) =>
    getUsMarketHolidays(holidayYear).has(key),
  );
}

/** Return the next U.S. equity-market business day, preserving the fill time. */
export function getTPlusOneSettlementDate(filledAt: string): string {
  const date = new Date(filledAt);
  if (!Number.isFinite(date.getTime())) throw new RangeError('Invalid paper trade fill time.');
  do {
    date.setUTCDate(date.getUTCDate() + 1);
  } while (!isUsMarketSettlementDay(date));
  return date.toISOString();
}

// ── Slippage ──────────────────────────────────────────────────────────────
/**
 * Apply realistic random slippage to a fill price.
 *
 * Buys pay slightly more; sells receive slightly less.
 * Base slippage: 0.05 % to 0.30 % of price (uniform random).
 */
export function applySlippage(
  price: number,
  _shares: number,
  side: 'buy' | 'sell',
): number {
  const pct = 0.0005 + Math.random() * 0.0025; // 0.05 % – 0.30 %
  const sign = side === 'buy' ? 1 : -1;
  return Math.max(0.01, price * (1 + sign * pct));
}

/**
 * Apply slippage without violating a limit price. A limit buy cannot fill
 * above its limit and a limit sell cannot fill below its limit, including
 * when the quote crossed the trigger by only a small amount.
 */
export function applyOrderSlippage(order: PaperOrder, marketPrice: number): number {
  const slipped = applySlippage(marketPrice, order.shares, order.side);
  if ((order.orderType === 'limit' || order.orderType === 'stop_limit') && order.limitPrice != null) {
    return order.side === 'buy'
      ? Math.min(slipped, order.limitPrice)
      : Math.max(slipped, order.limitPrice);
  }
  return slipped;
}

// ── Order evaluation ──────────────────────────────────────────────────────
export type EvaluateResult =
  | { shouldFill: false; updatedTrailRef?: number }
  | { shouldFill: true };

/**
 * Decide whether a pending order should fill at `currentPrice`.
 *
 * For trailing stops the trailing reference (high- or low-water mark) is
 * updated whenever the price moves favourably; the order fills when the
 * price reverses past the trail distance.
 *
 * Returns `shouldFill` and, for trailing orders that moved the ref, an
 * `updatedTrailRef` the caller should persist back onto the order.
 */
export function evaluateOrder(
  order: PaperOrder,
  currentPrice: number,
): EvaluateResult {
  if (order.status !== 'pending') return { shouldFill: false };

  switch (order.orderType) {
    case 'market':
      return { shouldFill: true };

    case 'limit':
      if (order.side === 'buy') {
        // Fill when price falls to / below the limit
        return { shouldFill: currentPrice <= (order.limitPrice ?? Infinity) };
      }
      // Fill when price rises to / above the limit
      return { shouldFill: currentPrice >= (order.limitPrice ?? 0) };

    case 'stop':
      if (order.side === 'buy') {
        // Buy-stop (breakout): fill when price rises to / above stop
        return { shouldFill: currentPrice >= (order.stopPrice ?? Infinity) };
      }
      // Sell-stop (stop-loss): fill when price falls to / below stop
      return { shouldFill: currentPrice <= (order.stopPrice ?? 0) };

    case 'stop_limit': {
      if (order.side === 'sell') {
        const triggered = currentPrice <= (order.stopPrice ?? 0);
        const executable = currentPrice >= (order.limitPrice ?? 0);
        return { shouldFill: triggered && executable };
      }
      const triggered = currentPrice >= (order.stopPrice ?? Infinity);
      const executable = currentPrice <= (order.limitPrice ?? Infinity);
      return { shouldFill: triggered && executable };
    }

    case 'trailing_stop': {
      if (order.side === 'sell') {
        // Sell trailing stop: ref moves up with price; trigger on drop
        const ref = order.trailRef ?? currentPrice;
        // Trail amount computed from the reference (high-water mark), not current price
        const trailAmt = order.trailPct != null ? ref * (order.trailPct / 100) : (order.trailAbs ?? 0);
        if (currentPrice > ref) {
          // Price hit a new high — raise the ref (don't fill yet)
          return { shouldFill: false, updatedTrailRef: currentPrice };
        }
        return { shouldFill: currentPrice <= ref - trailAmt };
      }
      // Buy trailing stop: ref moves down with price; trigger on rise
      const ref = order.trailRef ?? currentPrice;
      // Trail amount computed from the reference (low-water mark)
      const trailAmt = order.trailPct != null ? ref * (order.trailPct / 100) : (order.trailAbs ?? 0);
      if (currentPrice < ref) {
        return { shouldFill: false, updatedTrailRef: currentPrice };
      }
      return { shouldFill: currentPrice >= ref + trailAmt };
    }

    default:
      return { shouldFill: false };
  }
}

// ── FIFO sell ─────────────────────────────────────────────────────────────
export type FifoSellResult = {
  /** Realised P&L computed lot-by-lot on FIFO basis. */
  realizedPnL: number;
  /** Fund fee computed from each consumed lot, when metadata is provided. */
  fee: number;
  /** Lot array after consuming the sold shares (oldest lots first). */
  updatedLots: PaperLot[];
};

/**
 * Sell `sharesSold` shares of `symbol` using FIFO cost-basis accounting.
 *
 * Oldest lots are consumed first.  Lots with zero shares remaining are
 * removed from the returned array.
 */
export function fifoSell(
  lots: PaperLot[],
  accountId: string,
  symbol: string,
  sharesSold: number,
  fillPrice: number,
  expenseRatio?: number,
  soldAt?: string,
): FifoSellResult {
  // Split by symbol / account for isolation
  const matching = lots
    .filter(l => l.symbol === symbol && l.accountId === accountId)
    .sort((a, b) => new Date(a.purchasedAt).getTime() - new Date(b.purchasedAt).getTime());
  const others = lots.filter(l => !(l.symbol === symbol && l.accountId === accountId));

  let remaining = sharesSold;
  let realizedPnL = 0;
  let fee = 0;
  const updatedMatching: PaperLot[] = [];

  for (const lot of matching) {
    if (remaining <= 0) {
      updatedMatching.push(lot);
      continue;
    }
    const consumed = Math.min(lot.shares, remaining);
    realizedPnL += consumed * (fillPrice - lot.cost);
    if (soldAt) {
      fee += fundFee(consumed * lot.cost, expenseRatio, lot.purchasedAt, soldAt);
    }
    remaining -= consumed;
    const leftover = lot.shares - consumed;
    if (leftover > 0.0001) {
      updatedMatching.push({ ...lot, shares: leftover });
    }
  }

  return { realizedPnL, fee, updatedLots: [...others, ...updatedMatching] };
}

// ── Sell settlement ────────────────────────────────────────────────────────
export type SettleResult = {
  /** Account with newly-settled cash folded into .cash. */
  updated: PaperAccount;
  /** Total dollars that settled in this pass. */
  settled: number;
};

/**
 * Move any unsettled sell proceeds whose `settlesAt` date has arrived into
 * the main cash balance.  Call once on app launch and after each day-change.
 */
export function settleCash(account: PaperAccount, nowISO: string): SettleResult {
  const now = new Date(nowISO).getTime();
  const items: UnsettledItem[] = account.unsettledItems ?? [];
  if (isPaperChallengeAccountId(account.id)) {
    const settled = items.length > 0
      ? items.reduce((sum, item) => sum + item.amount, 0)
      : account.unsettledCash ?? 0;
    return {
      updated: {
        ...account,
        cash: account.cash + settled,
        unsettledCash: 0,
        unsettledItems: [],
      },
      settled,
    };
  }
  let settled = 0;
  const remaining: UnsettledItem[] = [];

  for (const item of items) {
    if (new Date(item.settlesAt).getTime() <= now) {
      settled += item.amount;
    } else {
      remaining.push(item);
    }
  }

  const newUnsettledCash = remaining.reduce((s, i) => s + i.amount, 0);
  return {
    updated: {
      ...account,
      cash: account.cash + settled,
      unsettledCash: newUnsettledCash,
      unsettledItems: remaining,
    },
    settled,
  };
}

// ── Dividend credits ──────────────────────────────────────────────────────
export type DividendCreditResult = {
  updatedAccount: PaperAccount;
  newTransactions: PaperTransaction[];
};

/**
 * Credit one month's pro-rata dividends to cash.
 *
 * Only runs when at least DIVIDEND_INTERVAL_MS have passed since the last
 * credit so the app never double-credits within the same month.
 *
 * Each paying position gets its own DIVIDEND transaction so the history
 * tab can display them.
 */
export function creditDividends(
  positions: PaperPosition[],
  account: PaperAccount,
  quotes: Record<string, Pick<LiveQuote, 'price'>>,
  nowISO: string,
  uid: () => string,
): DividendCreditResult {
  const now = new Date(nowISO).getTime();
  const lastCredit = account.lastDividendCredit
    ? new Date(account.lastDividendCredit).getTime()
    : 0;

  if (now - lastCredit < DIVIDEND_INTERVAL_MS) {
    return { updatedAccount: account, newTransactions: [] };
  }

  const accountPositions = positions.filter(p => p.accountId === account.id && !isShortPosition(p));
  let totalCredit = 0;
  const txns: PaperTransaction[] = [];

  for (const pos of accountPositions) {
    const price = quotes[pos.symbol]?.price ?? pos.avgCost;
    let annual = 0;
    if ((pos.dividendRate ?? 0) > 0) {
      annual = pos.shares * pos.dividendRate!;
    } else if (pos.dividendYield > 0) {
      const y = normalizeDividendYield(pos.dividendYield, pos.dividendRate, price);
      annual = pos.shares * price * y;
    }
    if (annual <= 0) continue;
    const monthly = annual / 12;
    totalCredit += monthly;

    txns.push({
      id: uid(),
      accountId: account.id,
      symbol: pos.symbol,
      companyName: pos.companyName,
      action: 'DIVIDEND',
      shares: pos.shares,
      price,
      total: monthly,
      date: nowISO,
    });
  }

  return {
    updatedAccount: {
      ...account,
      cash: account.cash + totalCredit,
      lastDividendCredit: nowISO,
    },
    newTransactions: txns,
  };
}

// ── Risk checks ───────────────────────────────────────────────────────────
/**
 * Validate an order against buying power, position-size limits, and share
 * availability.  Returns `null` when the order is acceptable, or an
 * error message string the UI can display.
 */
/** Validate the Penny Stock Mayhem long-buy rule using the actual quote and fill. */
export function getPurchaseLimitRejectionReason(args: {
  order: Pick<PaperOrder, 'side' | 'intent' | 'assetType'>;
  executionQuotePrice?: number;
  fillPrice: number;
  maxPurchasePrice?: number;
}): string | null {
  const { order, executionQuotePrice, fillPrice, maxPurchasePrice } = args;
  if (order.side !== 'buy' || order.intent || maxPurchasePrice == null) return null;
  if (!Number.isFinite(maxPurchasePrice) || maxPurchasePrice <= 0) {
    return 'Penny Stock Mayhem purchase rules are unavailable. No purchase was made.';
  }
  if (order.assetType !== 'stock' && order.assetType !== 'etf') {
    return 'Penny Stock Mayhem requires a verified stock or ETF. No purchase was made.';
  }
  if (executionQuotePrice == null || !Number.isFinite(executionQuotePrice) || executionQuotePrice <= 0) {
    return 'Penny Stock Mayhem could not verify a current execution quote. No purchase was made.';
  }
  if (executionQuotePrice >= maxPurchasePrice || fillPrice >= maxPurchasePrice) {
    return `Penny Stock Mayhem buys require both the latest quote and final fill to be below $${maxPurchasePrice.toFixed(2)}. No purchase was made.`;
  }
  return null;
}

export function checkRisk(args: {
  side: 'buy' | 'sell';
  intent?: 'short' | 'cover';
  shares: number;
  orderType: PaperOrder['orderType'];
  limitPrice?: number;
  stopPrice?: number;
  trailPct?: number;
  trailAbs?: number;
  symbol: string;
  currentPrice: number;
  account: PaperAccount;
  accountPositions: PaperPosition[];
  quotes: Record<string, Pick<LiveQuote, 'price'>>;
  /** Pending orders already committed by this account. */
  pendingOrders?: PaperOrder[];
  /** Exclude this order while editing it, so it is not double-counted. */
  excludeOrderId?: string;
}): string | null {
  const {
    side, intent, shares, orderType, limitPrice, stopPrice, trailPct, trailAbs,
    symbol, currentPrice,
    account, accountPositions, quotes, pendingOrders = [], excludeOrderId,
  } = args;
  const scopedPositions = accountPositions.filter((position) => position.accountId === account.id);

  if (!Number.isFinite(shares) || shares <= 0) {
    return 'Enter a positive number of shares.';
  }
  if (!Number.isFinite(currentPrice) || currentPrice <= 0) {
    return 'A valid live price is required.';
  }
  if (
    (orderType === 'limit' && (!Number.isFinite(limitPrice) || (limitPrice ?? 0) <= 0)) ||
    (orderType === 'stop' && (!Number.isFinite(stopPrice) || (stopPrice ?? 0) <= 0)) ||
    (orderType === 'stop_limit' && (
      !Number.isFinite(limitPrice) || (limitPrice ?? 0) <= 0 ||
      !Number.isFinite(stopPrice) || (stopPrice ?? 0) <= 0
    )) ||
    (orderType === 'trailing_stop' && (
      (trailPct == null || !Number.isFinite(trailPct) || trailPct <= 0) &&
      (trailAbs == null || !Number.isFinite(trailAbs) || trailAbs <= 0)
    ))
  ) {
    return 'Enter a valid positive price or trail amount for this order type.';
  }

  // Estimate worst-case cost / proceeds for the risk check
  const estimatedPrice = orderType === 'limit' && limitPrice
    ? limitPrice
    : orderType === 'stop' && stopPrice
      ? stopPrice
      : orderType === 'stop_limit' && stopPrice && limitPrice
        ? Math.max(stopPrice, limitPrice)
        : orderType === 'trailing_stop' && trailPct
          ? currentPrice * (1 + trailPct / 100)
          : orderType === 'trailing_stop' && trailAbs
            ? currentPrice + trailAbs
            : currentPrice;
  if (!Number.isFinite(estimatedPrice) || estimatedPrice <= 0) {
    return 'Enter a valid order price.';
  }
  const configuredRatio = account.shortCollateralRatio ?? DEFAULT_SHORT_COLLATERAL_RATIO;
  if (!Number.isFinite(configuredRatio) || configuredRatio < 1) {
    return 'Simulated collateral must be at least 100% of short-sale proceeds.';
  }

  const activePending = pendingOrders.filter(
    o => o.status === 'pending' && o.id !== excludeOrderId && o.accountId === account.id,
  );
  const pendingBuyCost = activePending
    .filter(o => o.side === 'buy' && !o.intent)
    .reduce((sum, o) => {
      const orderPrice = pendingOrderPrice(o, quotes[o.symbol]?.price ?? currentPrice);
      return sum + (Number.isFinite(orderPrice) && orderPrice > 0 ? o.shares * orderPrice : 0);
    }, 0);
  const pendingShortMargin = activePending
    .filter((order) => order.intent === 'short')
    .reduce((sum, order) => {
      const price = pendingOrderPrice(order, quotes[order.symbol]?.price ?? currentPrice);
      return sum + order.shares * price
        * Math.max(0, (order.shortCollateralRatio
          ?? account.shortCollateralRatio ?? DEFAULT_SHORT_COLLATERAL_RATIO) - 1);
    }, 0);
  const pendingCoverCash = activePending
    .filter((order) => order.intent === 'cover')
    .reduce((sum, order) => {
      const position = scopedPositions.find((item) =>
        item.accountId === account.id && item.symbol === order.symbol && isShortPosition(item),
      );
      const reference = quotes[order.symbol]?.price ?? currentPrice;
      const estimatedCost = order.shares * pendingOrderPrice(order, reference);
      const releasePerShare = position?.collateralPerShare
        ?? (position ? position.avgCost * configuredRatio : 0);
      const collateralRelease = order.shares * releasePerShare;
      return sum + Math.max(0, estimatedCost - collateralRelease);
    }, 0);

  if (intent === 'short') {
    const ratio = configuredRatio;
    const requiredMargin = shares * estimatedPrice * Math.max(0, ratio - 1);
    const availableCash = account.cash - pendingBuyCost - pendingShortMargin;
    if (requiredMargin > availableCash) {
      return `Insufficient buying power for simulated short collateral. Need ${fmt(requiredMargin)}, with ${fmt(pendingBuyCost + pendingShortMargin)} already committed.`;
    }
    const existingPos = scopedPositions.find((position) =>
      position.symbol === symbol && isShortPosition(position),
    );
    if (scopedPositions.some((position) => position.symbol === symbol && !isShortPosition(position))) {
      return `Close your existing long ${symbol} position before opening a short position.`;
    }
    const equity = account.cash
      + (account.unsettledCash ?? 0)
      + (account.shortCollateral ?? 0)
      + scopedPositions.reduce((sum, position) => {
        const value = position.shares * (quotes[position.symbol]?.price ?? position.avgCost);
        return sum + (isShortPosition(position) ? -value : value);
      }, 0);
    const existingValue = existingPos
      ? existingPos.shares * (quotes[symbol]?.price ?? existingPos.avgCost)
      : 0;
    const pendingSymbolValue = activePending
      .filter((order) => order.intent === 'short' && order.symbol === symbol)
      .reduce((sum, order) => sum + order.shares * pendingOrderPrice(order, currentPrice), 0);
    if ((existingValue + pendingSymbolValue + shares * estimatedPrice) / Math.max(equity, 1) > MAX_POSITION_FRACTION) {
      return `This would put more than 40% of your portfolio in ${symbol} (max 40%).`;
    }
  } else if (intent === 'cover') {
    const pos = scopedPositions.find((position) =>
      position.symbol === symbol && isShortPosition(position) && position.accountId === account.id,
    );
    const reservedShares = activePending
      .filter((order) => order.intent === 'cover' && order.symbol === symbol)
      .reduce((sum, order) => sum + order.shares, 0);
    const availableShares = (pos?.shares ?? 0) - reservedShares;
    if (!pos || availableShares < shares - 0.0001) {
      return `You only have ${Math.max(0, availableShares)} ${symbol} short shares available to cover after pending covers.`;
    }
    const releasePerShare = pos.collateralPerShare
      ?? pos.avgCost * configuredRatio;
    const release = shares * releasePerShare;
    const estimatedCost = shares * estimatedPrice;
    if (estimatedCost > account.cash - pendingBuyCost - pendingShortMargin - pendingCoverCash + release) {
      return `Insufficient account funds and released collateral to cover this order. Estimated cost ${fmt(estimatedCost)}.`;
    }
  } else if (side === 'buy') {
    const cost = shares * estimatedPrice;
    const availableCash = account.cash - pendingBuyCost - pendingShortMargin;
    if (cost > availableCash) {
      return `Insufficient buying power. Need ${fmt(cost)}, but ${fmt(pendingBuyCost)} is already committed to pending buys.`;
    }
    // Max position size: 40 % of total portfolio value
    const portfolioValue =
      account.cash +
      (account.unsettledCash ?? 0) +
      scopedPositions.reduce(
        (s, p) => s + (isShortPosition(p) ? -1 : 1) * p.shares * (quotes[p.symbol]?.price ?? p.avgCost),
        0,
      ) + (account.shortCollateral ?? 0);
    const existingPos = scopedPositions.find(p => p.symbol === symbol && !isShortPosition(p));
    if (scopedPositions.some((position) => position.symbol === symbol && isShortPosition(position))) {
      return `Cover your existing ${symbol} short position before buying shares.`;
    }
    const existingValue = existingPos
      ? existingPos.shares * (quotes[symbol]?.price ?? existingPos.avgCost)
      : 0;
    const pendingSymbolValue = activePending
      .filter(o => o.side === 'buy' && !o.intent && o.symbol === symbol)
      .reduce((sum, o) => {
        const orderPrice = pendingOrderPrice(o, quotes[symbol]?.price ?? currentPrice);
        return sum + (Number.isFinite(orderPrice) && orderPrice > 0 ? o.shares * orderPrice : 0);
      }, 0);
    const newPositionValue = existingValue + pendingSymbolValue + cost;
    const postTradeValue = portfolioValue + cost;
    if (postTradeValue > 0 && newPositionValue / postTradeValue > MAX_POSITION_FRACTION) {
      const pct = ((newPositionValue / postTradeValue) * 100).toFixed(0);
      return `This would put ${pct}% of your portfolio in ${symbol} (max 40%).`;
    }
  } else {
    const pos = scopedPositions.find(p => p.symbol === symbol);
    const reservedShares = activePending
      .filter(o => o.side === 'sell' && !o.intent && o.symbol === symbol)
      .reduce((sum, o) => sum + o.shares, 0);
    const availableShares = (pos?.shares ?? 0) - reservedShares;
    if (!pos || availableShares < shares) {
      return `You only hold ${Math.max(0, availableShares)} shares of ${symbol} available after pending sells.`;
    }
  }
  return null;
}

function pendingOrderPrice(order: PaperOrder, fallbackPrice: number): number {
  if (order.orderType === 'limit' && order.limitPrice) return order.limitPrice;
  if (order.orderType === 'stop' && order.stopPrice) return order.stopPrice;
  if (order.orderType === 'stop_limit' && order.stopPrice && order.limitPrice) {
    return Math.max(order.stopPrice, order.limitPrice);
  }
  if (order.orderType === 'trailing_stop' && order.trailPct) {
    return fallbackPrice * (1 + order.trailPct / 100);
  }
  if (order.orderType === 'trailing_stop' && order.trailAbs) {
    return fallbackPrice + order.trailAbs;
  }
  return fallbackPrice;
}

/** Settled cash remaining after this account's pending buy reservations. */
export function getAvailableSettledBuyingPower(
  account: PaperAccount,
  pendingOrders: PaperOrder[],
  quotes: Record<string, Pick<LiveQuote, 'price'>>,
  excludeOrderId?: string,
  accountPositions: PaperPosition[] = [],
): number {
  const buyReserved = pendingOrders
    .filter(order => order.accountId === account.id
      && order.status === 'pending'
      && order.side === 'buy'
      && !order.intent
      && order.id !== excludeOrderId)
    .reduce((sum, order) => {
      const reference = quotes[order.symbol]?.price ?? order.limitPrice ?? order.stopPrice ?? 0;
      return Number.isFinite(reference) && reference > 0
        ? sum + order.shares * pendingOrderPrice(order, reference)
        : sum;
    }, 0);
  const shortMarginReserved = pendingOrders
    .filter((order) => order.accountId === account.id
      && order.status === 'pending'
      && order.intent === 'short'
      && order.id !== excludeOrderId)
    .reduce((sum, order) => {
      const reference = quotes[order.symbol]?.price ?? order.limitPrice ?? order.stopPrice ?? 0;
      return Number.isFinite(reference) && reference > 0
        ? sum + order.shares * pendingOrderPrice(order, reference)
          * Math.max(0, (order.shortCollateralRatio
            ?? account.shortCollateralRatio ?? DEFAULT_SHORT_COLLATERAL_RATIO) - 1)
        : sum;
    }, 0);
  const coverCashReserved = pendingOrders
    .filter((order) => order.accountId === account.id
      && order.status === 'pending'
      && order.intent === 'cover'
      && order.id !== excludeOrderId)
    .reduce((sum, order) => {
      const reference = quotes[order.symbol]?.price ?? order.limitPrice ?? order.stopPrice ?? 0;
      if (!Number.isFinite(reference) || reference <= 0) return sum;
      const position = accountPositions.find((item) =>
        item.accountId === account.id && item.symbol === order.symbol && isShortPosition(item),
      );
      const collateralPerShare = position?.collateralPerShare
        ?? (position ? position.avgCost * (account.shortCollateralRatio ?? DEFAULT_SHORT_COLLATERAL_RATIO) : 0);
      const cost = order.shares * pendingOrderPrice(order, reference);
      return sum + Math.max(0, cost - order.shares * collateralPerShare);
    }, 0);
  return Math.max(0, account.cash - buyReserved - shortMarginReserved - coverCashReserved);
}

function fmt(n: number) {
  return n.toLocaleString('en-US', {
    style: 'currency', currency: 'USD',
    minimumFractionDigits: 2, maximumFractionDigits: 2,
  });
}

// ── Fill helpers ──────────────────────────────────────────────────────────
export type FillOrderResult =
  | { ok: true; updatedAccount: PaperAccount; updatedPositions: PaperPosition[]; updatedLots: PaperLot[]; newTransaction: PaperTransaction }
  | { ok: false; reason: string };

/**
 * Execute a filled order: update the account, position, lots, and produce a
 * transaction record.
 *
 * For regular portfolio sells, proceeds are placed in `unsettledItems` with a
 * T+1 settlement date. Event portfolio proceeds are credited immediately.
 *
 * Returns `{ ok: false, reason }` when execution-time constraints cannot be
 * satisfied (insufficient cash for a buy; no available shares for a sell),
 * so callers never end up with negative cash or phantom SELL transactions.
 */
export function fillOrder(args: {
  order: PaperOrder;
  fillPrice: number;
  executionQuotePrice?: number;
  maxPurchasePrice?: number;
  filledAt: string;
  account: PaperAccount;
  positions: PaperPosition[];
  lots: PaperLot[];
  uid: () => string;
}): FillOrderResult {
  const { order, fillPrice, filledAt, account, positions, lots, uid } = args;
  const { accountId, symbol, companyName, shares, side } = order;

  if (order.status !== 'pending') {
    return { ok: false, reason: 'Only a pending order can be filled.' };
  }

  if (
    !Number.isFinite(shares) || shares <= 0 ||
    !Number.isFinite(fillPrice) || fillPrice <= 0 ||
    !filledAt || Number.isNaN(new Date(filledAt).getTime())
  ) {
    return { ok: false, reason: 'Order contains invalid shares, price, or fill time.' };
  }

  const purchaseLimitError = getPurchaseLimitRejectionReason({
    order,
    executionQuotePrice: args.executionQuotePrice,
    fillPrice,
    maxPurchasePrice: args.maxPurchasePrice,
  });
  if (purchaseLimitError) {
    return { ok: false, reason: purchaseLimitError };
  }

  let updatedAccount = { ...account };
  let updatedPositions = [...positions];
  let updatedLots = [...lots];
  let newTransaction: PaperTransaction;

  if (side === 'buy' && !order.intent) {
    const total = shares * fillPrice;
    // Execution-time buying-power guard (price may have moved since placement)
    if (total > updatedAccount.cash) {
      return {
        ok: false,
        reason: `Insufficient buying power at fill time: need ${fmt(total)}, have ${fmt(updatedAccount.cash)}.`,
      };
    }
    updatedAccount = { ...updatedAccount, cash: updatedAccount.cash - total };

    // Update or create position
    if (updatedPositions.some((position) => position.symbol === symbol
      && position.accountId === accountId && isShortPosition(position))) {
      return { ok: false, reason: `Cover your existing ${symbol} short position before buying shares.` };
    }
    const existing = updatedPositions.find(
      p => p.symbol === symbol && p.accountId === accountId && !isShortPosition(p),
    );
    if (existing) {
      const totalShares = existing.shares + shares;
      const newAvg = (existing.shares * existing.avgCost + shares * fillPrice) / totalShares;
      updatedPositions = updatedPositions.map(p =>
        p.id === existing.id
          ? {
              ...p,
              shares: totalShares,
              avgCost: newAvg,
              ...(order.assetType ? { assetType: order.assetType } : {}),
              ...(order.dividendYield != null ? { dividendYield: order.dividendYield } : {}),
              ...(order.dividendRate != null ? { dividendRate: order.dividendRate } : {}),
              ...(order.expenseRatio != null ? { expenseRatio: order.expenseRatio } : {}),
              ...(order.sector != null ? { sector: order.sector } : {}),
            }
          : p,
      );
    } else {
      updatedPositions = [
        ...updatedPositions,
        {
          id: uid(),
          accountId,
          symbol,
          companyName,
          shares,
          avgCost: fillPrice,
          ...(order.assetType ? { assetType: order.assetType } : {}),
          openedAt: filledAt,
          dividendYield: order.dividendYield ?? 0,
          dividendRate: order.dividendRate ?? 0,
          expenseRatio: order.expenseRatio ?? 0,
          sector: order.sector ?? '',
        },
      ];
    }

    // Add a new lot for FIFO tracking
    updatedLots = [
      ...updatedLots,
      {
        id: uid(),
        accountId,
        symbol,
        shares,
        cost: fillPrice,
        purchasedAt: filledAt,
      },
    ];

    newTransaction = {
      id: uid(),
      accountId,
      symbol,
      companyName,
      action: 'BUY',
      shares,
      price: fillPrice,
      total,
      date: filledAt,
    };
  } else if (order.intent === 'short') {
    if (updatedPositions.some((position) => position.accountId === accountId
      && position.symbol === symbol && !isShortPosition(position))) {
      return { ok: false, reason: `Close your existing long ${symbol} position before opening a short.` };
    }
    const total = shares * fillPrice;
    const ratio = order.shortCollateralRatio
      ?? updatedAccount.shortCollateralRatio ?? DEFAULT_SHORT_COLLATERAL_RATIO;
    if (!Number.isFinite(ratio) || ratio < 1) {
      return { ok: false, reason: 'Simulated collateral must be at least 100% of short-sale proceeds.' };
    }
    const margin = total * Math.max(0, ratio - 1);
    if (margin > updatedAccount.cash) {
      return { ok: false, reason: `Insufficient buying power at fill time: need ${fmt(margin)}, have ${fmt(updatedAccount.cash)}.` };
    }
    updatedAccount = {
      ...updatedAccount,
      cash: updatedAccount.cash - margin,
      shortCollateral: (updatedAccount.shortCollateral ?? 0) + total * ratio,
      shortCollateralRatio: updatedAccount.shortCollateralRatio ?? ratio,
    };
    const existing = updatedPositions.find((position) =>
      position.accountId === accountId && position.symbol === symbol && isShortPosition(position),
    );
    if (existing) {
      const newShares = existing.shares + shares;
      const avgCost = (existing.shares * existing.avgCost + shares * fillPrice) / newShares;
      const collateralPerShare = (
        existing.shares * (existing.collateralPerShare ?? existing.avgCost * ratio)
        + shares * fillPrice * ratio
      ) / newShares;
      updatedPositions = updatedPositions.map((position) => position.id === existing.id
        ? { ...position, shares: newShares, avgCost, collateralPerShare }
        : position);
    } else {
      updatedPositions.push({
        id: uid(), accountId, symbol, companyName, shares, avgCost: fillPrice,
        positionType: 'short', collateralPerShare: fillPrice * ratio,
        openedAt: filledAt, dividendYield: 0, dividendRate: 0,
        expenseRatio: 0, sector: order.sector ?? '',
      });
    }
    newTransaction = {
      id: uid(), accountId, symbol, companyName, action: 'SHORT_SELL',
      shares, price: fillPrice, total, date: filledAt,
      cashDelta: -margin,
      shortCollateralDelta: total * ratio,
    };
  } else if (order.intent === 'cover') {
    const pos = updatedPositions.find((position) =>
      position.accountId === accountId && position.symbol === symbol && isShortPosition(position),
    );
    if (!pos || pos.shares < shares - 0.0001) {
      return { ok: false, reason: `Insufficient short shares at fill time: need ${shares}, hold ${pos?.shares ?? 0} of ${symbol}.` };
    }
    const releasedCollateral = shares * (pos.collateralPerShare
      ?? pos.avgCost * (account.shortCollateralRatio ?? DEFAULT_SHORT_COLLATERAL_RATIO));
    const total = shares * fillPrice;
    const pnl = shares * (pos.avgCost - fillPrice);
    const fee = fundFee(shares * pos.avgCost, pos.expenseRatio, pos.openedAt, filledAt);
    if (total > account.cash + releasedCollateral) {
      return { ok: false, reason: `Insufficient account funds and collateral to cover at fill time. Need ${fmt(total)}.` };
    }
    updatedAccount = {
      ...updatedAccount,
      cash: updatedAccount.cash + releasedCollateral - total - fee,
      shortCollateral: Math.max(0, (updatedAccount.shortCollateral ?? 0) - releasedCollateral),
    };
    const remaining = pos.shares - shares;
    updatedPositions = remaining <= 0.0001
      ? updatedPositions.filter((position) => position.id !== pos.id)
      : updatedPositions.map((position) => position.id === pos.id ? { ...position, shares: remaining } : position);
    newTransaction = {
      id: uid(), accountId, symbol, companyName, action: 'BUY_TO_COVER',
      shares, price: fillPrice, total, date: filledAt,
      realizedPnL: pnl, fee,
      cashDelta: releasedCollateral - total - fee,
      shortCollateralDelta: -releasedCollateral,
    };
  } else {
    // SELL — execution-time share-availability guard
    const pos = updatedPositions.find(
      p => p.symbol === symbol && p.accountId === accountId && !isShortPosition(p),
    );
    if (!pos || pos.shares < shares - 0.0001) {
      return {
        ok: false,
        reason: `Insufficient shares at fill time: need ${shares}, hold ${pos?.shares ?? 0} of ${symbol}.`,
      };
    }

    const total = shares * fillPrice;
    // Legacy v1 positions may have no persisted lots. Reconstruct only the
    // missing shares from the aggregate position so FIFO P&L and fees remain
    // internally consistent instead of silently reporting $0 P&L.
    const matchingLotShares = lots
      .filter(l => l.accountId === accountId && l.symbol === symbol)
      .reduce((sum, lot) => sum + lot.shares, 0);
    const missingLotShares = Math.max(0, pos.shares - matchingLotShares);
    const lotsForSell = missingLotShares > 0
      ? [
          ...lots,
          {
            id: `legacy-${accountId}-${symbol}-${pos.id}`,
            accountId,
            symbol,
            shares: missingLotShares,
            cost: pos.avgCost,
            purchasedAt: pos.openedAt,
          },
        ]
      : lots;

    // FIFO P&L
    const { realizedPnL, fee, updatedLots: afterSellLots } = fifoSell(
      lotsForSell, accountId, symbol, shares, fillPrice, pos.expenseRatio, filledAt,
    );
    const proceeds = total - fee; // net of fund fee
    updatedLots = afterSellLots;

    if (isPaperChallengeAccountId(accountId)) {
      const accountWithSettledEventCash = settleCash(updatedAccount, filledAt).updated;
      updatedAccount = {
        ...accountWithSettledEventCash,
        cash: accountWithSettledEventCash.cash + proceeds,
      };
    } else {
      // T+1 settlement — proceeds remain unavailable until the next market day.
      const settlesAt = getTPlusOneSettlementDate(filledAt);
      const existingItems = updatedAccount.unsettledItems ?? [];
      const newItem: UnsettledItem = { amount: proceeds, settlesAt };
      updatedAccount = {
        ...updatedAccount,
        unsettledCash: (updatedAccount.unsettledCash ?? 0) + proceeds,
        unsettledItems: [...existingItems, newItem],
      };
    }

    // Update or remove position
    if (pos) {
      const remaining = pos.shares - shares;
      if (remaining <= 0.0001) {
        updatedPositions = updatedPositions.filter(p => p.id !== pos.id);
      } else {
        updatedPositions = updatedPositions.map(p =>
          p.id === pos.id ? { ...p, shares: remaining } : p,
        );
      }
    }

    newTransaction = {
      id: uid(),
      accountId,
      symbol,
      companyName,
      action: 'SELL',
      shares,
      price: fillPrice,
      total,
      date: filledAt,
      realizedPnL,
      fee,
    };
  }

  return { ok: true, updatedAccount, updatedPositions, updatedLots, newTransaction };
}
