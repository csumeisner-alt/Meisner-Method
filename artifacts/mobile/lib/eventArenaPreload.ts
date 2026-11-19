import type { LiveQuote } from './paperMath.ts';
import {
  getEventArenaCountdown,
  getEventArenaParticipation,
  getEventArenaPerformance,
  type EventArenaAccountData,
  type EventArenaCountdown,
  type EventArenaParticipation,
  type EventArenaPerformance,
} from './eventArenaHome.ts';
import {
  getPaperChallengeEnrollments,
  isPaperChallengeAccountId,
  normalizePaperChallengeStore,
  type PaperChallengeStore,
  type PaperChallengeWindow,
} from './paperChallenge.ts';

export type EventArenaPreloadState = {
  ready: boolean;
  updatedAtMs: number | null;
  nowMs: number;
  currentEvent: PaperChallengeWindow | null;
  lightningWindow: PaperChallengeWindow | null;
  participation: EventArenaParticipation | null;
  countdown: EventArenaCountdown | null;
  performance: EventArenaPerformance | null;
  store: PaperChallengeStore;
  accountData: EventArenaAccountData;
  quotes: Record<string, LiveQuote>;
};

export type EventArenaPreloadInput = {
  store: PaperChallengeStore;
  accountData: EventArenaAccountData;
  quotes: Record<string, LiveQuote>;
  currentEvent: PaperChallengeWindow | null;
  lightningWindow: PaperChallengeWindow | null;
  nowMs: number;
};

export type EventArenaQuoteRequest = (symbol: string, forceRefresh?: boolean) => Promise<LiveQuote>;

const emptyAccountData = (): EventArenaAccountData => ({
  accounts: [],
  positions: [],
  transactions: [],
  orders: [],
  snapshots: [],
});

const emptyState = (): EventArenaPreloadState => ({
  ready: false,
  updatedAtMs: null,
  nowMs: Date.now(),
  currentEvent: null,
  lightningWindow: null,
  participation: null,
  countdown: null,
  performance: null,
  store: { enrollment: null, lightningEnrollment: null, history: [] },
  accountData: emptyAccountData(),
  quotes: {},
});

function isValidQuote(value: unknown): value is LiveQuote {
  return !!value
    && typeof value === 'object'
    && !Array.isArray(value)
    && Number.isFinite((value as LiveQuote).price)
    && (value as LiveQuote).price > 0;
}

function symbolsFor(data: EventArenaAccountData): string[] {
  return [...new Set([
    ...data.positions
      .filter((position) => position.shares > 0)
      .map((position) => position.symbol),
    ...data.orders
      .filter((order) => order.status === 'pending')
      .map((order) => order.symbol),
  ].map((symbol) => symbol.trim().toUpperCase()).filter(Boolean))];
}

function pricesNeededBy(data: EventArenaAccountData, quotes: Record<string, LiveQuote>) {
  const needed = new Set(symbolsFor(data));
  const selected: Record<string, LiveQuote> = {};
  for (const [rawSymbol, quote] of Object.entries(quotes)) {
    const symbol = rawSymbol.trim().toUpperCase();
    if (needed.has(symbol) && isValidQuote(quote)) selected[symbol] = quote;
  }
  return selected;
}

export function eventArenaQuotePrices(quotes: Record<string, LiveQuote>): Record<string, number> {
  return Object.fromEntries(
    Object.entries(quotes)
      .filter(([, quote]) => isValidQuote(quote))
      .map(([symbol, quote]) => [symbol.trim().toUpperCase(), quote.price]),
  );
}

