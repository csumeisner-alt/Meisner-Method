export type LightningRoundActivity = {
  symbol: string;
  company_name?: string | null;
  action: string;
  shares: number;
  price: number;
  total: number;
  fee?: number | null;
};

export type LightningRoundScore = {
  startEquity: number;
  equity: number;
  cashBalance: number;
  returnPercent: number;
  tradeCount: number;
  holdings: Array<{
    symbol: string;
    companyName: string;
    allocationPercent: number;
    side: "long";
  }>;
};

/** Build leaderboard values only from fills tagged with this event ID. */
export function calculateLightningRoundScore(
  activity: LightningRoundActivity[],
  prices: Record<string, number>,
  startingBalance: number,
): LightningRoundScore | null {
  if (!Number.isFinite(startingBalance) || startingBalance <= 0) return null;
  const sorted = [...activity].sort((left, right) =>
    String((left as any).date ?? "").localeCompare(String((right as any).date ?? "")),
  );
  const positions = new Map<string, { symbol: string; companyName: string; shares: number; cost: number }>();
  let cashBalance = startingBalance;
  for (const trade of sorted) {
    if (
      typeof trade.symbol !== "string"
      || !/^[A-Z0-9.^=-]{1,15}$/.test(trade.symbol)
      || !Number.isFinite(Number(trade.shares))
      || Number(trade.shares) <= 0
      || !Number.isFinite(Number(trade.price))
      || Number(trade.price) <= 0
      || !Number.isFinite(Number(trade.total))
      || Number(trade.total) < 0
      || !["BUY", "SELL"].includes(trade.action)
      || (trade.fee != null && (!Number.isFinite(Number(trade.fee)) || Number(trade.fee) < 0))
    ) return null;
    const shares = Number(trade.shares);
    const total = Number(trade.total);
    const current = positions.get(trade.symbol);
    if (trade.action === "BUY") {
      cashBalance -= total;
      positions.set(trade.symbol, {
        symbol: trade.symbol,
        companyName: trade.company_name?.trim() || trade.symbol,
        shares: (current?.shares ?? 0) + shares,
        cost: (current?.cost ?? 0) + shares * Number(trade.price),
      });
    } else if (trade.action === "SELL" && current) {
      if (shares > current.shares + 0.0001) return null;
      cashBalance += total - Number(trade.fee ?? 0);
      const remaining = Math.max(0, current.shares - shares);
      if (remaining <= 0.0001) {
        positions.delete(trade.symbol);
      } else {
        positions.set(trade.symbol, {
          ...current,
          shares: remaining,
          cost: current.cost / current.shares * remaining,
        });
      }
    }
  }
  const held = [...positions.values()];
  if (held.some((position) => !Number.isFinite(prices[position.symbol]) || prices[position.symbol] <= 0)) {
    return null;
  }
  const equity = cashBalance + held.reduce(
    (sum, position) => sum + position.shares * prices[position.symbol],
    0,
  );
  if (!Number.isFinite(equity) || equity < 0) return null;
  return {
    startEquity: startingBalance,
    equity,
    cashBalance,
    returnPercent: ((equity - startingBalance) / startingBalance) * 100,
    tradeCount: activity.length,
    holdings: held.map((position) => ({
      symbol: position.symbol,
      companyName: position.companyName,
      allocationPercent: equity > 0 ? position.shares * prices[position.symbol] / equity * 100 : 0,
      side: "long",
    })),
  };
}
