export const APP_REVIEW_STORAGE_KEY = '@meisnermethod/app_review_state_v1';
export const APP_REVIEW_MIN_ANALYSIS_DAYS = 3;
export const APP_REVIEW_MIN_ACCOUNT_AGE_MS = 7 * 24 * 60 * 60 * 1000;
export const APP_REVIEW_COOLDOWN_MS = 120 * 24 * 60 * 60 * 1000;

export type AppReviewState = {
  firstSuccessfulAnalysisAt: number | null;
  successfulAnalysisDays: string[];
  lastRequestAttemptAt: number | null;
};

export function createAppReviewState(): AppReviewState {
  return {
    firstSuccessfulAnalysisAt: null,
    successfulAnalysisDays: [],
    lastRequestAttemptAt: null,
  };
}

function isTimestamp(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

export function parseAppReviewState(raw: string | null): AppReviewState {
  if (!raw) return createAppReviewState();

  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return createAppReviewState();

    const value = parsed as Partial<AppReviewState>;
    return {
      firstSuccessfulAnalysisAt: isTimestamp(value.firstSuccessfulAnalysisAt)
        ? value.firstSuccessfulAnalysisAt
        : null,
      successfulAnalysisDays: Array.isArray(value.successfulAnalysisDays)
        ? [...new Set(value.successfulAnalysisDays.filter(
          (day): day is string => typeof day === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(day),
        ))].sort()
        : [],
      lastRequestAttemptAt: isTimestamp(value.lastRequestAttemptAt)
        ? value.lastRequestAttemptAt
        : null,
    };
  } catch {
    return createAppReviewState();
  }
}

function localDayKey(timestamp: number): string {
  const date = new Date(timestamp);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function recordSuccessfulAnalysis(
  state: AppReviewState,
  timestamp: number,
): AppReviewState {
  const successfulAnalysisDays = [...new Set([
    ...state.successfulAnalysisDays,
    localDayKey(timestamp),
  ])].sort();

  return {
    ...state,
    firstSuccessfulAnalysisAt: state.firstSuccessfulAnalysisAt ?? timestamp,
    successfulAnalysisDays,
  };
}

export function shouldRequestAppReview(state: AppReviewState, now: number): boolean {
  const firstSuccessAt = state.firstSuccessfulAnalysisAt;
  if (
    firstSuccessAt === null
    || firstSuccessAt > now - APP_REVIEW_MIN_ACCOUNT_AGE_MS
    || state.successfulAnalysisDays.length < APP_REVIEW_MIN_ANALYSIS_DAYS
  ) {
    return false;
  }

  const lastRequestAttemptAt = state.lastRequestAttemptAt;
  return lastRequestAttemptAt === null
    || (lastRequestAttemptAt <= now
      && now - lastRequestAttemptAt >= APP_REVIEW_COOLDOWN_MS);
}

export function recordAppReviewRequestAttempt(
  state: AppReviewState,
  timestamp: number,
): AppReviewState {
  return { ...state, lastRequestAttemptAt: timestamp };
}

export type AppReviewRequestResult = 'ineligible' | 'unavailable' | 'cancelled' | 'requested';

export async function requestAppReviewIfEligible(
  state: AppReviewState,
  now: number,
  adapter: {
    isAvailable: () => Promise<boolean>;
    canContinue: () => boolean;
    persistAttempt: (next: AppReviewState) => Promise<void>;
    requestReview: () => Promise<void>;
  },
): Promise<AppReviewRequestResult> {
  if (!shouldRequestAppReview(state, now)) return 'ineligible';
  if (!(await adapter.isAvailable())) return 'unavailable';
  if (!adapter.canContinue()) return 'cancelled';

  await adapter.persistAttempt(recordAppReviewRequestAttempt(state, now));
  if (!adapter.canContinue()) return 'cancelled';
  await adapter.requestReview();
  return 'requested';
}
