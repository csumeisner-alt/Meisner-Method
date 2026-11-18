const oneStockEntries = [
  {
    rank: 1,
    alias: 'Copper Bull',
    participantToken: 'fixture-first',
    startEquity: 100_000,
    equity: 112_400,
    profitLoss: 12_400,
    returnPercent: 12.4,
    cashBalance: 5_325.75,
    tradeCount: 6,
    holdings: [{ symbol: 'VERYLONGTICKER', companyName: 'Example Holdings', allocationPercent: 95, marketValue: 107_074.25, assetType: 'stock' as const, side: 'long' as const }],
    updatedAt: '2026-11-16T12:00:00.000Z',
    isCurrentUser: false,
  },
  {
    rank: 2,
    alias: 'Penny Pilot',
    participantToken: 'fixture-second',
    startEquity: 100_000,
    equity: 108_100,
    profitLoss: 8_100,
    returnPercent: 8.1,
    cashBalance: 108_100,
    tradeCount: 0,
    holdings: [],
    updatedAt: '2026-11-16T12:00:00.000Z',
    isCurrentUser: false,
  },
  {
    rank: 3,
    alias: 'Green Candle',
    participantToken: 'fixture-third',
    startEquity: 100_000,
    equity: 104_600,
    profitLoss: 4_600,
    returnPercent: 4.6,
    cashBalance: 4_600,
    tradeCount: 3,
    holdings: [{ symbol: 'XYZ', companyName: 'XYZ Inc.', allocationPercent: 96, marketValue: 100_000, assetType: 'stock' as const, side: 'long' as const }],
    updatedAt: '2026-11-16T12:00:00.000Z',
    isCurrentUser: false,
  },
];
const entries = [
  {
    rank: 1,
    alias: 'Copper Bull',
    participantToken: 'fixture-first',
    startEquity: 100_000,
    equity: 112_400,
    profitLoss: 12_400,
    returnPercent: 12.4,
    tradeCount: 6,
    holdings: [],
    updatedAt: '2026-11-16T12:00:00.000Z',
    isCurrentUser: false,
  },
  {
    rank: 2,
    alias: 'Penny Pilot',
    participantToken: 'fixture-second',
    startEquity: 100_000,
    equity: 108_100,
    profitLoss: 8_100,
    returnPercent: 8.1,
    tradeCount: 4,
    holdings: [],
    updatedAt: '2026-11-16T12:00:00.000Z',
    isCurrentUser: false,
  },
  {
    rank: 3,
    alias: 'Green Candle',
    participantToken: 'fixture-third',
    startEquity: 100_000,
    equity: 104_600,
    profitLoss: 4_600,
    returnPercent: 4.6,
    tradeCount: 3,
    holdings: [],
    updatedAt: '2026-11-16T12:00:00.000Z',
    isCurrentUser: false,
  },
];
const response = { entries, updatedAt: '2026-11-16T12:00:00.000Z' };
const dataUpdatedAt = Date.now();

export function getGetEventArenaLeaderboardQueryKey(eventId: string) {
  return ['event-arena-leaderboard', eventId];
}

export function useGetEventArenaLeaderboard(eventId: string) {
  const responseEntries = eventId.includes('one-stock') ? oneStockEntries : entries;
  const response = { entries: responseEntries, updatedAt: '2026-11-16T12:00:00.000Z' };
  return {
    data: response,
    dataUpdatedAt,
    isLoading: false,
    error: null,
    refetch: async () => ({ data: response }),
  };
}

export async function submitEventArenaScore() {}
