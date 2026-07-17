/**
 * Pure paper-trading execution engine.
 * No React/React-Native imports — safe for unit testing with Node.
 *
 * Covers:
 *  - Order evaluation (limit, stop, stop-limit, trailing stop)
 *  - Slippage simulation
 *  - FIFO cost-basis sell
 *  - T+2 cash settlement
 *  - Monthly dividend credits
 *  - Risk checks (buying power, max position size, share availability)
 */

import {
  type PaperAccount,
  type PaperLot,
  type PaperOrder,
  type PaperPosition,
  type PaperTransaction,
  type UnsettledItem,
  type LiveQuote,
  fundFee,
} from './paperMath.ts';

// ── Constants ─────────────────────────────────────────────────────────────
/** Maximum fraction of portfolio value a single position may represent (40 %). */
export const MAX_POSITION_FRACTION = 0.4;

/** T+2 settlement: 2 calendar days in milliseconds. */
export const SETTLEMENT_DELAY_MS = 2 * 24 * 60 * 60 * 1000;

/** How many milliseconds between monthly dividend credits (~30 days). */
export const DIVIDEND_INTERVAL_MS = 30 * 24 * 60 * 60 * 1000;

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
): FifoSellResult {
  // Split by symbol / account for isolation
  const matching = lots
    .filter(l => l.symbol === symbol && l.accountId === accountId)
    .sort((a, b) => new Date(a.purchasedAt).getTime() - new Date(b.purchasedAt).getTime());
  const others = lots.filter(l => !(l.symbol === symbol && l.accountId === accountId));

  let remaining = sharesSold;
  let realizedPnL = 0;
  const updatedMatching: PaperLot[] = [];

  for (const lot of matching) {
    if (remaining <= 0) {
      updatedMatching.push(lot);
      continue;
    }
    const consumed = Math.min(lot.shares, remaining);
    realizedPnL += consumed * (fillPrice - lot.cost);
    remaining -= consumed;
    const leftover = lot.shares - consumed;
    if (leftover > 0.0001) {
      updatedMatching.push({ ...lot, shares: leftover });
    }
  }

  return { realizedPnL, updatedLots: [...others, ...updatedMatching] };
}

// ── T+2 settlement ────────────────────────────────────────────────────────
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

  const accountPositions = positions.filter(p => p.accountId === account.id);
  let totalCredit = 0;
  const txns: PaperTransaction[] = [];

  for (const pos of accountPositions) {
    const price = quotes[pos.symbol]?.price ?? pos.avgCost;
    let annual = 0;
    if ((pos.dividendRate ?? 0) > 0) {
      annual = pos.shares * pos.dividendRate!;
    } else if (pos.dividendYield > 0) {
      const y = pos.dividendYield > 0.5 ? pos.dividendYield / 100 : pos.dividendYield;
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
export function checkRisk(args: {
  side: 'buy' | 'sell';
  shares: number;
  orderType: PaperOrder['orderType'];
  limitPrice?: number;
  symbol: string;
  currentPrice: number;
  account: PaperAccount;
  accountPositions: PaperPosition[];
  quotes: Record<string, Pick<LiveQuote, 'price'>>;
}): string | null {
  const {
    side, shares, orderType, limitPrice,
    symbol, currentPrice,
    account, accountPositions, quotes,
  } = args;

  // Estimate worst-case cost / proceeds for the risk check
  const estimatedPrice =
    orderType === 'limit' && limitPrice ? limitPrice : currentPrice;

  if (side === 'buy') {
    const cost = shares * estimatedPrice;
    if (cost > account.cash) {
      return `Insufficient buying power. Need ${fmt(cost)}, have ${fmt(account.cash)}.`;
    }
    // Max position size: 40 % of total portfolio value
    const portfolioValue =
      account.cash +
      (account.unsettledCash ?? 0) +
      accountPositions.reduce(
        (s, p) => s + p.shares * (quotes[p.symbol]?.price ?? p.avgCost),
        0,
      );
    const existingPos = accountPositions.find(p => p.symbol === symbol);
    const existingValue = existingPos
      ? existingPos.shares * (quotes[symbol]?.price ?? existingPos.avgCost)
      : 0;
    const newPositionValue = existingValue + cost;
    if (portfolioValue > 0 && newPositionValue / portfolioValue > MAX_POSITION_FRACTION) {
      const pct = ((newPositionValue / portfolioValue) * 100).toFixed(0);
      return `This would put ${pct}% of your portfolio in ${symbol} (max 40%).`;
    }
  } else {
    const pos = accountPositions.find(p => p.symbol === symbol);
    if (!pos || pos.shares < shares) {
      return `You only hold ${pos?.shares ?? 0} shares of ${symbol}.`;
    }
  }
  return null;
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
 * For sells, proceeds are placed in `unsettledItems` with a 2-day
 * settlement date rather than being credited to cash immediately.
 *
 * Returns `{ ok: false, reason }` when execution-time constraints cannot be
 * satisfied (insufficient cash for a buy; no available shares for a sell),
 * so callers never end up with negative cash or phantom SELL transactions.
 */
export function fillOrder(args: {
  order: PaperOrder;
  fillPrice: number;
  filledAt: string;
  account: PaperAccount;
  positions: PaperPosition[];
  lots: PaperLot[];
  uid: () => string;
}): FillOrderResult {
  const { order, fillPrice, filledAt, account, positions, lots, uid } = args;
  const { accountId, symbol, companyName, shares, side } = order;

  let updatedAccount = { ...account };
  let updatedPositions = [...positions];
  let updatedLots = [...lots];
  let newTransaction: PaperTransaction;

  if (side === 'buy') {
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
    const existing = updatedPositions.find(
      p => p.symbol === symbol && p.accountId === accountId,
    );
    if (existing) {
      const totalShares = existing.shares + shares;
      const newAvg = (existing.shares * existing.avgCost + shares * fillPrice) / totalShares;
      updatedPositions = updatedPositions.map(p =>
        p.id === existing.id ? { ...p, shares: totalShares, avgCost: newAvg } : p,
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
          openedAt: filledAt,
          dividendYield: 0,
          dividendRate: 0,
          expenseRatio: 0,
          sector: '',
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
  } else {
    // SELL — execution-time share-availability guard
    const pos = updatedPositions.find(
      p => p.symbol === symbol && p.accountId === accountId,
    );
    if (!pos || pos.shares < shares - 0.0001) {
      return {
        ok: false,
        reason: `Insufficient shares at fill time: need ${shares}, hold ${pos?.shares ?? 0} of ${symbol}.`,
      };
    }

    const fee = fundFee(
      shares * pos.avgCost,
      pos.expenseRatio,
      pos.openedAt,
      filledAt,
    );
    const total = shares * fillPrice;
    const proceeds = total - fee; // net of fund fee

    // FIFO P&L
    const { realizedPnL, updatedLots: afterSellLots } = fifoSell(
      lots, accountId, symbol, shares, fillPrice,
    );
    updatedLots = afterSellLots;

    // T+2 settlement — proceeds go into unsettledItems instead of cash
    const settlesAt = new Date(new Date(filledAt).getTime() + SETTLEMENT_DELAY_MS).toISOString();
    const existingItems = updatedAccount.unsettledItems ?? [];
    const newItem: UnsettledItem = { amount: proceeds, settlesAt };
    updatedAccount = {
      ...updatedAccount,
      unsettledCash: (updatedAccount.unsettledCash ?? 0) + proceeds,
      unsettledItems: [...existingItems, newItem],
    };

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
