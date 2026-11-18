import type { PaperChallengeEventType } from './paperChallenge.ts';
import {
  analyzeEventArenaTradingFingerprint,
  type EventArenaTradingFingerprint,
  type EventArenaTradingFingerprintInput,
  type FingerprintEquitySnapshot,
  type FingerprintTradeRecord,
} from './eventArenaTradingFingerprint.ts';
import type { PaperTransaction } from './paperMath.ts';

export const TRADING_FINGERPRINT_NEUTRAL_FALLBACK =
  'Your trading fingerprint is still developing. More completed trades will reveal more about your trading style.';

export const TRADING_FINGERPRINT_OBSERVATION_THRESHOLDS = {
  minimumTrades: 3,
  profitContributionPercent: 70,
  minimumHoldingTimeRatio: 1.5,
  minimumHoldingTimeDifferenceHours: 1,
  minimumHoldingTimeEventShare: 0.1,
  minimumRecoveryDrawdownPercent: 5,
  minimumRecoverySnapshots: 3,
  minimumPositiveTradeSharePercent: 70,
  minimumSymbolConcentrationPercent: 80,
} as const;

export type TradingFingerprintObservationId =
  | 'one-trade-made-a-difference'
  | 'patient-profitable-trades'
  | 'recovered-drawdown'
  | 'positive-trade-consistency'
  | 'symbol-result-concentration'
  | 'winning-trade-streak'
  | 'losing-trade-streak'
  | 'event-paced-trading';

export type TradingFingerprintObservation = {
  id: TradingFingerprintObservationId;
  sentence: string;
  /** Weighted 0–100 score; used only to choose among supported observations. */
  score: number;
  scoreParts: {
    magnitude: number;
    uniqueness: number;
    reliability: number;
  };
  /** Unrounded values that support the sentence. */
  evidence: Readonly<Record<string, number | string>>;
};

export type TradingFingerprintObservationSelection = {
  selected: TradingFingerprintObservation | null;
  /** All supported candidates, in deterministic strongest-first order. */
  candidates: TradingFingerprintObservation[];
  sentence: string;
};

export type SavedTradingFingerprintObservation = {
  version: 1;
  observationId: TradingFingerprintObservationId | null;
  headline: string;
  supportingSentence: string;
  score: number | null;
  scoreParts: TradingFingerprintObservation['scoreParts'] | null;
  evidence: Readonly<Record<string, number | string>>;
};

export type TradingFingerprintEventInput = Omit<
  EventArenaTradingFingerprintInput,
  'transactions' | 'equityHistory'
> & {
  transactions: readonly {
    id?: string;
    accountId: string;
    symbol: string;
    companyName?: string;
    action: PaperTransaction['action'];
    shares?: number;
    price?: number;
    total?: number;
    date: string;
    realizedPnL?: number;
    fee?: number;
    lightningRoundEventId?: string;
    executionStatus?: string;
  }[];
  equityHistory?: readonly Omit<FingerprintEquitySnapshot, 'participantId' | 'accountId' | 'eventId'>[];
};

const FALLBACK_SENTENCE = TRADING_FINGERPRINT_NEUTRAL_FALLBACK;
const SCORE_WEIGHTS = { magnitude: 0.45, uniqueness: 0.35, reliability: 0.2 } as const;
const OBSERVATION_TIE_BREAK_ORDER: readonly TradingFingerprintObservationId[] = [
  'one-trade-made-a-difference',
  'recovered-drawdown',
  'patient-profitable-trades',
  'symbol-result-concentration',
  'winning-trade-streak',
  'losing-trade-streak',
  'event-paced-trading',
  'positive-trade-consistency',
];
const OBSERVATION_HEADLINES: Record<TradingFingerprintObservationId, string> = {
  'one-trade-made-a-difference': 'One trade made the difference',
  'patient-profitable-trades': 'Your patience paid off',
  'recovered-drawdown': 'You turned the competition around',
  'positive-trade-consistency': 'Your results came from consistency',
  'symbol-result-concentration': 'One ticker shaped your results',
  'winning-trade-streak': 'You built a winning streak',
  'losing-trade-streak': 'Your results included a difficult streak',
  'event-paced-trading': 'You traded at a fast pace',
};

export function isTradingFingerprintEventType(
  eventType: PaperChallengeEventType | undefined,
): boolean {
  return eventType === undefined
    || eventType === 'event-arena'
    || eventType === 'penny-stock-mayhem'
    || eventType === 'one-stock-challenge'
    || eventType === 'lightning-round';
}

