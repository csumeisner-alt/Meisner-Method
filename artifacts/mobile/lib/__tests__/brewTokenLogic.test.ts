import assert from 'node:assert/strict';
import test from 'node:test';
import {
  BREW_BANK_ACCESS_DURATION_MS,
  BREW_BANK_KEY_PRICE,
  claimQuoteView,
  BREW_TOKEN_QUOTE_THRESHOLD,
  createSerialWriteQueue,
  buyBrewBankKey,
  canEnterBrewBank,
  canActivateBrewBankKey,
  formatBrewBankAccessRemaining,
  hasBrewBankAccess,
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

test('bank keys cost ten tokens and never overspend', () => {
  assert.deepEqual(buyBrewBankKey(12, 1), { tokenBalance: 2, keyCount: 2 });
  assert.equal(buyBrewBankKey(BREW_BANK_KEY_PRICE - 1, 0), null);
});

test('bank key access can only activate on weekdays and lasts twelve hours', () => {
  const mondayMorning = new Date('2026-08-17T09:00:00').getTime();
  assert.equal(canActivateBrewBankKey(1, 1, null, mondayMorning), true);
  assert.equal(canActivateBrewBankKey(1, 0, null, mondayMorning), false);
  assert.equal(canActivateBrewBankKey(1, 1, mondayMorning + 1_000, mondayMorning), false);
  assert.equal(hasBrewBankAccess(mondayMorning + BREW_BANK_ACCESS_DURATION_MS, mondayMorning), true);
  assert.equal(hasBrewBankAccess(mondayMorning + BREW_BANK_ACCESS_DURATION_MS, mondayMorning + BREW_BANK_ACCESS_DURATION_MS), false);
});

test('weekday bank entry requires redeemed active access', () => {
  const mondayMorning = new Date('2026-08-17T09:00:00').getTime();
  assert.equal(canEnterBrewBank(1, null, mondayMorning), false);
  assert.equal(canEnterBrewBank(1, mondayMorning + 1_000, mondayMorning), true);
  assert.equal(canEnterBrewBank(0, null, mondayMorning), true);
});

test('bank access countdown formats remaining hours and minutes and expires at zero', () => {
  const now = new Date('2026-08-17T09:00:00').getTime();
  assert.equal(formatBrewBankAccessRemaining(now + 2 * 60 * 60 * 1000 + 31_000, now), '2h 01m remaining');
  assert.equal(formatBrewBankAccessRemaining(now + 59_000, now), '0h 01m remaining');
  assert.equal(formatBrewBankAccessRemaining(now, now), null);
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