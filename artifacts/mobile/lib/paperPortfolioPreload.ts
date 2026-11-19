import {
  INITIAL_BALANCE,
  computePaperEquity,
  computeRealizedPnL,
  computeSellWinRate,
  isShortPosition,
  type LiveQuote,
  type PaperAccount,
  type PaperPosition,
  type PaperTransaction,
} from './paperMath.ts';
import { isPaperChallengeAccountId } from './paperChallenge.ts';
import type { PaperQuoteRequest } from './paperQuoteRefresh.ts';
import type { StoredPaperCache } from './paperCache.ts';
import { createPaperQuoteRequestCache } from './paperQuoteRefresh.ts';

export const PAPER_PORTFOLIO_PRELOAD_KEY = '@stocksense/paper_portfolio_preload_v1';
export const PAPER_QUOTE_CACHE_KEY = '@stocksense/paper_quotes_v1';

export type PaperPortfolioPreloadSummary = {
  account: PaperAccount;
  positions: PaperPosition[];
  realizedPnL: number;
  performance: {
    trades: number;
    wins: number;
    losses: number;
    winRate: number | null;
  };
};

export type PaperPortfolioPreloadMetrics = PaperPortfolioPreloadSummary & {
  equity: number;
  buyingPower: number;
  marketValue: number;
  unrealizedPnL: number;
  totalReturn: number;
  totalReturnPct: number;
};

export type PaperPortfolioPreloadState = {
  portfolios: PaperPortfolioPreloadMetrics[];
  quotes: Record<string, LiveQuote>;
};

export type PaperPortfolioPreloadStorage = {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<unknown>;
};

export type PaperPortfolioPreloadCache = {
  version: 1;
  updatedAt: string;
  portfolios: PaperPortfolioPreloadSummary[];
};

const isValidQuote = (quote: unknown): quote is LiveQuote =>
  !!quote
  && typeof quote === 'object'
  && !Array.isArray(quote)
  && Number.isFinite((quote as LiveQuote).price)
  && (quote as LiveQuote).price > 0;

function normalizeQuote(quote: LiveQuote): LiveQuote {
  return {
    ...quote,
    change: Number.isFinite(quote.change) ? quote.change : 0,
    pct: Number.isFinite(quote.pct) ? quote.pct : 0,
  };
}

export function buildPaperPortfolioPreloadSummaries(
  cache: Pick<StoredPaperCache, 'accounts' | 'positions' | 'transactions'>,
): PaperPortfolioPreloadSummary[] {
  return cache.accounts
    .filter((account) => !isPaperChallengeAccountId(account.id))
    .slice(0, 3)
    .map((account) => {
      const positions = cache.positions.filter((position) => position.accountId === account.id);
      const transactions = cache.transactions.filter((transaction) => transaction.accountId === account.id);
      const performance = computeSellWinRate(transactions);

      return {
        account: { ...account },
        positions: positions.map((position) => ({ ...position })),
        realizedPnL: computeRealizedPnL(transactions),
        performance: {
          trades: performance.total,
          wins: performance.wins,
          losses: performance.losses,
          winRate: performance.rate,
        },
      };
    });
}

export function createPaperPortfolioPreloadCache(
  portfolios: PaperPortfolioPreloadSummary[],
  updatedAt = new Date().toISOString(),
): PaperPortfolioPreloadCache {
  return { version: 1, updatedAt, portfolios };
}

export function parsePaperPortfolioPreloadCache(
  raw: string | null,
): PaperPortfolioPreloadCache | null {
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    const cache = parsed as Partial<PaperPortfolioPreloadCache>;
    if (
      cache.version !== 1
      || typeof cache.updatedAt !== 'string'
      || !Number.isFinite(Date.parse(cache.updatedAt))
      || !Array.isArray(cache.portfolios)
    ) return null;

    const portfolios = cache.portfolios.filter((item): item is PaperPortfolioPreloadSummary =>
      !!item
      && typeof item === 'object'
      && !!item.account
      && typeof item.account.id === 'string'
      && Array.isArray(item.positions)
      && Number.isFinite(item.realizedPnL)
      && !!item.performance
      && Number.isFinite(item.performance.trades)
      && Number.isFinite(item.performance.wins)
      && Number.isFinite(item.performance.losses)
      && (item.performance.winRate === null || Number.isFinite(item.performance.winRate)),
    );

    return {
      version: 1,
      updatedAt: cache.updatedAt,
      portfolios: portfolios.slice(0, 3),
    };
  } catch {
    return null;
  }
}

