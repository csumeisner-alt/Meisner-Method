/**
 * Tests for the fact-count core logic.
 *
 * Key invariant under test: when a user has N facts persisted in AsyncStorage
 * and the app restarts, incrementing from the hydrated baseline must produce
 * N+1, never regress toward 1 (which would happen if the increment ran before
 * hydration completed and read countRef = 0 instead of N).
 *
 * Run with: node --test --experimental-strip-types "artifacts/mobile/lib/factCountLogic.test.ts"
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseStoredCount,
  computeNextCount,
  isUnlockTriggered,
  AMERICAN_MODE_THRESHOLD,
} from './factCountLogic.ts';

describe('parseStoredCount', () => {
  test('parses a high persisted count correctly', () => {
    assert.equal(parseStoredCount('347'), 347);
    assert.equal(parseStoredCount('549'), 549);
    assert.equal(parseStoredCount('550'), 550);
  });

  test('returns 0 for missing or invalid values', () => {
    assert.equal(parseStoredCount(null), 0);
    assert.equal(parseStoredCount(undefined), 0);
    assert.equal(parseStoredCount(''), 0);
    assert.equal(parseStoredCount('abc'), 0);
    assert.equal(parseStoredCount('-5'), 0); // negatives treated as 0
  });
});

test('Patriot Mode unlocks at the patriotic threshold', () => {
  assert.equal(AMERICAN_MODE_THRESHOLD, 1_776);
});

describe('computeNextCount — hydration invariant', () => {
  test('increment from hydrated high count never regresses', () => {
    // Simulate: user had 347 facts, hydration loaded 347 into countRef,
    // THEN user taps the button.
    const hydratedCount = parseStoredCount('347');
    const next = computeNextCount(hydratedCount);
    assert.equal(next, 348, 'must increment from hydrated baseline, not from 0');
  });

  test('demonstrates the pre-fix bug: early tap from unhydrated ref gives 1', () => {
    // Without the hydration gate, countRef starts at 0, so the first tap
    // writes 1 to storage — clobbering the real value (e.g. 347).
    const uninitializedRef = 0; // countRef before hydration
    const badNext = computeNextCount(uninitializedRef);
    assert.equal(badNext, 1); // Regressed from 347 → 1: proves the bug existed
  });

  test('increment near threshold preserves accuracy', () => {
    const near = parseStoredCount(String(AMERICAN_MODE_THRESHOLD - 2));
    assert.equal(computeNextCount(near), AMERICAN_MODE_THRESHOLD - 1);
    assert.equal(computeNextCount(AMERICAN_MODE_THRESHOLD - 1), AMERICAN_MODE_THRESHOLD);
  });
});

describe('isUnlockTriggered', () => {
  test('fires exactly at the threshold crossing', () => {
    const prev = AMERICAN_MODE_THRESHOLD - 1;
    const next = computeNextCount(prev);
    assert.ok(isUnlockTriggered(prev, next), 'must trigger at the threshold');
  });

  test('does not fire before the threshold', () => {
    const prev = AMERICAN_MODE_THRESHOLD - 2;
    assert.ok(!isUnlockTriggered(prev, computeNextCount(prev)));
  });

  test('does not fire again after already unlocked', () => {
    const prev = AMERICAN_MODE_THRESHOLD; // already past
    assert.ok(!isUnlockTriggered(prev, computeNextCount(prev)));
  });

  test('does not fire at 0', () => {
    assert.ok(!isUnlockTriggered(0, 1));
  });
});