export function buildEventArenaPreloadState(input: EventArenaPreloadInput): EventArenaPreloadState {
  const store = normalizePaperChallengeStore(input.store, input.nowMs);
  const accountIds = new Set(
    getPaperChallengeEnrollments(store)
      .map((enrollment) => enrollment.accountId)
      .filter((accountId) => isPaperChallengeAccountId(accountId)),
  );
  const accountData: EventArenaAccountData = {
    accounts: input.accountData.accounts.filter((account) => accountIds.has(account.id)),
    positions: input.accountData.positions.filter((position) => accountIds.has(position.accountId)),
    transactions: input.accountData.transactions.filter((transaction) => accountIds.has(transaction.accountId)),
    orders: input.accountData.orders.filter((order) => accountIds.has(order.accountId)),
    snapshots: input.accountData.snapshots.filter((snapshot) => accountIds.has(snapshot.accountId)),
  };
  const quotes = pricesNeededBy(accountData, input.quotes);
  const regularEnrollment = input.currentEvent
    && store.enrollment?.eventId === input.currentEvent.id
    ? store.enrollment
    : null;

  return {
    ready: true,
    updatedAtMs: input.nowMs,
    nowMs: input.nowMs,
    currentEvent: input.currentEvent,
    lightningWindow: input.lightningWindow,
    participation: input.currentEvent
      ? getEventArenaParticipation(input.currentEvent, store.enrollment, input.nowMs)
      : null,
    countdown: input.currentEvent
      ? getEventArenaCountdown(input.currentEvent, input.nowMs)
      : null,
    performance: regularEnrollment && input.currentEvent
      ? getEventArenaPerformance(regularEnrollment, input.currentEvent, accountData, eventArenaQuotePrices(quotes), input.nowMs)
      : null,
    store,
    accountData,
    quotes,
  };
}

export function eventArenaPreloadSymbols(state: EventArenaPreloadState): string[] {
  return symbolsFor(state.accountData);
}

export async function refreshEventArenaQuotes(
  symbols: string[],
  cachedQuotes: Record<string, LiveQuote>,
  requestQuote: EventArenaQuoteRequest,
  forceRefresh = false,
): Promise<Record<string, LiveQuote>> {
  const uniqueSymbols = [...new Set(symbols.map((symbol) => symbol.trim().toUpperCase()).filter(Boolean))];
  const results = await Promise.allSettled(
    uniqueSymbols.map(async (symbol) => [symbol, await requestQuote(symbol, forceRefresh)] as const),
  );
  const next = { ...cachedQuotes };
  for (const result of results) {
    if (result.status !== 'fulfilled' || !isValidQuote(result.value[1])) continue;
    const [symbol, quote] = result.value;
    const previous = next[symbol];
    if ((previous?.fetchedAtMs ?? 0) > (quote.fetchedAtMs ?? 0)) continue;
    next[symbol] = quote;
  }
  return next;
}

let sharedState = emptyState();
const listeners = new Set<(state: EventArenaPreloadState) => void>();

function notifyListeners() {
  for (const listener of listeners) {
    try {
      listener(sharedState);
    } catch {
      // A listener must not stop other Event Arena consumers from updating.
    }
  }
}

export function getEventArenaPreloadState(): EventArenaPreloadState {
  return sharedState;
}

export function subscribeEventArenaPreload(
  listener: (state: EventArenaPreloadState) => void,
): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function publishEventArenaPreload(input: EventArenaPreloadInput) {
  sharedState = buildEventArenaPreloadState(input);
  notifyListeners();
  return sharedState;
}

export function mergeEventArenaPreloadQuotes(incoming: Record<string, LiveQuote>) {
  const next = { ...sharedState.quotes };
  const needed = new Set(symbolsFor(sharedState.accountData));
  let changed = false;
  for (const [rawSymbol, quote] of Object.entries(incoming)) {
    const symbol = rawSymbol.trim().toUpperCase();
    if (!needed.has(symbol) || !isValidQuote(quote)) continue;
    const previous = next[symbol];
    if ((previous?.fetchedAtMs ?? 0) > (quote.fetchedAtMs ?? 0)) continue;
    if (previous && Object.keys(quote).length === Object.keys(previous).length
      && Object.entries(quote).every(([key, value]) =>
        previous[key as keyof LiveQuote] === value,
      )) continue;
    next[symbol] = quote;
    changed = true;
  }
  if (!changed) return sharedState;
  const enrollment = sharedState.store.enrollment;
  const currentEvent = sharedState.currentEvent;
  sharedState = {
    ...sharedState,
    updatedAtMs: Date.now(),
    quotes: next,
    performance: enrollment && currentEvent && enrollment.eventId === currentEvent.id
      ? getEventArenaPerformance(
          enrollment,
          currentEvent,
          sharedState.accountData,
          eventArenaQuotePrices(next),
          Date.now(),
        )
      : null,
  };
  notifyListeners();
  return sharedState;
}