export function toSavedTradingFingerprintObservation(
  selection: TradingFingerprintObservationSelection,
): SavedTradingFingerprintObservation {
  const selected = selection.selected;
  return {
    version: 1,
    observationId: selected?.id ?? null,
    headline: selected ? OBSERVATION_HEADLINES[selected.id] : 'Still developing',
    supportingSentence: selected?.sentence ?? FALLBACK_SENTENCE,
    score: selected?.score ?? null,
    scoreParts: selected?.scoreParts ?? null,
    evidence: selected?.evidence ?? {},
  };
}

/** Generate the save-ready observation once, as part of event finalization. */
export function buildSavedTradingFingerprintObservation(
  input: TradingFingerprintEventInput,
): SavedTradingFingerprintObservation {
  const transactions: FingerprintTradeRecord[] = input.transactions.map((transaction) => ({
    id: transaction.id ?? '',
    accountId: transaction.accountId,
    symbol: transaction.symbol,
    companyName: transaction.companyName ?? '',
    action: transaction.action,
    shares: transaction.shares ?? Number.NaN,
    price: transaction.price ?? Number.NaN,
    total: transaction.total ?? Number.NaN,
    date: transaction.date,
    ...(transaction.realizedPnL !== undefined ? { realizedPnL: transaction.realizedPnL } : {}),
    ...(transaction.fee !== undefined ? { fee: transaction.fee } : {}),
    ...(transaction.lightningRoundEventId
      ? { lightningRoundEventId: transaction.lightningRoundEventId }
      : {}),
    participantId: input.participantId,
    eventId: input.eventId,
    ...(transaction.executionStatus ? { executionStatus: transaction.executionStatus } : {}),
  }));
  const equityHistory: FingerprintEquitySnapshot[] | undefined = input.equityHistory?.map((snapshot) => ({
    ...snapshot,
    participantId: input.participantId,
    accountId: input.accountId,
    eventId: input.eventId,
  }));
  const analyzedInput: EventArenaTradingFingerprintInput = {
    participantId: input.participantId,
    accountId: input.accountId,
    eventId: input.eventId,
    eventType: input.eventType,
    eventStartAtMs: input.eventStartAtMs,
    eventEndAtMs: input.eventEndAtMs,
    startingEquity: input.startingEquity,
    transactions,
    ...(equityHistory ? { equityHistory } : {}),
  };
  return toSavedTradingFingerprintObservation(
    selectTradingFingerprintObservation(
      analyzeEventArenaTradingFingerprint(analyzedInput),
      input.eventType,
    ),
  );
}

/** Sanitize JSON-restored archive values before they reach the result card. */
export function normalizeSavedTradingFingerprintObservation(
  value: unknown,
): SavedTradingFingerprintObservation | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const candidate = value as Partial<SavedTradingFingerprintObservation>;
  const validIds: TradingFingerprintObservationId[] = [
    'one-trade-made-a-difference',
    'patient-profitable-trades',
    'recovered-drawdown',
    'positive-trade-consistency',
    'symbol-result-concentration',
    'winning-trade-streak',
    'losing-trade-streak',
    'event-paced-trading',
  ];
  if (
    candidate.version !== 1
    || (candidate.observationId !== null && !validIds.includes(candidate.observationId as TradingFingerprintObservationId))
    || typeof candidate.headline !== 'string'
    || candidate.headline.length > 80
    || typeof candidate.supportingSentence !== 'string'
    || candidate.supportingSentence.length > 400
    || !candidate.evidence
    || typeof candidate.evidence !== 'object'
    || Array.isArray(candidate.evidence)
  ) return undefined;
  const evidenceEntries = Object.entries(candidate.evidence);
  if (evidenceEntries.length > 20 || evidenceEntries.some(([, entry]) =>
    typeof entry === 'string' ? entry.length > 120 : !Number.isFinite(entry),
  )) return undefined;
  const evidence = Object.fromEntries(evidenceEntries) as Record<string, number | string>;
  const scoreParts = candidate.scoreParts;
  const validScoreParts = scoreParts === null || (
    !!scoreParts
    && Number.isFinite(scoreParts.magnitude) && scoreParts.magnitude >= 0 && scoreParts.magnitude <= 1
    && Number.isFinite(scoreParts.uniqueness) && scoreParts.uniqueness >= 0 && scoreParts.uniqueness <= 1
    && Number.isFinite(scoreParts.reliability) && scoreParts.reliability >= 0 && scoreParts.reliability <= 1
  );
  if (
    !validScoreParts
    || (candidate.score !== null && (!Number.isFinite(candidate.score) || candidate.score! < 0 || candidate.score! > 100))
    || (candidate.observationId === null && (candidate.score !== null || scoreParts !== null))
    || (candidate.observationId !== null && (candidate.score === null || scoreParts === null))
  ) return undefined;
  return {
    version: 1,
    observationId: candidate.observationId as TradingFingerprintObservationId | null,
    headline: candidate.headline,
    supportingSentence: candidate.supportingSentence,
    score: candidate.score ?? null,
    scoreParts: scoreParts ?? null,
    evidence,
  };
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function finiteOrNull(value: number | null): number | null {
  return value !== null && Number.isFinite(value) ? value : null;
}

