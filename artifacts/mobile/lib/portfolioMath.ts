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
  avgCost: number;
  holdDays: number;
  gross: number;
  fee: number;
  net: number;
  isWin: boolean;
}

/** A sell whose requested shares could not all be matched to prior buys. */
export interface UnmatchedSell {
  sellId: string;
  symbol: string;
  date: string;
  requestedShares: number;
  matchedShares: number;
  unmatchedShares: number;
}

export interface TradeReconciliation {
  closedTrades: ClosedTrade[];
  unmatchedSells: UnmatchedSell[];
}

/** Win threshold: a sell counts as a win when net (after-fee) P&L ≥ this. */
export const WIN_THRESHOLD = 0.01;

// ── Positions ────────────────────────────────────────────────────────────────
type OpenLot = {
  shares: number;
  pricePerShare: number;
  purchasedAtMs: number;
};

type MatchedSell = {
  shares: number;
  unmatchedShares: number;
  cost: number;
  weightedPurchaseMs: number;
  gross: number;
  fee: number;
};

function sortTradesChronologically(trades: Trade[]): Trade[] {
  return trades
    .map((trade, index) => ({ trade, index }))
    .sort((a, b) => {
      const timeDiff = new Date(a.trade.date).getTime() - new Date(b.trade.date).getTime();
      return timeDiff !== 0 ? timeDiff : a.index - b.index;
    })
    .map(({ trade }) => trade);
}

function consumeFifoLots(
  lots: OpenLot[],
  sell: Trade,
  expenseRatio = 0,
): MatchedSell {
  let remaining = sell.shares;
  let shares = 0;
  let cost = 0;
  let weightedPurchaseMs = 0;
  let gross = 0;
  let fee = 0;
  const sellMs = new Date(sell.date).getTime();

  while (remaining > 0.0001 && lots.length > 0) {
    const lot = lots[0]!;
    const consumed = Math.min(lot.shares, remaining);
    const consumedCost = consumed * lot.pricePerShare;
    const daysHeld = Math.max(0, (sellMs - lot.purchasedAtMs) / 86_400_000);

    shares += consumed;
    cost += consumedCost;
    weightedPurchaseMs += consumed * lot.purchasedAtMs;
    gross += consumed * (sell.pricePerShare - lot.pricePerShare);
    if (expenseRatio > 0) {
      fee += consumedCost * expenseRatio * (daysHeld / 365);
    }

    lot.shares -= consumed;
    remaining -= consumed;
    if (lot.shares <= 0.0001) lots.shift();
  }

  return {
    shares,
    unmatchedShares: remaining > 0.0001 ? remaining : 0,
    cost,
    weightedPurchaseMs,
    gross,
    fee,
  };
}

export function computePositions(trades: Trade[], quotes: Record<string, Quote | null>): Position[] {
  const bySymbol: Record<string, Trade[]> = {};
  for (const t of trades) {
    if (!bySymbol[t.symbol]) bySymbol[t.symbol] = [];
    bySymbol[t.symbol].push(t);
  }
  return Object.entries(bySymbol).map(([symbol, sysTrades]) => {
    const sorted = sortTradesChronologically(sysTrades);
    let buyShares = 0, sellShares = 0, sellTotal = 0;
    let realizedPnL = 0;
    const lots: OpenLot[] = [];
    for (const t of sorted) {
      if (t.type === 'buy') {
        buyShares += t.shares;
        lots.push({
          shares: t.shares,
          pricePerShare: t.pricePerShare,
          purchasedAtMs: new Date(t.date).getTime(),
        });
      } else if (t.type === 'sell') {
        sellShares += t.shares;
        sellTotal += t.shares * t.pricePerShare;
        realizedPnL += consumeFifoLots(lots, t).gross;
      }
    }
    const netShares = lots.reduce((sum, lot) => sum + lot.shares, 0);
    const openCost = lots.reduce((sum, lot) => sum + lot.shares * lot.pricePerShare, 0);
    const avgCost = netShares > 0 ? openCost / netShares : 0;
    const avgSellPrice = sellShares > 0 ? sellTotal / sellShares : 0;
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
 * Each sell consumes the oldest remaining buy lots. The fee accrues separately
 * for every consumed lot over its actual holding period:
 *   fee = (shares × avgCost) × expenseRatio × (daysHeld ÷ 365)
 * Net P&L = gross P&L − fee; a win is net profit of $0.01 or more.
 */
export function computeTradeReconciliation(
  trades: Trade[],
  quotes: Record<string, Quote | null>,
): TradeReconciliation {
  const closedTrades: ClosedTrade[] = [];
  const unmatchedSells: UnmatchedSell[] = [];
  const lotsBySymbol: Record<string, OpenLot[]> = {};

  for (const trade of sortTradesChronologically(trades)) {
    if (trade.type === 'dividend') continue;
    const lots = lotsBySymbol[trade.symbol] ?? (lotsBySymbol[trade.symbol] = []);
    if (trade.type === 'buy') {
      lots.push({
        shares: trade.shares,
        pricePerShare: trade.pricePerShare,
        purchasedAtMs: new Date(trade.date).getTime(),
      });
      continue;
    }

    const matched = consumeFifoLots(lots, trade, quotes[trade.symbol]?.expenseRatio ?? 0);
    if (matched.shares > 0) {
      const avgCost = matched.cost / matched.shares;
      const weightedBuyMs = matched.weightedPurchaseMs / matched.shares;
      const holdDays = Math.max(
        0,
        Math.floor((new Date(trade.date).getTime() - weightedBuyMs) / 86_400_000),
      );
      const net = matched.gross - matched.fee;
      closedTrades.push({
        sellId: trade.id,
        symbol: trade.symbol,
        shares: matched.shares,
        avgCost,
        holdDays,
        gross: matched.gross,
        fee: matched.fee,
        net,
        isWin: net >= WIN_THRESHOLD,
      });
    }
    if (matched.unmatchedShares > 0) {
      unmatchedSells.push({
        sellId: trade.id,
        symbol: trade.symbol,
        date: trade.date,
        requestedShares: trade.shares,
        matchedShares: matched.shares,
        unmatchedShares: matched.unmatchedShares,
      });
    }
  }
  return { closedTrades, unmatchedSells };
}

export function computeClosedTrades(trades: Trade[], quotes: Record<string, Quote | null>): ClosedTrade[] {
  return computeTradeReconciliation(trades, quotes).closedTrades;
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
