import type { PaperChallengeWindow } from './paperChallenge.ts';

export type LightningRoundInvitationPhase = 'preparation' | 'active' | 'post-event';
export type LightningRoundInvitationAction = 'JOIN' | 'ENTER' | 'VIEW EVENT';

export function shouldRenderLightningRoundInvitationButton(
  enrollmentReady: boolean,
  phase: LightningRoundInvitationPhase | null,
  hasSchedule: boolean,
): boolean {
  return enrollmentReady && phase !== null && hasSchedule;
}

export function getLightningRoundInvitationPhase(
  window: Pick<PaperChallengeWindow, 'startAtMs' | 'endAtMs'> | null | undefined,
  nowMs: number,
): LightningRoundInvitationPhase | null {
  if (
    !window
    || !Number.isFinite(window.startAtMs)
    || !Number.isFinite(window.endAtMs)
    || !Number.isFinite(nowMs)
    || window.endAtMs <= window.startAtMs
    || nowMs < window.startAtMs - 72 * 60 * 60 * 1000
    || nowMs >= window.endAtMs + 48 * 60 * 60 * 1000
  ) return null;
  if (nowMs < window.startAtMs) return 'preparation';
  if (nowMs < window.endAtMs) return 'active';
  return 'post-event';
}

export function getLightningRoundInvitationStorageKey(userId: string, eventId: string): string {
  return `@stocksense/lightning_invitation_seen_v1:${encodeURIComponent(userId)}:${encodeURIComponent(eventId)}`;
}

export async function markLightningRoundInvitationSeen(
  storage: {
    getItem(key: string): Promise<string | null>;
    setItem(key: string, value: string): Promise<void>;
  },
  userId: string,
  eventId: string,
  seenAtMs: number,
): Promise<boolean> {
  const key = getLightningRoundInvitationStorageKey(userId, eventId);
  if (await storage.getItem(key) !== null) return true;
  await storage.setItem(key, String(seenAtMs));
  return false;
}

export function getLightningRoundInvitationRevealMode(
  alreadySeen: boolean,
  reduceMotion: boolean,
): 'reveal' | 'static' {
  return alreadySeen || reduceMotion ? 'static' : 'reveal';
}

export function getLightningRoundInvitationAction(
  enrolled: boolean,
  phase: LightningRoundInvitationPhase,
): LightningRoundInvitationAction {
  if (enrolled) return 'VIEW EVENT';
  return phase === 'preparation' ? 'JOIN' : 'ENTER';
}

export function shouldShowLightningRoundInvitationCountdown(width: number): boolean {
  return Number.isFinite(width) && width >= 420;
}

export function formatLightningRoundInvitationCountdown(
  window: Pick<PaperChallengeWindow, 'startAtMs' | 'endAtMs'>,
  phase: LightningRoundInvitationPhase,
  nowMs: number,
): string {
  const target = phase === 'preparation'
    ? window.startAtMs
    : phase === 'active'
      ? window.endAtMs
      : window.endAtMs + 48 * 60 * 60 * 1000;
  const totalMinutes = Math.max(0, Math.floor((target - nowMs) / 60_000));
  const days = Math.floor(totalMinutes / 1_440);
  const hours = Math.floor((totalMinutes % 1_440) / 60);
  const minutes = totalMinutes % 60;
  const label = phase === 'preparation' ? 'STARTS IN' : phase === 'active' ? 'ENDS IN' : 'CLOSES IN';
  return `${label} ${days > 0 ? `${days}D ` : ''}${String(hours).padStart(2, '0')}H ${String(minutes).padStart(2, '0')}M`;
}
