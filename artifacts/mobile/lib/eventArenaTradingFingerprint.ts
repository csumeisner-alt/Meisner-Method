import type { PaperChallengeEventType } from './paperChallenge.ts';
import {
  isWinningSell,
  sellNetPnL,
  WIN_THRESHOLD,
  type PaperTransaction,
} from './paperMath.ts';

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
const SHARE_EPSILON = 1e-9;

/** Minimum sample before describing a result as a repeated trading pattern. */
export const FINGERPRINT_MIN_PATTERN_TRADES = 3;
/** A fixed heuristic, normalized to completed exits per 24 hours of event time. */
export const FINGERPRINT_HIGH_FREQUENCY_TRADES_PER_24H = 8;
/** A symbol needs this share of absolute realized P&L to be called dominant. */
export const FINGERPRINT_DOMINANCE_SHARE_PERCENT = 70;
/** Equity must fall this far from a prior peak to count as a meaningful drawdown. */
export const FINGERPRINT_MEANINGFUL_DRAWDOWN_PERCENT = 5;

/**
 * The caller attaches participant identity from the authenticated participant
 * or participant-scoped API result. Regular Event Arena records are scoped by
 * account and event dates; Lightning Round records also require the persisted
 * lightningRoundEventId because that event shares an account with other work.
 */
export type FingerprintTradeRecord = PaperTransaction & {
  participantId: string;
  /** Optional when regular-event membership comes from its dedicated account/window. */
  eventId?: string;
  /** Transactions are created on fills; reject non-filled joined records defensively. */
  executionStatus?: string;
};

export type FingerprintEquitySnapshot = {
  participantId: string;
  accountId: string;
  /** Required for Lightning Round because it shares an account with regular events. */
  eventId?: string;
  date: string;
  value: number;
};

export type EventArenaTradingFingerprintInput = {
  participantId: string;
  accountId: string;
  eventId: string;
  eventType: PaperChallengeEventType;
  eventStartAtMs: number;
  eventEndAtMs: number;
  startingEquity?: number;
  transactions: readonly FingerprintTradeRecord[];
  equityHistory?: readonly FingerprintEquitySnapshot[];
};

export type FingerprintClosedTrade = {
  transactionId: string;
  symbol: string;
  action: 'SELL' | 'BUY_TO_COVER';
  date: string;
  netRealizedPnl: number;
  /** Null when the event history does not contain the complete opening lots. */
  holdingTimeHours: number | null;
};

export type EventArenaTradingFingerprint = {
  /** Filled buy/short/close transactions in the exact participant/account/event window. */
  eligibleFillCount: number;
  /** All completed closing fills, including exits whose realized P&L is missing. */
  completedTradeCount: number;
  /** Completed closes with finite realized P&L and fees, used for P&L patterns. */
  realizedTradeSampleSize: number;
  /** Closing fills omitted because their realized P&L or fee was missing/invalid. */
  incompleteCloseCount: number;
  totalRealizedPnl: number | null;
  biggestWinningTrade: FingerprintClosedTrade | null;
  biggestLosingTrade: FingerprintClosedTrade | null;
  biggestWinnerContributionPercent: number | null;
  averageHoldingTime: {
    profitableHours: number | null;
    profitableTradesWithKnownHoldingTime: number;
    losingHours: number | null;
    losingTradesWithKnownHoldingTime: number;
  };
  winRate: {
    percent: number | null;
    wins: number;
    losses: number;
    nonnegativeSubthresholdTrades: number;
    sampleSize: number;
    meaningfulPatternSample: boolean;
    /** Uses the same after-fee threshold as paperMath's existing win-rate logic. */
    winThreshold: number;
  };
  consistency: {
    maxConsecutiveWins: number | null;
    maxConsecutiveLosses: number | null;
    sampleSize: number;
    meaningfulPatternSample: boolean;
  };
  positionDominance: {
    status: 'dominant' | 'not-dominant' | 'rule-constrained' | 'insufficient-data';
    dominantSymbol: string | null;
    dominantSymbolNetRealizedPnl: number | null;
    shareOfAbsoluteRealizedPnlPercent: number | null;
    sampleSize: number;
  };
  drawdownRecovery: {
    status: 'recovered' | 'not-recovered' | 'no-meaningful-drawdown' | 'insufficient-data';
    maxDrawdownPercent: number | null;
    snapshotCount: number;
  };
  tradingFrequency: {
    completedTradesPer24Hours: number | null;
    eventDurationHours: number | null;
    unusuallyHigh: boolean | null;
    sampleSize: number;
    minimumSampleSize: number;
    highFrequencyThresholdPer24Hours: number;
  };
  /** Exposes the valid event-scoped realized exits for later deterministic consumers. */
  closedTrades: FingerprintClosedTrade[];
};

