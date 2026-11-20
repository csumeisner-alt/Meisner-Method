import { getEventArenaWindowProgress } from './eventArenaCompetitiveProgress.ts';

export type PaperEventDashboardPhase = 'upcoming' | 'active' | 'ended' | 'unavailable';
export type LightningRoundCardPromotionPhase = 'preparation' | 'active' | 'post-event';

const HOUR_MS = 60 * 60 * 1000;
const LIGHTNING_ROUND_PROMOTION_LEAD_MS = 72 * HOUR_MS;
const LIGHTNING_ROUND_POST_EVENT_MS = 24 * HOUR_MS;

export function getLightningRoundCardPromotionPhase(
  schedule: { startAtMs: number; endAtMs: number } | null | undefined,
  nowMs: number,
): LightningRoundCardPromotionPhase | null {
  if (
    !schedule
    || !Number.isFinite(schedule.startAtMs)
    || !Number.isFinite(schedule.endAtMs)
    || !Number.isFinite(nowMs)
    || schedule.endAtMs <= schedule.startAtMs
  ) return null;

  if (nowMs < schedule.startAtMs - LIGHTNING_ROUND_PROMOTION_LEAD_MS) return null;
  if (nowMs >= schedule.endAtMs + LIGHTNING_ROUND_POST_EVENT_MS) return null;
  if (nowMs < schedule.startAtMs) return 'preparation';
  if (nowMs < schedule.endAtMs) return 'active';
  return 'post-event';
}

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
  if (rank === null || !Number.isInteger(rank) || rank < 1) return null;
  const remainder = rank % 100;
  const suffix = remainder >= 11 && remainder <= 13
    ? 'TH'
    : rank % 10 === 1
      ? 'ST'
      : rank % 10 === 2
        ? 'ND'
        : rank % 10 === 3
          ? 'RD'
          : 'TH';
  const medal = rank === 1 ? 'GOLD' : rank === 2 ? 'SILVER' : rank === 3 ? 'BRONZE' : null;
  return { label: `${rank}${suffix}`, medal };
}

export function getPaperEventDashboardRankText(args: {
  phase: PaperEventDashboardPhase;
  optedIn: boolean;
  rank: number | null;
  hasResponse: boolean;
  unavailable: boolean;
}): string {
  if (args.phase === 'upcoming') return 'UPCOMING';
  const rankTreatment = getPaperEventDashboardRank(args.rank);
  if (rankTreatment) return rankTreatment.label;
  if (!args.optedIn) return 'NOT RANKED';
  if (args.hasResponse) return 'NOT RANKED';
  if (args.unavailable || args.phase === 'unavailable') return 'UNAVAILABLE';
  return 'LOADING RANK';
}
