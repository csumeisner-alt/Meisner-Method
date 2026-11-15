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
  /** Restricted proceeds and margin reserved for open short positions. */
  shortCollateral?: number;
  /** Simulated collateral as a multiple of short-sale proceeds. Defaults to 150%. */
  shortCollateralRatio?: number;
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
  /** Missing means long for backward compatibility with saved positions. */
  positionType?: 'long' | 'short';
  /** Provider-verified stock/ETF classification; absent on legacy records. */
  assetType?: 'stock' | 'etf' | 'unknown';
  /** Restricted collateral held per short share, weighted across entries. */
  collateralPerShare?: number;
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
  action: 'BUY' | 'SELL' | 'SHORT_SELL' | 'BUY_TO_COVER' | 'DIVIDEND';
  shares: number;
  price: number;
  total: number;
  date: string;
  /** Gross realized P&L (before fund fees). Net = realizedPnL - fee. */
  realizedPnL?: number;
  /** Fund fee charged on this closing trade (0 for non-fund symbols). */
  fee?: number;
  /** Explicit cash/collateral movements for reproducible short-side history. */
  cashDelta?: number;
  shortCollateralDelta?: number;
};

export type LiveQuote = {
  price: number;
  change: number;
  pct: number;
  /** Provider quote timestamp, in Unix seconds. */
  priceTimestamp?: number | null;
  /** Provider-reported market state, for example REGULAR, CLOSED, or PRE. */
  marketSession?: string;
  /** Provider price source, such as regular, premarket, or previous_close. */
  priceSource?: string;
  /** Local time the app received the provider response, in Unix milliseconds. */
  fetchedAtMs?: number;
};

export type PaperAccountValueSnapshot = {
  accountId: string;
  date: string;
  value: number;
};

/**
 * Return dividend yield as a decimal fraction (0.0043 = 0.43%).
 *
 * The market-data provider has returned this field both as a decimal fraction
 * and as a percent-like number. A declared annual dividend plus the current
 * price disambiguates the two formats for saved positions and live lookups.
 */
export function normalizeDividendYield(
  raw: number | null | undefined,
  dividendRate?: number | null,
  price?: number | null,
): number {
  const value = Number(raw);
  const rate = Number(dividendRate);
  const currentPrice = Number(price);
  const expected = Number.isFinite(rate) && rate > 0 && Number.isFinite(currentPrice) && currentPrice > 0
    ? rate / currentPrice
    : null;

  if (!Number.isFinite(value) || value <= 0) return expected ?? 0;

  if (expected != null) {
    const decimalCandidate = value;
    const percentCandidate = value / 100;
    return Math.abs(percentCandidate - expected) < Math.abs(decimalCandidate - expected)
      ? percentCandidate
      : decimalCandidate;
  }

  return value > 0.2 ? value / 100 : value;
}

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
  /** Legacy orders infer intent from side; shorts/covers are explicit. */
  intent?: 'short' | 'cover';
  /** Verified market classification retained while a delayed buy is pending. */
  assetType?: 'stock' | 'etf' | 'unknown';
  /** Human-readable execution rejection saved with a cancelled order. */
  rejectionReason?: string;
  /** Collateral multiple captured for a pending short order. */
  shortCollateralRatio?: number;
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
/** Simulated collateral held per dollar of short-sale proceeds. */
export const DEFAULT_SHORT_COLLATERAL_RATIO = 1.5;

export function isShortPosition(position: Pick<PaperPosition, 'positionType'>): boolean {
  return position.positionType === 'short';
}

/** Equity = cash + unsettled + collateral + longs − short liabilities. */
export function computePaperEquity(
  account: PaperAccount,
  positions: PaperPosition[],
  quotes: Record<string, Pick<LiveQuote, 'price'>>,
): number {
  return account.cash
    + (account.unsettledCash ?? 0)
    + (account.shortCollateral ?? 0)
    + positions
      .filter((position) => position.accountId === account.id)
      .reduce((total, position) => {
        const price = quotes[position.symbol]?.price ?? position.avgCost;
        const value = position.shares * price;
        return total + (isShortPosition(position) ? -value : value);
      }, 0);
}

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
  const sells = txns.filter(t => t.action === 'SELL' || t.action === 'BUY_TO_COVER');
  const wins = sells.filter(isWinningSell).length;
  const total = sells.length;
  const losses = total - wins;
  return { wins, losses, total, rate: total > 0 ? (wins / total) * 100 : null };
}