type EventWindow = {
  startAtMs: number;
  endAtMs: number;
  durationMs: number;
};

type TimedTransaction = {
  transaction: FingerprintTradeRecord;
  timestamp: number;
  originalIndex: number;
};

type OpenLot = {
  remainingShares: number;
  openedAtMs: number;
};

type HoldingAggregate = {
  hours: number;
  count: number;
};

function compareText(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function resolveEventWindow(input: EventArenaTradingFingerprintInput): EventWindow | null {
  if (
    !input.participantId.trim()
    || !input.accountId.trim()
    || !input.eventId.trim()
    || !Number.isFinite(input.eventStartAtMs)
    || !Number.isFinite(input.eventEndAtMs)
    || input.eventEndAtMs <= input.eventStartAtMs
  ) return null;

  const declaredDurationMs = input.eventEndAtMs - input.eventStartAtMs;
  const durationMs = input.eventType === 'lightning-round'
    ? Math.min(declaredDurationMs, DAY_MS)
    : declaredDurationMs;
  if (!Number.isFinite(durationMs) || durationMs <= 0) return null;

  return {
    startAtMs: input.eventStartAtMs,
    endAtMs: input.eventStartAtMs + durationMs,
    durationMs,
  };
}

function isFilledTradeRecord(
  transaction: FingerprintTradeRecord,
  input: EventArenaTradingFingerprintInput,
  window: EventWindow,
): number | null {
  if (
    transaction.participantId !== input.participantId
    || transaction.accountId !== input.accountId
    || (transaction.eventId !== undefined && transaction.eventId !== input.eventId)
    || (transaction.executionStatus != null
      && transaction.executionStatus.toLowerCase() !== 'filled')
  ) return null;

  if (input.eventType === 'lightning-round') {
    if (transaction.lightningRoundEventId !== input.eventId) return null;
  } else if (transaction.lightningRoundEventId) {
    return null;
  }

  if (
    transaction.action !== 'BUY'
    && transaction.action !== 'SELL'
    && transaction.action !== 'SHORT_SELL'
    && transaction.action !== 'BUY_TO_COVER'
  ) return null;

  if (
    typeof transaction.id !== 'string'
    || transaction.id.length === 0
    || typeof transaction.symbol !== 'string'
    || transaction.symbol.trim().length === 0
    || !Number.isFinite(transaction.shares)
    || transaction.shares <= 0
  ) return null;

  const timestamp = Date.parse(transaction.date);
  if (
    !Number.isFinite(timestamp)
    || timestamp < window.startAtMs
    || timestamp > window.endAtMs
  ) return null;

  return timestamp;
}

function compareTimedTransactions(a: TimedTransaction, b: TimedTransaction): number {
  if (a.timestamp !== b.timestamp) return a.timestamp - b.timestamp;

  // Same-timestamp open/close ordering is unknowable. Process closes first so
  // they cannot claim a zero-duration holding period from a simultaneous buy.
  const aIsClose = a.transaction.action === 'SELL' || a.transaction.action === 'BUY_TO_COVER';
  const bIsClose = b.transaction.action === 'SELL' || b.transaction.action === 'BUY_TO_COVER';
  if (aIsClose !== bIsClose) return aIsClose ? -1 : 1;

  return compareText(a.transaction.id, b.transaction.id)
    || compareText(a.transaction.symbol, b.transaction.symbol)
    || a.originalIndex - b.originalIndex;
}

function consumeLots(
  lots: OpenLot[],
  sharesToClose: number,
  closedAtMs: number,
): number | null {
  let remainingShares = sharesToClose;
  let matchedShares = 0;
  let weightedHoldingMs = 0;

  while (remainingShares > SHARE_EPSILON && lots.length > 0) {
    const lot = lots[0];
    if (!lot || lot.openedAtMs >= closedAtMs) break;

    const consumedShares = Math.min(remainingShares, lot.remainingShares);
    matchedShares += consumedShares;
    weightedHoldingMs += consumedShares * (closedAtMs - lot.openedAtMs);
    remainingShares -= consumedShares;
    lot.remainingShares -= consumedShares;

    if (lot.remainingShares <= SHARE_EPSILON) lots.shift();
  }

  const matchedWholeClose = Math.abs(matchedShares - sharesToClose)
    <= Math.max(SHARE_EPSILON, sharesToClose * SHARE_EPSILON);
  return matchedWholeClose ? weightedHoldingMs / sharesToClose / HOUR_MS : null;
}

function getPositionDominance(
  input: EventArenaTradingFingerprintInput,
  trades: readonly FingerprintClosedTrade[],
): EventArenaTradingFingerprint['positionDominance'] {
  const bySymbol = new Map<string, { netPnl: number; absolutePnl: number }>();
  for (const trade of trades) {
    const current = bySymbol.get(trade.symbol) ?? { netPnl: 0, absolutePnl: 0 };
    current.netPnl += trade.netRealizedPnl;
    current.absolutePnl += Math.abs(trade.netRealizedPnl);
    bySymbol.set(trade.symbol, current);
  }

  const totalAbsolutePnl = [...bySymbol.values()]
    .reduce((total, value) => total + value.absolutePnl, 0);
  const dominant = [...bySymbol.entries()]
    .sort((a, b) => b[1].absolutePnl - a[1].absolutePnl || compareText(a[0], b[0]))[0];
  const dominantSymbol = dominant?.[0] ?? null;
  const dominantValues = dominant?.[1] ?? null;
  const share = totalAbsolutePnl > 0 && dominantValues
    ? dominantValues.absolutePnl / totalAbsolutePnl * 100
    : null;

  if (input.eventType === 'one-stock-challenge') {
    return {
      status: 'rule-constrained',
      dominantSymbol,
      dominantSymbolNetRealizedPnl: dominantValues?.netPnl ?? null,
      shareOfAbsoluteRealizedPnlPercent: share,
      sampleSize: trades.length,
    };
  }

  if (trades.length < FINGERPRINT_MIN_PATTERN_TRADES || share === null || dominantSymbol === null) {
    return {
      status: 'insufficient-data',
      dominantSymbol,
      dominantSymbolNetRealizedPnl: dominantValues?.netPnl ?? null,
      shareOfAbsoluteRealizedPnlPercent: share,
      sampleSize: trades.length,
    };
  }

  return {
    status: share >= FINGERPRINT_DOMINANCE_SHARE_PERCENT ? 'dominant' : 'not-dominant',
    dominantSymbol,
    dominantSymbolNetRealizedPnl: dominantValues?.netPnl ?? null,
    shareOfAbsoluteRealizedPnlPercent: share,
    sampleSize: trades.length,
  };
}

function getDrawdownRecovery(
  input: EventArenaTradingFingerprintInput,
  window: EventWindow | null,
): EventArenaTradingFingerprint['drawdownRecovery'] {
  const insufficient = {
    status: 'insufficient-data' as const,
    maxDrawdownPercent: null,
    snapshotCount: 0,
  };
  if (
    !window
    || !Number.isFinite(input.startingEquity)
    || (input.startingEquity ?? 0) <= 0
    || !input.equityHistory
  ) return insufficient;

  const samplesByTimestamp = new Map<number, Set<number>>();
  for (const snapshot of input.equityHistory) {
    if (
      snapshot.participantId !== input.participantId
      || snapshot.accountId !== input.accountId
      || (snapshot.eventId !== undefined && snapshot.eventId !== input.eventId)
      || (input.eventType === 'lightning-round' && snapshot.eventId !== input.eventId)
      || !Number.isFinite(snapshot.value)
    ) continue;

    const timestamp = Date.parse(snapshot.date);
    // The enrollment baseline is the event-start equity. Avoid ambiguous
    // duplicate samples at that exact instant.
    if (
      !Number.isFinite(timestamp)
      || timestamp <= window.startAtMs
      || timestamp > window.endAtMs
    ) continue;

    const values = samplesByTimestamp.get(timestamp) ?? new Set<number>();
    values.add(snapshot.value);
    samplesByTimestamp.set(timestamp, values);
  }

  const snapshots = [...samplesByTimestamp.entries()]
    .filter(([, values]) => values.size === 1)
    .map(([timestamp, values]) => ({ timestamp, value: [...values][0]! }))
    .sort((a, b) => a.timestamp - b.timestamp);
  if (snapshots.length === 0) return insufficient;

  let peak = input.startingEquity!;
  let maxDrawdownPercent = 0;
  let meaningfulDrawdownPeak: number | null = null;
  let lastMeaningfulDrawdownRecovered: boolean | null = null;

  for (const snapshot of snapshots) {
    if (meaningfulDrawdownPeak !== null && snapshot.value >= meaningfulDrawdownPeak) {
      lastMeaningfulDrawdownRecovered = true;
      meaningfulDrawdownPeak = null;
    }
    if (snapshot.value > peak) peak = snapshot.value;

    if (peak <= 0) continue;
    const drawdownPercent = Math.max(0, (peak - snapshot.value) / peak * 100);
    maxDrawdownPercent = Math.max(maxDrawdownPercent, drawdownPercent);
    if (
      drawdownPercent >= FINGERPRINT_MEANINGFUL_DRAWDOWN_PERCENT
      && meaningfulDrawdownPeak === null
    ) {
      meaningfulDrawdownPeak = peak;
      lastMeaningfulDrawdownRecovered = false;
    }
  }

  const status = lastMeaningfulDrawdownRecovered === null
    ? 'no-meaningful-drawdown'
    : lastMeaningfulDrawdownRecovered
      ? 'recovered'
      : 'not-recovered';
  return { status, maxDrawdownPercent, snapshotCount: snapshots.length };
}

function emptyFingerprint(
  input: EventArenaTradingFingerprintInput,
  window: EventWindow | null,
): EventArenaTradingFingerprint {
  const durationHours = window ? window.durationMs / HOUR_MS : null;
  const totalDurationDays = window ? window.durationMs / DAY_MS : 0;

  return {
    eligibleFillCount: 0,
    completedTradeCount: 0,
    realizedTradeSampleSize: 0,
    incompleteCloseCount: 0,
    totalRealizedPnl: null,
    biggestWinningTrade: null,
    biggestLosingTrade: null,
    biggestWinnerContributionPercent: null,
    averageHoldingTime: {
      profitableHours: null,
      profitableTradesWithKnownHoldingTime: 0,
      losingHours: null,
      losingTradesWithKnownHoldingTime: 0,
    },
    winRate: {
      percent: null,
      wins: 0,
      losses: 0,
      nonnegativeSubthresholdTrades: 0,
      sampleSize: 0,
      meaningfulPatternSample: false,
      winThreshold: WIN_THRESHOLD,
    },
    consistency: {
      maxConsecutiveWins: null,
      maxConsecutiveLosses: null,
      sampleSize: 0,
      meaningfulPatternSample: false,
    },
    positionDominance: {
      status: input.eventType === 'one-stock-challenge' ? 'rule-constrained' : 'insufficient-data',
      dominantSymbol: null,
      dominantSymbolNetRealizedPnl: null,
      shareOfAbsoluteRealizedPnlPercent: null,
      sampleSize: 0,
    },
    drawdownRecovery: getDrawdownRecovery(input, window),
    tradingFrequency: {
      completedTradesPer24Hours: window ? 0 : null,
      eventDurationHours: durationHours,
      unusuallyHigh: null,
      sampleSize: 0,
      minimumSampleSize: FINGERPRINT_MIN_PATTERN_TRADES,
      highFrequencyThresholdPer24Hours: FINGERPRINT_HIGH_FREQUENCY_TRADES_PER_24H,
    },
    closedTrades: [],
  };
}

/**
 * Analyze only event-scoped filled transactions and saved equity observations.
 * Realized P&L is the paper engine's stored net-after-fees calculation; missing
 * values stay missing. A closing fill is one completed trade, including partial
 * closes, matching paperMath's existing win-rate convention.
 */
export function analyzeEventArenaTradingFingerprint(
  input: EventArenaTradingFingerprintInput,
): EventArenaTradingFingerprint {
  const window = resolveEventWindow(input);
  if (!window) return emptyFingerprint(input, null);

  const timedTransactions = input.transactions
    .map((transaction, originalIndex) => ({
      transaction,
      originalIndex,
      timestamp: isFilledTradeRecord(transaction, input, window),
    }))
    .filter((item): item is TimedTransaction => item.timestamp !== null)
    .sort(compareTimedTransactions);

  const longLots = new Map<string, OpenLot[]>();
  const shortLots = new Map<string, OpenLot[]>();
  const closedTrades: FingerprintClosedTrade[] = [];
  const closedTradeWins = new Map<string, boolean>();
  let completedCloseCount = 0;
  let incompleteCloseCount = 0;

  for (const { transaction, timestamp } of timedTransactions) {
    if (transaction.action === 'BUY' || transaction.action === 'SHORT_SELL') {
      const lotsBySymbol = transaction.action === 'BUY' ? longLots : shortLots;
      const lots = lotsBySymbol.get(transaction.symbol) ?? [];
      lots.push({ remainingShares: transaction.shares, openedAtMs: timestamp });
      lotsBySymbol.set(transaction.symbol, lots);
      continue;
    }
    if (transaction.action !== 'SELL' && transaction.action !== 'BUY_TO_COVER') continue;

    completedCloseCount += 1;
    const closingLots = transaction.action === 'SELL'
      ? longLots.get(transaction.symbol) ?? []
      : shortLots.get(transaction.symbol) ?? [];
    const holdingTimeHours = consumeLots(closingLots, transaction.shares, timestamp);

    const fee = transaction.fee ?? 0;
    if (
      !Number.isFinite(transaction.realizedPnL)
      || !Number.isFinite(fee)
      || fee < 0
    ) {
      incompleteCloseCount += 1;
      continue;
    }

    const netRealizedPnl = sellNetPnL(transaction);
    if (!Number.isFinite(netRealizedPnl)) {
      incompleteCloseCount += 1;
      continue;
    }

    closedTrades.push({
      transactionId: transaction.id,
      symbol: transaction.symbol,
      action: transaction.action,
      date: transaction.date,
      netRealizedPnl,
      holdingTimeHours,
    });
    closedTradeWins.set(transaction.id, isWinningSell(transaction));
  }

  if (closedTrades.length === 0) {
    const empty = emptyFingerprint(input, window);
    empty.eligibleFillCount = timedTransactions.length;
    empty.completedTradeCount = completedCloseCount;
    empty.tradingFrequency.completedTradesPer24Hours = completedCloseCount
      / (window.durationMs / DAY_MS);
    empty.tradingFrequency.sampleSize = completedCloseCount;
    empty.tradingFrequency.unusuallyHigh = completedCloseCount >= FINGERPRINT_MIN_PATTERN_TRADES
      ? empty.tradingFrequency.completedTradesPer24Hours
        >= FINGERPRINT_HIGH_FREQUENCY_TRADES_PER_24H
      : null;
    empty.incompleteCloseCount = incompleteCloseCount;
    return empty;
  }

  const totalRealizedPnl = closedTrades.reduce((total, trade) => total + trade.netRealizedPnl, 0);
  const winners = closedTrades.filter((trade) => trade.netRealizedPnl > 0);
  const losers = closedTrades.filter((trade) => trade.netRealizedPnl < 0);
  const biggestWinningTrade = winners
    .slice()
    .sort((a, b) => b.netRealizedPnl - a.netRealizedPnl
      || compareText(a.date, b.date)
      || compareText(a.transactionId, b.transactionId))[0] ?? null;
  const biggestLosingTrade = losers
    .slice()
    .sort((a, b) => a.netRealizedPnl - b.netRealizedPnl
      || compareText(a.date, b.date)
      || compareText(a.transactionId, b.transactionId))[0] ?? null;

  let wins = 0;
  let losses = 0;
  let nonnegativeSubthresholdTrades = 0;
  let currentWinStreak = 0;
  let currentLossStreak = 0;
  let maxConsecutiveWins = 0;
  let maxConsecutiveLosses = 0;
  const profitableHolding: HoldingAggregate = { hours: 0, count: 0 };
  const losingHolding: HoldingAggregate = { hours: 0, count: 0 };

  for (const trade of closedTrades) {
    const isWin = closedTradeWins.get(trade.transactionId)
      ?? trade.netRealizedPnl >= WIN_THRESHOLD;
    if (isWin) {
      wins += 1;
      currentWinStreak += 1;
      currentLossStreak = 0;
      maxConsecutiveWins = Math.max(maxConsecutiveWins, currentWinStreak);
    } else if (trade.netRealizedPnl < 0) {
      losses += 1;
      currentLossStreak += 1;
      currentWinStreak = 0;
      maxConsecutiveLosses = Math.max(maxConsecutiveLosses, currentLossStreak);
    } else {
      nonnegativeSubthresholdTrades += 1;
      currentWinStreak = 0;
      currentLossStreak = 0;
    }

    if (trade.holdingTimeHours !== null && trade.netRealizedPnl > 0) {
      profitableHolding.hours += trade.holdingTimeHours;
      profitableHolding.count += 1;
    } else if (trade.holdingTimeHours !== null && trade.netRealizedPnl < 0) {
      losingHolding.hours += trade.holdingTimeHours;
      losingHolding.count += 1;
    }
  }

  const sampleSize = closedTrades.length;

  return {
    eligibleFillCount: timedTransactions.length,
    completedTradeCount: completedCloseCount,
    realizedTradeSampleSize: sampleSize,
    incompleteCloseCount,
    totalRealizedPnl,
    biggestWinningTrade,
    biggestLosingTrade,
    biggestWinnerContributionPercent: biggestWinningTrade && totalRealizedPnl > 0
      ? biggestWinningTrade.netRealizedPnl / totalRealizedPnl * 100
      : null,
    averageHoldingTime: {
      profitableHours: profitableHolding.count > 0
        ? profitableHolding.hours / profitableHolding.count
        : null,
      profitableTradesWithKnownHoldingTime: profitableHolding.count,
      losingHours: losingHolding.count > 0
        ? losingHolding.hours / losingHolding.count
        : null,
      losingTradesWithKnownHoldingTime: losingHolding.count,
    },
    winRate: {
      percent: wins / sampleSize * 100,
      wins,
      losses,
      nonnegativeSubthresholdTrades,
      sampleSize,
      meaningfulPatternSample: sampleSize >= FINGERPRINT_MIN_PATTERN_TRADES,
      winThreshold: WIN_THRESHOLD,
    },
    consistency: {
      maxConsecutiveWins,
      maxConsecutiveLosses,
      sampleSize,
      meaningfulPatternSample: sampleSize >= FINGERPRINT_MIN_PATTERN_TRADES,
    },
    positionDominance: getPositionDominance(input, closedTrades),
    drawdownRecovery: getDrawdownRecovery(input, window),
    tradingFrequency: {
      completedTradesPer24Hours: completedCloseCount / (window.durationMs / DAY_MS),
      eventDurationHours: window.durationMs / HOUR_MS,
      unusuallyHigh: completedCloseCount >= FINGERPRINT_MIN_PATTERN_TRADES
        ? completedCloseCount / (window.durationMs / DAY_MS)
          >= FINGERPRINT_HIGH_FREQUENCY_TRADES_PER_24H
        : null,
      sampleSize: completedCloseCount,
      minimumSampleSize: FINGERPRINT_MIN_PATTERN_TRADES,
      highFrequencyThresholdPer24Hours: FINGERPRINT_HIGH_FREQUENCY_TRADES_PER_24H,
    },
    closedTrades,
  };
}