export function parsePaperQuoteCache(raw: string | null): Record<string, LiveQuote> {
  if (!raw) return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const quotes: Record<string, LiveQuote> = {};
    for (const [rawSymbol, value] of Object.entries(parsed)) {
      const symbol = rawSymbol.trim().toUpperCase();
      if (!symbol || !isValidQuote(value)) continue;
      const quote = value as LiveQuote;
      quotes[symbol] = normalizeQuote({
        price: quote.price,
        change: quote.change,
        pct: quote.pct,
        priceTimestamp: Number.isFinite(quote.priceTimestamp) ? quote.priceTimestamp : null,
        marketSession: typeof quote.marketSession === 'string' ? quote.marketSession : undefined,
        priceSource: typeof quote.priceSource === 'string' ? quote.priceSource : undefined,
        fetchedAtMs: Number.isFinite(quote.fetchedAtMs) ? quote.fetchedAtMs : 0,
      });
    }
    return quotes;
  } catch {
    return {};
  }
}

export function computePaperPortfolioPreloadMetrics(
  portfolio: PaperPortfolioPreloadSummary,
  quotes: Record<string, LiveQuote>,
): PaperPortfolioPreloadMetrics {
  const { account, positions } = portfolio;
  const equity = computePaperEquity(account, positions, quotes);
  const marketValue = positions.reduce((total, position) => {
    const price = quotes[position.symbol]?.price ?? position.avgCost;
    return total + Math.abs(position.shares * price);
  }, 0);
  const unrealizedPnL = positions.reduce((total, position) => {
    const price = quotes[position.symbol]?.price ?? position.avgCost;
    return total + position.shares * (
      isShortPosition(position) ? position.avgCost - price : price - position.avgCost
    );
  }, 0);
  const totalReturn = equity - INITIAL_BALANCE;

  return {
    ...portfolio,
    equity,
    buyingPower: account.cash,
    marketValue,
    unrealizedPnL,
    totalReturn,
    totalReturnPct: (totalReturn / INITIAL_BALANCE) * 100,
  };
}

export async function preloadPaperPortfolioQuotes(
  portfolios: PaperPortfolioPreloadSummary[],
  cachedQuotes: Record<string, LiveQuote>,
  requestQuote: PaperQuoteRequest,
): Promise<Record<string, LiveQuote>> {
  const symbols = [...new Set(
    portfolios.flatMap((portfolio) => portfolio.positions.map((position) => position.symbol.toUpperCase())),
  )];
  const results = await Promise.allSettled(
    symbols.map(async (symbol) => [symbol, await requestQuote(symbol)] as const),
  );
  const next = { ...cachedQuotes };
  for (const result of results) {
    if (result.status !== 'fulfilled' || !isValidQuote(result.value[1])) continue;
    const [symbol, quote] = result.value;
    next[symbol] = normalizeQuote(quote);
  }
  return next;
}

export function parseLegacyPaperPortfolioCache(
  raw: string | null,
): Pick<StoredPaperCache, 'accounts' | 'positions' | 'transactions'> | null {
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    const value = parsed as Partial<StoredPaperCache>;
    if (
      !Array.isArray(value.accounts)
      || !Array.isArray(value.positions)
      || !Array.isArray(value.transactions)
    ) return null;
    return {
      accounts: value.accounts,
      positions: value.positions,
      transactions: value.transactions,
    };
  } catch {
    return null;
  }
}

let sharedState: PaperPortfolioPreloadState = { portfolios: [], quotes: {} };
const listeners = new Set<(state: PaperPortfolioPreloadState) => void>();

