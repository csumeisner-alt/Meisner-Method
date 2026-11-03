import assert from 'node:assert/strict';
import test from 'node:test';
import {
  APP_REVIEW_COOLDOWN_MS,
  APP_REVIEW_MIN_ACCOUNT_AGE_MS,
  createAppReviewState,
  parseAppReviewState,
  recordAppReviewRequestAttempt,
  recordSuccessfulAnalysis,
  requestAppReviewIfEligible,
  shouldRequestAppReview,
} from '../appReview.ts';

const DAY_MS = 24 * 60 * 60 * 1000;

function eligibleReviewState(start: number) {
  let state = createAppReviewState();
  state = recordSuccessfulAnalysis(state, start);
  state = recordSuccessfulAnalysis(state, start + 4 * DAY_MS);
  state = recordSuccessfulAnalysis(state, start + 8 * DAY_MS);
  return state;
}

test('review eligibility requires successful analyses on three separate days', () => {
  const start = new Date(2026, 0, 1, 12).getTime();
  let state = createAppReviewState();
  state = recordSuccessfulAnalysis(state, start);
  state = recordSuccessfulAnalysis(state, start + 60 * 60 * 1000);
  state = recordSuccessfulAnalysis(state, start + DAY_MS);

  assert.equal(state.successfulAnalysisDays.length, 2);
  assert.equal(shouldRequestAppReview(state, start + 30 * DAY_MS), false);
});

test('review eligibility waits seven days after the first successful analysis', () => {
  const start = new Date(2026, 0, 1, 12).getTime();
  const state = eligibleReviewState(start);

  assert.equal(shouldRequestAppReview(state, start + APP_REVIEW_MIN_ACCOUNT_AGE_MS - 1), false);
  assert.equal(shouldRequestAppReview(state, start + APP_REVIEW_MIN_ACCOUNT_AGE_MS), true);
});

test('review request attempts are throttled for 120 days', () => {
  const start = new Date(2026, 0, 1, 12).getTime();
  const eligibleAt = start + 8 * DAY_MS;
  const state = eligibleReviewState(start);
  const attempted = recordAppReviewRequestAttempt(state, eligibleAt);

  assert.equal(shouldRequestAppReview(attempted, eligibleAt + APP_REVIEW_COOLDOWN_MS - 1), false);
  assert.equal(shouldRequestAppReview(attempted, eligibleAt + APP_REVIEW_COOLDOWN_MS), true);
});

test('native review prompt suppression does not consume the app cooldown', async () => {
  const start = new Date(2026, 0, 1, 12).getTime();
  const now = start + 8 * DAY_MS;
  const state = eligibleReviewState(start);
  let persistedAttempts = 0;
  let requestCalls = 0;

  const result = await requestAppReviewIfEligible(state, now, {
    isAvailable: async () => false,
    canContinue: () => true,
    persistAttempt: async () => { persistedAttempts += 1; },
    requestReview: async () => { requestCalls += 1; },
  });

  assert.equal(result, 'unavailable');
  assert.equal(persistedAttempts, 0);
  assert.equal(requestCalls, 0);
  assert.equal(shouldRequestAppReview(state, now), true);
});

test('eligible review requests persist the cooldown before calling the native prompt', async () => {
  const start = new Date(2026, 0, 1, 12).getTime();
  const now = start + 8 * DAY_MS;
  const state = eligibleReviewState(start);
  const events: string[] = [];

  const result = await requestAppReviewIfEligible(state, now, {
    isAvailable: async () => true,
    canContinue: () => true,
    persistAttempt: async (next) => {
      assert.equal(next.lastRequestAttemptAt, now);
      events.push('persist');
    },
    requestReview: async () => { events.push('request'); },
  });

  assert.equal(result, 'requested');
  assert.deepEqual(events, ['persist', 'request']);
});

test('review state parsing recovers from corrupt storage and deduplicates saved days', () => {
  assert.deepEqual(parseAppReviewState('not JSON'), createAppReviewState());
  assert.deepEqual(parseAppReviewState(JSON.stringify({
    firstSuccessfulAnalysisAt: 10,
    successfulAnalysisDays: ['2026-01-01', '2026-01-01', 'invalid'],
    lastRequestAttemptAt: -1,
  })), {
    firstSuccessfulAnalysisAt: 10,
    successfulAnalysisDays: ['2026-01-01'],
    lastRequestAttemptAt: null,
  });
});
