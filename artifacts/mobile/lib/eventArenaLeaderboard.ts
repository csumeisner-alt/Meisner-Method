export type EventArenaPhase = 'upcoming' | 'active' | 'ended';
export type EventArenaReturnTone = 'positive' | 'negative' | 'neutral';
export type EventArenaScoreSource = 'participant' | 'server';

export function isEventArenaScoreStale(input: {
  phase: EventArenaPhase;
  updatedAt: string;
  nowMs: number;
  scoreSource: EventArenaScoreSource;
  isLightningRound?: boolean;
}) {
  if (input.phase !== 'active') return false;
  if (input.isLightningRound && input.scoreSource !== 'server') return true;
  const updatedAtMs = Date.parse(input.updatedAt);
  return !Number.isFinite(updatedAtMs) || input.nowMs - updatedAtMs > 5 * 60_000;
}

export type EventArenaStatus = {
  phase: EventArenaPhase;
  label: string;
  countdown: string;
};

export type PreStartEventArenaScoreInput = {
  installationId: string;
  alias: string;
  eventType: import('./paperChallenge.ts').PaperChallengeEventType;
  artworkId: import('./paperChallenge.ts').PaperChallengeArtworkId;
  startingBalance: number;
  rankingDirection: import('./paperChallenge.ts').PaperChallengeRankingDirection;
  purchaseLimit?: number;
  eventStartAtMs: number;
  eventEndAtMs: number;
};

export function buildPreStartEventArenaScore(input: PreStartEventArenaScoreInput) {
  return {
    ...input,
    cashBalance: input.startingBalance,
    appliedTransferIds: [] as string[],
    startEquity: input.startingBalance,
    equity: input.startingBalance,
    returnPercent: 0,
    tradeCount: 0,
    holdings: [] as Array<never>,
  };
}

export function formatEventArenaMoney(value: number) {
  return `$${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function formatEventArenaSignedMoney(value: number) {
  const rounded = Math.round(value * 100) / 100;
  return `${rounded >= 0 ? '+' : '−'}${formatEventArenaMoney(Math.abs(rounded))}`;
}

export function formatEventArenaReturn(value: number) {
  const rounded = Math.round(value * 100) / 100;
  return `${rounded >= 0 ? '+' : ''}${rounded.toFixed(2)}%`;
}

export function getEventArenaReturnTone(value: number): EventArenaReturnTone {
  const rounded = Math.round(value * 100) / 100;
  if (rounded === 0) return 'neutral';
  return rounded > 0 ? 'positive' : 'negative';
}

export function getEventArenaProfitLossTone(value: number): EventArenaReturnTone {
  return getEventArenaReturnTone(value);
}

export function getEventArenaPodiumSlots<T extends { rank: number }>(entries: T[]) {
  return ([1, 2, 3] as const).map((rank) => ({
    rank,
    entry: entries.find((entry) => entry.rank === rank) ?? null,
  }));
}

export function getEventArenaStandingsEntries<T extends { rank: number }>(entries: T[]) {
  return entries.filter((entry) => entry.rank > 3);
}

export function getEventArenaOwnEntry<T extends { isCurrentUser: boolean }>(
  entries: T[],
  optedIn: boolean,
) {
  if (!optedIn) return null;
  const ownEntries = entries.filter((entry) => entry.isCurrentUser);
  return ownEntries.length === 1 ? ownEntries[0] : null;
}

function formatRemainingTime(milliseconds: number) {
  const minutes = Math.max(1, Math.ceil(milliseconds / 60_000));
  const days = Math.floor(minutes / (24 * 60));
  const hours = Math.floor((minutes % (24 * 60)) / 60);
  const remainingMinutes = minutes % 60;
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${remainingMinutes}m`;
  return `${remainingMinutes}m`;
}

export function getEventArenaStatus(startAtMs: number, endAtMs: number, nowMs: number): EventArenaStatus {
  if (nowMs < startAtMs) {
    return {
      phase: 'upcoming',
      label: 'Upcoming Competition',
      countdown: `Starts in ${formatRemainingTime(startAtMs - nowMs)}`,
    };
  }
  if (nowMs < endAtMs) {
    return {
      phase: 'active',
      label: 'Live Championship',
      countdown: `Ends in ${formatRemainingTime(endAtMs - nowMs)}`,
    };
  }
  return { phase: 'ended', label: 'Final Results', countdown: 'Event complete' };
}