function notifyListeners() {
  for (const listener of listeners) {
    try {
      listener(sharedState);
    } catch {
      // A UI listener must not break quote-cache updates for other consumers.
    }
  }
}

export function getPaperPortfolioPreloadState(): PaperPortfolioPreloadState {
  return sharedState;
}

export function subscribePaperPortfolioPreload(
  listener: (state: PaperPortfolioPreloadState) => void,
): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function publishPaperPortfolioPreload(
  portfolios: PaperPortfolioPreloadSummary[],
  quotes: Record<string, LiveQuote>,
) {
  const mergedQuotes = { ...sharedState.quotes };
  for (const [rawSymbol, rawQuote] of Object.entries(quotes)) {
    const symbol = rawSymbol.trim().toUpperCase();
    if (!symbol || !isValidQuote(rawQuote)) continue;
    const quote = normalizeQuote(rawQuote);
    if ((mergedQuotes[symbol]?.fetchedAtMs ?? 0) > (quote.fetchedAtMs ?? 0)) continue;
    mergedQuotes[symbol] = quote;
  }
  sharedState = {
    portfolios: portfolios.map((portfolio) => computePaperPortfolioPreloadMetrics(portfolio, mergedQuotes)),
    quotes: mergedQuotes,
  };
  notifyListeners();
}

export function mergePaperPreloadQuotes(incoming: Record<string, LiveQuote>) {
  const next = { ...sharedState.quotes };
  for (const [rawSymbol, rawQuote] of Object.entries(incoming)) {
    const symbol = rawSymbol.trim().toUpperCase();
    if (!symbol || !isValidQuote(rawQuote)) continue;
    const quote = normalizeQuote(rawQuote);
    const previous = next[symbol];
    if ((previous?.fetchedAtMs ?? 0) > (quote.fetchedAtMs ?? 0)) continue;
    next[symbol] = quote;
  }
  sharedState = {
    quotes: next,
    portfolios: sharedState.portfolios.map((portfolio) => {
      const { equity: _equity, buyingPower: _buyingPower, marketValue: _marketValue,
        unrealizedPnL: _unrealizedPnL, totalReturn: _totalReturn, totalReturnPct: _totalReturnPct,
        ...summary } = portfolio;
      return computePaperPortfolioPreloadMetrics(summary, next);
    }),
  };
  notifyListeners();
  return sharedState;
}

let paperQuoteWriteQueue: Promise<void> = Promise.resolve();
const quoteWriteQueues = new WeakMap<object, Promise<void>>();

export function persistPaperPreloadQuotes(
  storage: PaperPortfolioPreloadStorage,
  quotes: Record<string, LiveQuote>,
): Promise<void> {
  const key = storage as object;
  const previous = quoteWriteQueues.get(key) ?? paperQuoteWriteQueue;
  const write = previous
    .catch(() => {})
    .then(() => storage.setItem(PAPER_QUOTE_CACHE_KEY, JSON.stringify(quotes)))
    .then(() => undefined)
    .catch(() => {});
  quoteWriteQueues.set(key, write);
  paperQuoteWriteQueue = write;
  return write;
}

const BASE_URL = `https://${process.env.EXPO_PUBLIC_DOMAIN}`;

export const requestPaperPreloadQuote = createPaperQuoteRequestCache(async (symbol) => {
  const response = await fetch(`${BASE_URL}/api/stocks/quote/${encodeURIComponent(symbol)}`);
  if (!response.ok) throw new Error(`Quote request failed for ${symbol}`);
  const data = await response.json();
  if (!Number.isFinite(data.currentPrice) || data.currentPrice <= 0) {
    throw new Error(`Invalid quote for ${symbol}`);
  }
  return {
    price: data.currentPrice,
    change: Number.isFinite(data.priceChange) ? data.priceChange : 0,
    pct: Number.isFinite(data.priceChangePercent) ? data.priceChangePercent : 0,
    priceTimestamp: data.priceTimestamp ?? null,
    marketSession: typeof data.marketSession === 'string' ? data.marketSession : undefined,
    priceSource: typeof data.priceSource === 'string' ? data.priceSource : undefined,
    fetchedAtMs: Date.now(),
  };
});