/** Sum of net (after-fee) realized P&L across all SELL transactions. */
export function computeRealizedPnL(txns: PaperTransaction[]): number {
  return txns
    .filter(t => t.action === 'SELL' || t.action === 'BUY_TO_COVER')
    .reduce((s, t) => s + sellNetPnL(t), 0);
}

// ── Saved account value snapshots ─────────────────────────────────────────────
export function parseAccountValueSnapshots(value: unknown): PaperAccountValueSnapshot[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is PaperAccountValueSnapshot =>
    !!item
    && typeof item === 'object'
    && typeof item.accountId === 'string'
    && item.accountId.length > 0
    && typeof item.date === 'string'
    && Number.isFinite(new Date(item.date).getTime())
    && typeof item.value === 'number'
    && Number.isFinite(item.value),
  ).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
}

/** Return null instead of estimating equity when any held position lacks a live quote. */
export function createAccountValueSnapshot(
  accountId: string,
  accounts: PaperAccount[],
  positions: PaperPosition[],
  quotes: Record<string, LiveQuote>,
  date: string = new Date().toISOString(),
): PaperAccountValueSnapshot | null {
  const account = accounts.find((item) => item.id === accountId);
  const timestamp = new Date(date).getTime();
  if (!account || !Number.isFinite(timestamp) || !Number.isFinite(account.cash)) return null;

  const accountPositions = positions.filter((position) =>
    position.accountId === accountId && position.shares > 0,
  );
  let positionValue = 0;
  for (const position of accountPositions) {
    const price = quotes[position.symbol]?.price;
    if (!Number.isFinite(price) || price <= 0) return null;
    positionValue += (isShortPosition(position) ? -1 : 1) * position.shares * price;
  }
  const value = account.cash + (account.unsettledCash ?? 0)
    + (account.shortCollateral ?? 0) + positionValue;
  if (!Number.isFinite(value)) return null;
  return { accountId, date: new Date(timestamp).toISOString(), value };
}

/** Append or refresh one account's latest sample, retaining enough for a full year. */
export function upsertAccountValueSnapshot(
  snapshots: PaperAccountValueSnapshot[],
  snapshot: PaperAccountValueSnapshot,
  minimumIntervalMs: number,
  nowMs: number = new Date(snapshot.date).getTime(),
): PaperAccountValueSnapshot[] {
  const timestamp = new Date(snapshot.date).getTime();
  if (!snapshot.accountId || !Number.isFinite(timestamp) || !Number.isFinite(snapshot.value)) return snapshots;
  const sameAccount = snapshots
    .filter((item) => item.accountId === snapshot.accountId)
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  const latest = sameAccount[sameAccount.length - 1];
  if (latest && timestamp - new Date(latest.date).getTime() < minimumIntervalMs) return snapshots;
  const next = [...snapshots, snapshot];
  const retentionCutoff = nowMs - 400 * 86_400_000;
  return next
    .filter((item) => new Date(item.date).getTime() >= retentionCutoff)
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
}

export function removeAccountValueSnapshots(
  snapshots: PaperAccountValueSnapshot[],
  accountId: string,
): PaperAccountValueSnapshot[] {
  return snapshots.filter((item) => item.accountId !== accountId);
}

