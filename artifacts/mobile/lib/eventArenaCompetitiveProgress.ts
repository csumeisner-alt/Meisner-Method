export type CompetitiveEntry = {
  participantToken: string;
  rank: number;
  profitLoss: number;
  returnPercent: number;
  tradeCount: number | null;
};

export type CompetitiveChange = {
  placesMoved: number;
  risingStar: boolean;
  comeback: boolean;
};

export type EventArenaHistoryPoint = {
  capturedAt: string;
  rank: number;
  returnPercent: number;
};

export function getEventArenaHistoryDisplayPoints(
  points: EventArenaHistoryPoint[],
  maxPoints = 12,
) {
  const validPoints = points
    .filter((point) => Number.isFinite(Date.parse(point.capturedAt))
      && Number.isInteger(point.rank)
      && point.rank > 0
      && Number.isFinite(point.returnPercent))
    .slice()
    .sort((a, b) => Date.parse(a.capturedAt) - Date.parse(b.capturedAt));
  if (!Number.isInteger(maxPoints) || maxPoints <= 0 || validPoints.length <= maxPoints) return validPoints;
  if (maxPoints === 1) return [validPoints[validPoints.length - 1]];
  return Array.from({ length: maxPoints }, (_, index) => {
    const pointIndex = Math.round((index * (validPoints.length - 1)) / (maxPoints - 1));
    return validPoints[pointIndex]!;
  });
}

export function getEventArenaCompetitiveBadges(
  rank: number,
  tradeCount: number | null,
  change?: CompetitiveChange,
) {
  const badges: string[] = [];
  if (rank === 1) badges.push('CHAMPION');
  else if (rank === 2 || rank === 3) badges.push('PODIUM FINISH');
  if (tradeCount != null && Number.isFinite(tradeCount) && tradeCount >= 25) badges.push('ACTIVE TRADER');
  if (change?.risingStar) badges.push('RISING STAR');
  if (change?.comeback) badges.push('COMEBACK');
  return badges;
}

export function getEventArenaWindowProgress(startAtMs: number, endAtMs: number, nowMs: number) {
  if (
    !Number.isFinite(startAtMs)
    || !Number.isFinite(endAtMs)
    || !Number.isFinite(nowMs)
    || endAtMs <= startAtMs
  ) return 0;
  return Math.max(0, Math.min(100, ((nowMs - startAtMs) / (endAtMs - startAtMs)) * 100));
}

export function getEventArenaCompetitiveChanges(
  previousEntries: CompetitiveEntry[] | null,
  currentEntries: CompetitiveEntry[],
) {
  const previousByToken = new Map(
    (previousEntries ?? []).map((entry) => [entry.participantToken, entry]),
  );
  const changes = new Map<string, CompetitiveChange>();

  for (const current of currentEntries) {
    const previous = previousByToken.get(current.participantToken);
    if (!previous) continue;
    if (!Number.isFinite(previous.rank) || !Number.isFinite(current.rank)) continue;

    const placesMoved = previous.rank - current.rank;
    changes.set(current.participantToken, {
      placesMoved,
      risingStar: placesMoved >= 3,
      comeback: Number.isFinite(previous.profitLoss)
        && Number.isFinite(current.profitLoss)
        && previous.profitLoss <= 0
        && current.profitLoss > 0,
    });
  }

  return changes;
}

export function getEventArenaNextRankReturnGap(
  entry: Pick<CompetitiveEntry, 'rank' | 'returnPercent'>,
  entries: Array<Pick<CompetitiveEntry, 'rank' | 'returnPercent'>>,
) {
  if (!Number.isFinite(entry.rank) || entry.rank <= 1 || !Number.isFinite(entry.returnPercent)) return null;
  const nextRankEntry = entries.find((candidate) => candidate.rank === entry.rank - 1);
  if (!nextRankEntry || !Number.isFinite(nextRankEntry.returnPercent)) return null;
  const gap = nextRankEntry.returnPercent - entry.returnPercent;
  return gap >= 0 ? gap : null;
}