function formatPercent(value: number): string {
  return `${new Intl.NumberFormat('en-US', {
    maximumFractionDigits: 1,
    minimumFractionDigits: 0,
  }).format(value)}%`;
}

function formatUsd(value: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
  }).format(value);
}

function formatHours(value: number): string {
  return new Intl.NumberFormat('en-US', {
    maximumFractionDigits: 1,
    minimumFractionDigits: 0,
  }).format(value);
}

function makeObservation(
  id: TradingFingerprintObservationId,
  sentence: string,
  parts: TradingFingerprintObservation['scoreParts'],
  evidence: TradingFingerprintObservation['evidence'],
): TradingFingerprintObservation {
  const score = (
    parts.magnitude * SCORE_WEIGHTS.magnitude
    + parts.uniqueness * SCORE_WEIGHTS.uniqueness
    + parts.reliability * SCORE_WEIGHTS.reliability
  ) * 100;
  return {
    id,
    sentence,
    score: Math.round(score * 1_000_000) / 1_000_000,
    scoreParts: parts,
    evidence,
  };
}

/**
 * Stable ranking: score first, then a fixed editorial priority, then ID.
 * The final ID comparison also makes unknown/future IDs deterministic.
 */
export function rankTradingFingerprintObservations(
  observations: readonly TradingFingerprintObservation[],
): TradingFingerprintObservation[] {
  const priority = new Map(OBSERVATION_TIE_BREAK_ORDER.map((id, index) => [id, index]));
  return observations.slice().sort((a, b) =>
    b.score - a.score
    || (priority.get(a.id) ?? Number.MAX_SAFE_INTEGER)
      - (priority.get(b.id) ?? Number.MAX_SAFE_INTEGER)
    || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
  );
}