/** Return snapshot-only chart points when saved observations cover the window. */
export function getCoveredAccountValueHistory(
  snapshots: PaperAccountValueSnapshot[],
  accountId: string,
  rangeMs: number,
  nowMs: number = Date.now(),
  maximumSampleAgeMs: number = 30 * 60_000,
): { date: string; value: number }[] {
  const cutoff = nowMs - rangeMs;
  const points = snapshots
    .filter((item) => item.accountId === accountId)
    .filter((item) => {
      const timestamp = new Date(item.date).getTime();
      return Number.isFinite(timestamp) && timestamp <= nowMs && Number.isFinite(item.value);
    })
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  if (points.length < 2) return [];

  const latest = points[points.length - 1];
  if (new Date(latest.date).getTime() < nowMs - maximumSampleAgeMs) return [];
  if (new Date(points[0].date).getTime() > cutoff) return [];

  const inRange = points.filter((item) => new Date(item.date).getTime() >= cutoff);
  if (inRange.length < 2) return [];
  const beforeRange = points.filter((item) => new Date(item.date).getTime() < cutoff);
  const anchor = beforeRange[beforeRange.length - 1];
  return [...(anchor ? [anchor] : []), ...inRange].map(({ date, value }) => ({ date, value }));
}

/** Combine persisted samples with legacy transaction-derived values for ALL. */
export function mergeAccountValueHistory(
  tradeHistory: { date: string; value: number }[],
  snapshots: PaperAccountValueSnapshot[],
  accountId: string,
): { date: string; value: number }[] {
  const byDate = new Map(tradeHistory.map((point) => [point.date, point]));
  for (const snapshot of snapshots) {
    if (snapshot.accountId === accountId && Number.isFinite(snapshot.value)) {
      byDate.set(snapshot.date, { date: snapshot.date, value: snapshot.value });
    }
  }
  return [...byDate.values()].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
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
  const posMap: Record<string, {
    shares: number;
    avgCost: number;
    lastPrice: number;
    positionType?: 'long' | 'short';
    collateral?: number;
  }> = {};

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
    } else if (tx.action === 'SELL') {
      // SELL: credit proceeds net of the fund fee, mirroring the live cash update.
      cash += tx.total - (tx.fee ?? 0);
      if (posMap[tx.symbol]) {
        posMap[tx.symbol].shares -= tx.shares;
        posMap[tx.symbol].lastPrice = tx.price;
        if (posMap[tx.symbol].shares <= 0) delete posMap[tx.symbol];
      }
    } else if (tx.action === 'SHORT_SELL') {
      cash += tx.cashDelta ?? 0;
      if (!posMap[tx.symbol]) {
        posMap[tx.symbol] = {
          shares: tx.shares,
          avgCost: tx.price,
          lastPrice: tx.price,
          positionType: 'short',
        };
      } else {
        const p = posMap[tx.symbol];
        const total = p.shares + tx.shares;
        p.avgCost = (p.shares * p.avgCost + tx.shares * tx.price) / total;
        p.shares = total;
        p.lastPrice = tx.price;
      }
      posMap[tx.symbol].collateral = (posMap[tx.symbol].collateral ?? 0)
        + (tx.shortCollateralDelta ?? tx.total * DEFAULT_SHORT_COLLATERAL_RATIO);
    } else if (tx.action === 'BUY_TO_COVER') {
      cash += tx.cashDelta ?? 0;
      if (posMap[tx.symbol]) {
        posMap[tx.symbol].shares -= tx.shares;
        posMap[tx.symbol].lastPrice = tx.price;
        posMap[tx.symbol].collateral = Math.max(
          0,
          (posMap[tx.symbol].collateral ?? 0) - (tx.shortCollateralDelta ?? 0),
        );
        if (posMap[tx.symbol].shares <= 0.0001) delete posMap[tx.symbol];
      }
    }
    const shortCollateral = Object.values(posMap).reduce(
      (sum, position) => sum + (position.positionType === 'short' ? position.collateral ?? 0 : 0), 0,
    );
    const posValue = Object.values(posMap).reduce(
      (s, p) => s + (p.positionType === 'short' ? -p.shares * p.lastPrice : p.shares * p.lastPrice), 0,
    );
    points.push({ date: tx.date, value: cash + shortCollateral + posValue });
  }

  const livePosValue = currentPositions.reduce(
    (s, p) => s + (isShortPosition(p) ? -1 : 1) * p.shares * (quotes[p.symbol]?.price ?? p.avgCost), 0,
  );
  points.push({
    date: now,
    value: currentCash + (account.shortCollateral ?? 0) + livePosValue,
  });
  return points;
}
