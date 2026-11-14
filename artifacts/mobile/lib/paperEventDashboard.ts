import { getEventArenaWindowProgress } from './eventArenaCompetitiveProgress.ts';

export type PaperEventDashboardPhase = 'upcoming' | 'active' | 'ended' | 'unavailable';

export function getPaperEventDashboardPhase(
  startAtMs: number,
  endAtMs: number,
  nowMs: number,
): PaperEventDashboardPhase {
  if (
    !Number.isFinite(startAtMs)
    || !Number.isFinite(endAtMs)
    || !Number.isFinite(nowMs)
    || endAtMs <= startAtMs
  ) {
    return 'unavailable';
  }
  if (nowMs < startAtMs) return 'upcoming';
  if (nowMs < endAtMs) return 'active';
  return 'ended';
}

export function formatPaperEventCountdown(startAtMs: number, endAtMs: number, nowMs: number) {
  const phase = getPaperEventDashboardPhase(startAtMs, endAtMs, nowMs);
  if (phase === 'unavailable') return 'Schedule unavailable';
  if (phase === 'ended') return 'Event complete';

  const targetAtMs = phase === 'upcoming' ? startAtMs : endAtMs;
  const totalSeconds = Math.max(0, Math.ceil((targetAtMs - nowMs) / 1000));
  const days = Math.floor(totalSeconds / 86_400);
  const hours = Math.floor((totalSeconds % 86_400) / 3_600);
  const minutes = Math.floor((totalSeconds % 3_600) / 60);
  const seconds = totalSeconds % 60;
  const remaining = [
    ...(days ? [`${days}d`] : []),
    ...(days || hours ? [`${hours}h`] : []),
    ...(days || hours || minutes ? [`${minutes}m`] : []),
    `${seconds}s`,
  ].join(' ');

  return `${phase === 'upcoming' ? 'Starts in' : 'Ends in'} ${remaining}`;
}

export function getPaperEventDashboardProgress(startAtMs: number, endAtMs: number, nowMs: number) {
  return getEventArenaWindowProgress(startAtMs, endAtMs, nowMs);
}

export function getPaperEventDashboardRank(rank: number | null) {
  if (!Number.isInteger(rank) || (rank ?? 0) < 1) return null;
  if (rank === 1) return { label: 'CHAMPION · 1ST', medal: 'GOLD' } as const;
  if (rank === 2) return { label: 'SILVER · 2ND', medal: 'SILVER' } as const;
  if (rank === 3) return { label: 'BRONZE · 3RD', medal: 'BRONZE' } as const;
  return { label: `#${rank} PLACE`, medal: null } as const;
}