function evaluateObservations(
  fingerprint: EventArenaTradingFingerprint,
  eventType: PaperChallengeEventType,
): TradingFingerprintObservation[] {
  const observations: TradingFingerprintObservation[] = [];
  const thresholds = TRADING_FINGERPRINT_OBSERVATION_THRESHOLDS;
  const realizedCount = fingerprint.realizedTradeSampleSize;
  const completedCount = fingerprint.completedTradeCount;
  const dataCoverage = completedCount > 0 ? realizedCount / completedCount : 0;

  const contribution = finiteOrNull(fingerprint.biggestWinnerContributionPercent);
  const biggestWinner = fingerprint.biggestWinningTrade;
  if (
    realizedCount >= thresholds.minimumTrades
    && fingerprint.totalRealizedPnl !== null
    && fingerprint.totalRealizedPnl > 0
    && biggestWinner
    && contribution !== null
    && contribution >= thresholds.profitContributionPercent
  ) {
    const excessShare = contribution - thresholds.profitContributionPercent;
    observations.push(makeObservation(
      'one-trade-made-a-difference',
      `One reported trade supplied ${formatPercent(contribution)} of your recorded net profit: a ${formatUsd(biggestWinner.netRealizedPnl)} realized gain.`,
      {
        magnitude: clamp01(excessShare / 80),
        uniqueness: clamp01(excessShare / 120),
        reliability: clamp01(realizedCount / 6) * dataCoverage,
      },
      {
        realizedTradeCount: realizedCount,
        netProfitContributionPercent: contribution,
        winningTradeNetPnl: biggestWinner.netRealizedPnl,
      },
    ));
  }

  const profitableCount = fingerprint.averageHoldingTime.profitableTradesWithKnownHoldingTime;
  const losingCount = fingerprint.averageHoldingTime.losingTradesWithKnownHoldingTime;
  const profitableHours = finiteOrNull(fingerprint.averageHoldingTime.profitableHours);
  const losingHours = finiteOrNull(fingerprint.averageHoldingTime.losingHours);
  const eventHours = finiteOrNull(fingerprint.tradingFrequency.eventDurationHours);
  if (
    profitableCount >= 2
    && losingCount >= 2
    && profitableHours !== null
    && losingHours !== null
    && eventHours !== null
    && losingHours > 0
  ) {
    const differenceHours = profitableHours - losingHours;
    const holdingRatio = profitableHours / losingHours;
    const minimumDifference = Math.max(
      thresholds.minimumHoldingTimeDifferenceHours,
      eventHours * thresholds.minimumHoldingTimeEventShare,
    );
    if (
      differenceHours >= minimumDifference
      && holdingRatio >= thresholds.minimumHoldingTimeRatio
    ) {
      const knownHoldingCount = profitableCount + losingCount;
      observations.push(makeObservation(
        'patient-profitable-trades',
        `Across ${profitableCount} profitable and ${losingCount} losing trades with known holding times, profitable trades stayed open ${formatHours(differenceHours)} hours longer on average.`,
        {
          magnitude: clamp01(differenceHours / Math.max(eventHours * 0.35, minimumDifference)),
          uniqueness: clamp01((holdingRatio - thresholds.minimumHoldingTimeRatio) / 3),
          reliability: clamp01(knownHoldingCount / 8)
            * clamp01(knownHoldingCount / Math.max(1, completedCount)),
        },
        {
          profitableAverageHoldingHours: profitableHours,
          losingAverageHoldingHours: losingHours,
          differenceHours,
          holdingRatio,
          profitableTradesWithKnownHoldingTime: profitableCount,
          losingTradesWithKnownHoldingTime: losingCount,
          eventDurationHours: eventHours,
        },
      ));
    }
  }

  const drawdown = fingerprint.drawdownRecovery;
  const drawdownPercent = finiteOrNull(drawdown.maxDrawdownPercent);
  if (
    drawdown.status === 'recovered'
    && drawdownPercent !== null
    && drawdownPercent >= thresholds.minimumRecoveryDrawdownPercent
    && drawdown.snapshotCount >= thresholds.minimumRecoverySnapshots
  ) {
    const excessDrawdown = drawdownPercent - thresholds.minimumRecoveryDrawdownPercent;
    observations.push(makeObservation(
      'recovered-drawdown',
      `You recovered from a ${formatPercent(drawdownPercent)} peak-to-trough drawdown during the event.`,
      {
        magnitude: clamp01(excessDrawdown / 20),
        uniqueness: clamp01(excessDrawdown / 35),
        reliability: clamp01(drawdown.snapshotCount / 6),
      },
      {
        maxDrawdownPercent: drawdownPercent,
        equitySnapshots: drawdown.snapshotCount,
      },
    ));
  }

  if (
    realizedCount >= thresholds.minimumTrades
    && fingerprint.totalRealizedPnl !== null
    && fingerprint.totalRealizedPnl > 0
  ) {
    const positiveTrades = fingerprint.closedTrades
      .filter((trade) => trade.netRealizedPnl > 0).length;
    const positiveShare = positiveTrades / realizedCount * 100;
    if (
      positiveTrades >= thresholds.minimumTrades
      && positiveShare >= thresholds.minimumPositiveTradeSharePercent
    ) {
      observations.push(makeObservation(
        'positive-trade-consistency',
        `${positiveTrades} of ${realizedCount} trades with reported realized results were profitable (${formatPercent(positiveShare)}).`,
        {
          magnitude: clamp01((positiveShare - 50) / 50),
          uniqueness: clamp01((positiveShare - thresholds.minimumPositiveTradeSharePercent) / 30),
          reliability: clamp01(realizedCount / 8) * dataCoverage,
        },
        {
          positiveTradeCount: positiveTrades,
          realizedTradeCount: realizedCount,
          positiveTradeSharePercent: positiveShare,
        },
      ));
    }
  }

  const longestWinStreak = fingerprint.consistency.maxConsecutiveWins;
  if (
    fingerprint.consistency.meaningfulPatternSample
    && realizedCount >= thresholds.minimumTrades
    && longestWinStreak !== null
    && longestWinStreak >= thresholds.minimumTrades
  ) {
    const excessStreak = longestWinStreak - thresholds.minimumTrades;
    observations.push(makeObservation(
      'winning-trade-streak',
      `You put together a ${longestWinStreak}-trade winning streak.`,
      {
        magnitude: clamp01(excessStreak / 5),
        uniqueness: clamp01(excessStreak / 8),
        reliability: clamp01(realizedCount / 8) * dataCoverage,
      },
      {
        longestWinningStreak: longestWinStreak,
        realizedTradeCount: realizedCount,
      },
    ));
  }

  const longestLossStreak = fingerprint.consistency.maxConsecutiveLosses;
  if (
    fingerprint.consistency.meaningfulPatternSample
    && realizedCount >= thresholds.minimumTrades
    && longestLossStreak !== null
    && longestLossStreak >= thresholds.minimumTrades
  ) {
    const excessStreak = longestLossStreak - thresholds.minimumTrades;
    observations.push(makeObservation(
      'losing-trade-streak',
      `Your longest sequence included ${longestLossStreak} realized losing trades.`,
      {
        magnitude: clamp01(excessStreak / 5),
        uniqueness: clamp01(excessStreak / 8),
        reliability: clamp01(realizedCount / 8) * dataCoverage,
      },
      {
        longestLosingStreak: longestLossStreak,
        realizedTradeCount: realizedCount,
      },
    ));
  }

  const frequency = fingerprint.tradingFrequency;
  const rate = finiteOrNull(frequency.completedTradesPer24Hours);
  const frequencyEventHours = finiteOrNull(frequency.eventDurationHours);
  if (
    frequency.unusuallyHigh === true
    && frequency.sampleSize >= frequency.minimumSampleSize
    && rate !== null
    && frequencyEventHours !== null
  ) {
    const excessRate = rate - frequency.highFrequencyThresholdPer24Hours;
    observations.push(makeObservation(
      'event-paced-trading',
      `You completed ${frequency.sampleSize} trades over ${formatHours(frequencyEventHours)} hours (${formatHours(rate)} per 24 hours).`,
      {
        magnitude: clamp01(excessRate / frequency.highFrequencyThresholdPer24Hours),
        uniqueness: clamp01(excessRate / (frequency.highFrequencyThresholdPer24Hours * 2)),
        reliability: clamp01(frequency.sampleSize / 8),
      },
      {
        completedTradeCount: frequency.sampleSize,
        eventDurationHours: frequencyEventHours,
        completedTradesPer24Hours: rate,
      },
    ));
  }

  const dominance = fingerprint.positionDominance;
  const concentration = finiteOrNull(dominance.shareOfAbsoluteRealizedPnlPercent);
  if (
    eventType !== 'one-stock-challenge'
    && dominance.status === 'dominant'
    && dominance.dominantSymbol
    && dominance.sampleSize >= thresholds.minimumTrades
    && concentration !== null
    && concentration >= thresholds.minimumSymbolConcentrationPercent
  ) {
    const excessShare = concentration - thresholds.minimumSymbolConcentrationPercent;
    observations.push(makeObservation(
      'symbol-result-concentration',
      `${dominance.dominantSymbol} accounted for ${formatPercent(concentration)} of the combined absolute recorded realized P&L.`,
      {
        magnitude: clamp01(excessShare / 20),
        uniqueness: clamp01(excessShare / 20),
        reliability: clamp01(dominance.sampleSize / 6) * dataCoverage,
      },
      {
        symbol: dominance.dominantSymbol,
        absoluteRealizedPnlSharePercent: concentration,
        symbolNetRealizedPnl: dominance.dominantSymbolNetRealizedPnl ?? 0,
        realizedTradeCount: dominance.sampleSize,
      },
    ));
  }

  return observations;
}

/**
 * Select one data-supported observation. It does not infer capital exposure,
 * risk-taking intent, or causation from realized P&L; those aren't in Part 1's
 * analysis output. Lightning Round thresholds use its already-capped duration.
 */
export function selectTradingFingerprintObservation(
  fingerprint: EventArenaTradingFingerprint,
  eventType: PaperChallengeEventType,
): TradingFingerprintObservationSelection {
  const candidates = rankTradingFingerprintObservations(
    evaluateObservations(fingerprint, eventType),
  );
  const selected = candidates[0] ?? null;
  return {
    selected,
    candidates,
    sentence: selected?.sentence ?? FALLBACK_SENTENCE,
  };
}
