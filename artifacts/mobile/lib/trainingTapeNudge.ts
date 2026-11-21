export const APP_FIRST_OPENED_AT_STORAGE_KEY = '@meisnermethod/app_first_opened_at_v1';
export const TRAINING_TAPE_NUDGE_DISMISSED_STORAGE_KEY = '@meisnermethod/training_tape_nudge_dismissed_v1';
export const TRAINING_TAPE_NUDGE_AFTER_MS = 30 * 24 * 60 * 60 * 1000;

export function parseTrainingTapeTimestamp(raw: string | null): number | null {
  if (raw === null) return null;
  const timestamp = Number(raw);
  return Number.isSafeInteger(timestamp) && timestamp > 0 ? timestamp : null;
}

export async function resolveAppAgeAnchor(input: {
  getNativeInstallDate: () => Promise<Date | null | undefined>;
  readFirstOpenedAt: () => Promise<string | null>;
  writeFirstOpenedAt: (timestamp: string) => Promise<void>;
  nowMs: number;
}): Promise<number | null> {
  try {
    const nativeInstallDate = await input.getNativeInstallDate();
    const nativeInstallTime = nativeInstallDate?.getTime();
    if (
      typeof nativeInstallTime === 'number'
      && Number.isSafeInteger(nativeInstallTime)
      && nativeInstallTime > 0
      && nativeInstallTime <= input.nowMs
    ) {
      return nativeInstallTime;
    }
  } catch {
    // Web and unsupported native builds use the persisted first-open fallback.
  }

  try {
    const storedFirstOpenedAt = parseTrainingTapeTimestamp(await input.readFirstOpenedAt());
    if (storedFirstOpenedAt !== null && storedFirstOpenedAt <= input.nowMs) {
      return storedFirstOpenedAt;
    }

    await input.writeFirstOpenedAt(String(input.nowMs));
    return input.nowMs;
  } catch {
    return null;
  }
}

export function shouldShowTrainingTapeNudge(input: {
  appAgeAnchorMs: number | null;
  quotesViewed: number;
  dismissed: boolean;
  nowMs: number;
}): boolean {
  return input.appAgeAnchorMs !== null
    && input.nowMs - input.appAgeAnchorMs >= TRAINING_TAPE_NUDGE_AFTER_MS
    && input.quotesViewed === 0
    && !input.dismissed;
}
