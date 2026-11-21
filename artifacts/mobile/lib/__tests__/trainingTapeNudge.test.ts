import assert from 'node:assert/strict';
import test from 'node:test';
import {
  parseTrainingTapeTimestamp,
  resolveAppAgeAnchor,
  shouldShowTrainingTapeNudge,
  TRAINING_TAPE_NUDGE_AFTER_MS,
} from '../trainingTapeNudge.ts';

const nowMs = Date.UTC(2026, 10, 21);

test('the reminder waits 30 days and requires zero quote views', () => {
  const base = {
    quotesViewed: 0,
    dismissed: false,
    nowMs,
  };
  assert.equal(shouldShowTrainingTapeNudge({
    ...base,
    appAgeAnchorMs: nowMs - TRAINING_TAPE_NUDGE_AFTER_MS + 1,
  }), false);
  assert.equal(shouldShowTrainingTapeNudge({
    ...base,
    appAgeAnchorMs: nowMs - TRAINING_TAPE_NUDGE_AFTER_MS,
  }), true);
  assert.equal(shouldShowTrainingTapeNudge({
    ...base,
    appAgeAnchorMs: nowMs - TRAINING_TAPE_NUDGE_AFTER_MS,
    quotesViewed: 1,
  }), false);
});

test('a missing install date, a dismissal, or a future timestamp cannot trigger the reminder', () => {
  assert.equal(shouldShowTrainingTapeNudge({
    appAgeAnchorMs: null,
    quotesViewed: 0,
    dismissed: false,
    nowMs,
  }), false);
  assert.equal(shouldShowTrainingTapeNudge({
    appAgeAnchorMs: nowMs - TRAINING_TAPE_NUDGE_AFTER_MS,
    quotesViewed: 0,
    dismissed: true,
    nowMs,
  }), false);
  assert.equal(shouldShowTrainingTapeNudge({
    appAgeAnchorMs: nowMs + 1,
    quotesViewed: 0,
    dismissed: false,
    nowMs,
  }), false);
});

test('native install time takes precedence over the web first-open fallback', async () => {
  let wroteFallback = false;
  const installTime = nowMs - 90 * 24 * 60 * 60 * 1000;
  const resolved = await resolveAppAgeAnchor({
    getNativeInstallDate: async () => new Date(installTime),
    readFirstOpenedAt: async () => null,
    writeFirstOpenedAt: async () => { wroteFallback = true; },
    nowMs,
  });
  assert.equal(resolved, installTime);
  assert.equal(wroteFallback, false);
});

test('first-open time is saved and reused when a native install date is unavailable', async () => {
  let saved: string | null = null;
  const input = {
    getNativeInstallDate: async () => null,
    readFirstOpenedAt: async () => saved,
    writeFirstOpenedAt: async (timestamp: string) => { saved = timestamp; },
    nowMs,
  };
  assert.equal(await resolveAppAgeAnchor(input), nowMs);
  assert.equal(saved, String(nowMs));
  assert.equal(await resolveAppAgeAnchor(input), nowMs);
});

test('invalid stored timestamps are rejected', () => {
  assert.equal(parseTrainingTapeTimestamp(null), null);
  assert.equal(parseTrainingTapeTimestamp('not-a-time'), null);
  assert.equal(parseTrainingTapeTimestamp('-1'), null);
  assert.equal(parseTrainingTapeTimestamp(String(nowMs)), nowMs);
});
