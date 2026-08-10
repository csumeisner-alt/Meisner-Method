/**
 * Pure paper-trading math — fund fees, sell settlement, reconstructed value
 * history, and win-rate. Kept free of React/React-Native imports so it can be
 * unit-tested deterministically and reused by the paper trading screen.
 */

// ── Types ──────────────────────────────────────────────────────────────────

/** A scheduled settlement event: cash from a sell that hasn't cleared yet. */
export type UnsettledItem = {
  amount: number;
  settlesAt: string; // ISO — 2 calendar days after the sell
};

export type PaperAccount = {
  id: string;
  name: string;
  /** Settled buying power (available for new buys). */
  cash: number;
  /** Sum of unsettled sell proceeds (display only — updated by settleCash). */
  unsettledCash?: number;
  /** Individual T+2 settlement buckets. Serialised to DB via unsettled_items JSON column. */
  unsettledItems?: UnsettledItem[];
  /** ISO date of the last monthly dividend credit so we don't double-credit. */
  lastDividendCredit?: string;
  createdAt: string;
};

export type PaperPosition = {
  id: string;
  accountId: string;
  symbol: string;
  companyName: string;
  shares: number;
  avgCost: number;
  openedAt: string;
  dividendYield: number;
  /** Declared annual dividend per share in dollars (e.g. 0.83 for WMT).
   *  Optional so existing DB-loaded positions without this field still work. */
  dividendRate?: number;
  /** Annual fund expense ratio as a decimal fraction (e.g. 0.0003 for VOO).
   *  Optional/0 for individual stocks and older positions — those pay no fee. */
  expenseRatio?: number;
  sector: string;
};

export type PaperTransaction = {
  id: string;
  accountId: string;
  symbol: string;
  companyName: string;
  action: 'BUY' | 'SELL' | 'DIVIDEND';
  shares: number;
  price: number;
  total: number;
  date: string;
  /** Gross realized P&L (before fund fees). Net = realizedPnL - fee. */
  realizedPnL?: number;
  /** Fund fee charged on this closing trade (0 for non-fund symbols). */
  fee?: number;
};

export type LiveQuote = { price: number; change: number; pct: number };

// ── Order types ────────────────────────────────────────────────────────────

export type OrderType = 'market' | 'limit' | 'stop' | 'stop_limit' | 'trailing_stop';
export type OrderSide = 'buy' | 'sell';
export type OrderStatus = 'pending' | 'filled' | 'cancelled';

export type PaperOrder = {
  id: string;
  accountId: string;
  symbol: string;
  companyName: string;
  orderType: OrderType;
  side: OrderSide;
  shares: number;
  /** For limit and stop-limit orders. */
  limitPrice?: number;
  /** For stop and stop-limit orders. */
  stopPrice?: number;
  /** Trailing % distance (e.g. 5 = 5%). */
  trailPct?: number;
  /** Trailing absolute $ distance. */
  trailAbs?: number;
  /**
   * Current trailing reference price. For sell trailing stops this is the
   * high-water mark; for buy trailing stops this is the low-water mark.
   * Updated on each price poll without changing the order status.
   */
  trailRef?: number;
  /** Buy-side metadata retained until a delayed order fills. */
  dividendYield?: number;
  dividendRate?: number;
  expenseRatio?: number;
  sector?: string;
  status: OrderStatus;
  /** Actual fill price (after slippage). */
  filledPrice?: number;
  placedAt: string;
  filledAt?: string;
};

/** A single purchase lot for FIFO cost-basis tracking. */
export type PaperLot = {
  id: string;
  accountId: string;
  symbol: string;
  /** Shares remaining in this lot (decreases as shares are sold FIFO). */
  shares: number;
  /** Cost per share for this lot. */
  cost: number;
  purchasedAt: string;
};

// ── Constants ──────────────────────────────────────────────────────────────
export const INITIAL_BALANCE = 100_000;

/** Win threshold: a sell counts as a win when net (after-fee) P&L ≥ this. */
export const WIN_THRESHOLD = 0.01;

// ── Fees ─────────────────────────────────────────────────────────────────────
/**
 * Prorated fund fee charged when closing a position. Accrues the annual
 * expense ratio smoothly over the holding period:
 *   fee = value × expenseRatio × (daysHeld ÷ 365)
 * Returns 0 for symbols with no expense ratio (most individual stocks) and
 * for positions opened before this field existed.
 */
export function fundFee(
  value: number,
  expenseRatio: number | undefined,
  openedAt: string,
  soldAt: string,
): number {
  if (!expenseRatio || expenseRatio <= 0 || !value || value <= 0) return 0;
  const days = Math.max(
    0,
    (new Date(soldAt).getTime() - new Date(openedAt).getTime()) / 86_400_000,
  );
  return value * expenseRatio * (days / 365);
}

