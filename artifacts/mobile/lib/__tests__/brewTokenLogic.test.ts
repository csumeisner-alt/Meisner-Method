import assert from 'node:assert/strict';
import test from 'node:test';
import {
  claimQuoteView,
  BREW_TOKEN_QUOTE_THRESHOLD,
  createSerialWriteQueue,
  INITIAL_BREW_TOKENS,
  isBrewBankHalfway,
  isBrewBankUnlock,
  isWeekday,
  parseStoredNonNegative,
  resolveBrewBet,
} from '../brewTokenLogic.ts';

test('Brew Bank unlocks exactly when the quote threshold is crossed', () => {
  assert.equal(isBrewBankUnlock(BREW_TOKEN_QUOTE_THRESHOLD - 1, BREW_TOKEN_QUOTE_THRESHOLD), true);
  assert.equal(isBrewBankUnlock(BREW_TOKEN_QUOTE_THRESHOLD, BREW_TOKEN_QUOTE_THRESHOLD + 1), false);
});

test('Brew Bank halfway milestone triggers only when crossing the midpoint', () => {
  assert.equal(isBrewBankHalfway(10, 11), true);
  assert.equal(isBrewBankHalfway(11, 12), false);
  assert.equal(isBrewBankHalfway(0, 10), false);
});

test('Brew Token storage parsing rejects invalid and negative values', () => {
  assert.equal(parseStoredNonNegative('12'), 12);
  assert.equal(parseStoredNonNegative('-4'), 0);
  assert.equal(parseStoredNonNegative('not-a-number'), 0);
});

test('weekday detection includes Monday through Friday only', () => {
  assert.equal(isWeekday(1), true);
  assert.equal(isWeekday(5), true);
  assert.equal(isWeekday(0), false);
  assert.equal(isWeekday(6), false);
});

test('winning a bet returns the stake as profit and losing removes only the stake', () => {
  assert.equal(resolveBrewBet(INITIAL_BREW_TOKENS, 2, true), 7);
  assert.equal(resolveBrewBet(INITIAL_BREW_TOKENS, 2, false), 3);
  assert.equal(resolveBrewBet(1, 4, false), 0);
});

test('quote view claims are idempotent and bounded', () => {
  const remembered = new Set<string>();
  assert.equal(claimQuoteView(remembered, 'tape-1', 2), true);
  assert.equal(claimQuoteView(remembered, 'tape-1', 2), false);
  assert.equal(claimQuoteView(remembered, 'tape-2', 2), true);
  assert.equal(claimQuoteView(remembered, 'tape-3', 2), true);
  assert.equal(remembered.has('tape-1'), false);
  assert.equal(claimQuoteView(remembered, 'tape-1', 2), true);
});

test('serial write queue preserves mutation order after an earlier failure', async () => {
  const queue = createSerialWriteQueue();
  const events: string[] = [];

  const first = queue(async () => {
    events.push('first:start');
    await new Promise(resolve => setTimeout(resolve, 5));
    events.push('first:fail');
    throw new Error('simulated storage failure');
  }).catch(() => {});
  const second = queue(async () => {
    events.push('second:start');
    events.push('second:finish');
  });

  await Promise.all([first, second]);
  assert.deepEqual(events, ['first:start', 'first:fail', 'second:start', 'second:finish']);
});