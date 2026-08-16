/**
 * Pure portfolio math — positions, per-sell closed trades (with prorated fund
 * fees), and the trade summary (realized P&L, fees, win rate). Free of
 * React/React-Native imports so it can be unit-tested deterministically and
 * reused by the portfolio screen.
 */

// ── Types ──────────────────────────────────────────────────────────────────
export interface Trade {
  id: string;
  symbol: string;
  type: 'buy' | 'sell' | 'dividend';
  shares: number;
  pricePerShare: number;
  date: string;
}

export interface Quote {
  currentPrice: number;
  priceChange: number;
  priceChangePercent: number;
  /** Annual fund expense ratio as a decimal fraction (e.g. 0.0003 for VOO);
   *  null/absent for individual stocks that report no expense ratio. */
  expenseRatio?: number | null;
}

export interface Position {
  symbol: string;
  netShares: number;
  avgCost: number;
  avgSellPrice: number;
  totalBuyShares: number;
  totalSellShares: number;
  realizedPnL: number;
  unrealizedPnL: number;
  marketValue: number;
  costBasis: number;
  currentPrice: number | null;
  pctChange: number | null;
  expenseRatio: number;
  trades: Trade[];
}

/** A single closing (sell) trade, with fund fee applied. */
export interface ClosedTrade {
  sellId: string;
  symbol: string;
  shares: number;
  gross: number;
  fee: number;
  net: number;
  isWin: boolean;
}

/** Win threshold: a sell counts as a win when net (after-fee) P&L ≥ this. */
export const WIN_THRESHOLD = 0.01;

// ── Positions ────────────────────────────────────────────────────────────────
export function computePositions(trades: Trade[], quotes: Record<string, Quote | null>): Position[] {
  const bySymbol: Record<string, Trade[]> = {};
  for (const t of trades) {
    if (!bySymbol[t.symbol]) bySymbol[t.symbol] = [];
    bySymbol[t.symbol].push(t);
  }
  return Object.entries(bySymbol).map(([symbol, sysTrades]) => {
    const sorted = [...sysTrades].sort(
      (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
    );
    let buyShares = 0, buyTotal = 0, sellShares = 0, sellTotal = 0;
    for (const t of sorted) {
      if (t.type === 'buy') { buyShares += t.shares; buyTotal += t.shares * t.pricePerShare; }
      else if (t.type === 'sell') { sellShares += t.shares; sellTotal += t.shares * t.pricePerShare; }
    }
    const netShares = buyShares - sellShares;
    const avgCost = buyShares > 0 ? buyTotal / buyShares : 0;
    const avgSellPrice = sellShares > 0 ? sellTotal / sellShares : 0;
    const realizedPnL = sellShares > 0 ? sellShares * (avgSellPrice - avgCost) : 0;
    const q = quotes[symbol];
    const currentPrice = q?.currentPrice ?? null;
    const costBasis = netShares * avgCost;
    const marketValue = currentPrice != null ? netShares * currentPrice : 0;
    const unrealizedPnL = currentPrice != null ? netShares * (currentPrice - avgCost) : 0;
    const pctChange = avgCost > 0 && currentPrice != null
      ? ((currentPrice - avgCost) / avgCost) * 100 : null;
    const expenseRatio = q?.expenseRatio ?? 0;
    return { symbol, netShares, avgCost, avgSellPrice, totalBuyShares: buyShares,
      totalSellShares: sellShares, realizedPnL, unrealizedPnL, marketValue,
      costBasis, currentPrice, pctChange, expenseRatio, trades: sorted.filter(t => t.type !== 'dividend') };
  });
}

// ── Closed trades ────────────────────────────────────────────────────────────
/**
 * Break trade history into individual closing (sell) trades, applying a
 * prorated fund fee to each. Each sell is evaluated on its own — a partial
 * close counts as one closed trade — so the win rate reflects every sell,
 * not just fully-closed positions.
 *
 * For each sell we use the volume-weighted average cost AND volume-weighted
 * buy date of the buys made on/before that sell. The fee accrues the annual
 * expense ratio over that holding period on the cost basis of the shares sold:
 *   fee = (shares × avgCost) × expenseRatio × (daysHeld ÷ 365)
 * Net P&L = gross P&L − fee; a win is net profit of $0.01 or more.
 */
export function computeClosedTrades(trades: Trade[], quotes: Record<string, Quote | null>): ClosedTrade[] {
  const result: ClosedTrade[] = [];
  for (const sell of trades) {
    if (sell.type !== 'sell') continue;
    const sellDate = new Date(sell.date);
    const priorBuys = trades.filter(
      t => t.symbol === sell.symbol && t.type === 'buy'
        && t.id !== sell.id
        && new Date(t.date) <= sellDate,
    );
    const totalBuyShares = priorBuys.reduce((s, t) => s + t.shares, 0);
    if (totalBuyShares <= 0) continue;
    const avgCost = priorBuys.reduce((s, t) => s + t.shares * t.pricePerShare, 0) / totalBuyShares;
    const weightedBuyMs = priorBuys.reduce((s, t) => s + t.shares * new Date(t.date).getTime(), 0) / totalBuyShares;
    const days = Math.max(0, (sellDate.getTime() - weightedBuyMs) / 86_400_000);
    const expenseRatio = quotes[sell.symbol]?.expenseRatio ?? 0;
    const gross = (sell.pricePerShare - avgCost) * sell.shares;
    const value = sell.shares * avgCost;
    const fee = expenseRatio > 0 && value > 0 ? value * expenseRatio * (days / 365) : 0;
    const net = gross - fee;
    result.push({ sellId: sell.id, symbol: sell.symbol, shares: sell.shares, gross, fee, net, isWin: net >= WIN_THRESHOLD });
  }
  return result;
}

export function availableToSell(symbol: string, trades: Trade[], excludeId?: string): number {
  return trades
    .filter(t => t.symbol === symbol && t.id !== excludeId)
    .reduce((n, t) => (
      t.type === 'buy' ? n + t.shares
        : t.type === 'sell' ? n - t.shares
          : n
    ), 0);
}

/** Sum cash dividends recorded in the portfolio history. */
export function computeDividendTotal(trades: Trade[]): number {
  return trades
    .filter(t => t.type === 'dividend')
    .reduce((sum, t) => sum + t.shares * t.pricePerShare, 0);
}

// ── Trade summary (SummaryCard) ────────────────────────────────────────────────
/**
 * Aggregate closing trades into the portfolio summary metrics: net realized
 * P&L, total fund fees, and win rate. `winRate` is a rounded 0–100 percentage,
 * or null when there are no closed trades.
 */
export function computeTradeSummary(closedTrades: ClosedTrade[]): {
  totalReal: number;
  totalFees: number;
  wins: number;
  totalClosed: number;
  winRate: number | null;
} {
  const totalReal = closedTrades.reduce((s, c) => s + c.net, 0);
  const totalFees = closedTrades.reduce((s, c) => s + c.fee, 0);
  const wins = closedTrades.filter(c => c.isWin).length;
  const totalClosed = closedTrades.length;
  const winRate = totalClosed > 0 ? Math.round((wins / totalClosed) * 100) : null;
  return { totalReal, totalFees, wins, totalClosed, winRate };
}