// ── Sell settlement ──────────────────────────────────────────────────────────
export type SellResult = {
  /** Gross proceeds = shares × price. */
  total: number;
  /** Gross realized P&L before fees = shares × (price − avgCost). */
  realizedPnL: number;
  /** Prorated fund fee on the closed cost basis. */
  fee: number;
  /** Net realized P&L = realizedPnL − fee. */
  net: number;
  /** Cash credited to the account = total − fee. */
  cashDelta: number;
};

/**
 * Settle a (partial or full) close of a position. The fund fee accrues on the
 * cost basis of the shares being closed, prorated over the holding period.
 * Net P&L = gross − fee, and cash is credited net of the fee so that account
 * equity and total-return metrics reflect the fee.
 */
export function computeSellResult(args: {
  position: Pick<PaperPosition, 'avgCost' | 'expenseRatio' | 'openedAt'>;
  shares: number;
  price: number;
  soldAt: string;
}): SellResult {
  const { position, shares, price, soldAt } = args;
  const total = shares * price;
  const realizedPnL = shares * (price - position.avgCost);
  const fee = fundFee(shares * position.avgCost, position.expenseRatio, position.openedAt, soldAt);
  const net = realizedPnL - fee;
  const cashDelta = total - fee;
  return { total, realizedPnL, fee, net, cashDelta };
}

// ── Win rate ─────────────────────────────────────────────────────────────────
/** Net (after-fee) realized P&L of a closing transaction. */
export function sellNetPnL(t: Pick<PaperTransaction, 'realizedPnL' | 'fee'>): number {
  return (t.realizedPnL ?? 0) - (t.fee ?? 0);
}

/** A sell is a win when its net (after-fee) P&L is at least the threshold. */
export function isWinningSell(t: Pick<PaperTransaction, 'realizedPnL' | 'fee'>): boolean {
  return sellNetPnL(t) >= WIN_THRESHOLD;
}

/**
 * Win-rate over every SELL transaction — each sell (including a partial close)
 * counts once toward the denominator. `rate` is a 0–100 percentage, or null
 * when there are no closing trades.
 */
export function computeSellWinRate(txns: PaperTransaction[]): {
  wins: number;
  losses: number;
  total: number;
  rate: number | null;
} {
  const sells = txns.filter(t => t.action === 'SELL');
  const wins = sells.filter(isWinningSell).length;
  const total = sells.length;
  const losses = total - wins;
  return { wins, losses, total, rate: total > 0 ? (wins / total) * 100 : null };
}

/** Sum of net (after-fee) realized P&L across all SELL transactions. */
export function computeRealizedPnL(txns: PaperTransaction[]): number {
  return txns
    .filter(t => t.action === 'SELL')
    .reduce((s, t) => s + sellNetPnL(t), 0);
}

// ── Value history ────────────────────────────────────────────────────────────
/**
 * Reconstruct the account's portfolio value over time from its transaction
 * history. Sells credit proceeds net of the fund fee, mirroring the live cash
 * update, so the reconstructed equity matches the account's live equity.
 */
export function buildValueHistory(
  account: PaperAccount,
  txns: PaperTransaction[],
  currentCash: number,
  currentPositions: PaperPosition[],
  quotes: Record<string, LiveQuote>,
  now: string = new Date().toISOString(),
): { date: string; value: number }[] {
  const sorted = [...txns].sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
  );
  const points: { date: string; value: number }[] = [
    { date: account.createdAt, value: INITIAL_BALANCE },
  ];
  let cash = INITIAL_BALANCE;
  const posMap: Record<string, { shares: number; avgCost: number; lastPrice: number }> = {};

  for (const tx of sorted) {
    if (tx.action === 'DIVIDEND') {
      // Monthly dividend credit — add to cash directly (no position impact)
      cash += tx.total;
    } else if (tx.action === 'BUY') {
      cash -= tx.total;
      if (!posMap[tx.symbol]) {
        posMap[tx.symbol] = { shares: tx.shares, avgCost: tx.price, lastPrice: tx.price };
      } else {
        const p = posMap[tx.symbol];
        const total = p.shares + tx.shares;
        p.avgCost = (p.shares * p.avgCost + tx.shares * tx.price) / total;
        p.shares = total;
        p.lastPrice = tx.price;
      }
    } else {
      // SELL: credit proceeds net of the fund fee, mirroring the live cash update.
      cash += tx.total - (tx.fee ?? 0);
      if (posMap[tx.symbol]) {
        posMap[tx.symbol].shares -= tx.shares;
        posMap[tx.symbol].lastPrice = tx.price;
        if (posMap[tx.symbol].shares <= 0) delete posMap[tx.symbol];
      }
    }
    const posValue = Object.values(posMap).reduce(
      (s, p) => s + p.shares * p.lastPrice, 0,
    );
    points.push({ date: tx.date, value: cash + posValue });
  }

  const livePosValue = currentPositions.reduce(
    (s, p) => s + p.shares * (quotes[p.symbol]?.price ?? p.avgCost), 0,
  );
  points.push({ date: now, value: currentCash + livePosValue });
  return points;
}
