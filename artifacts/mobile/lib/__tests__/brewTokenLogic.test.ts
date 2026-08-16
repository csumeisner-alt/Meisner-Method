import assert from 'node:assert/strict';
import test from 'node:test';
import {
  BREW_TOKEN_QUOTE_THRESHOLD,
  INITIAL_BREW_TOKENS,
  isBrewBankUnlock,
  isWeekday,
  parseStoredNonNegative,
  resolveBrewBet,
} from '../brewTokenLogic.ts';

test('Brew Bank unlocks exactly when the quote threshold is crossed', () => {
  assert.equal(isBrewBankUnlock(BREW_TOKEN_QUOTE_THRESHOLD - 1, BREW_TOKEN_QUOTE_THRESHOLD), true);
  assert.equal(isBrewBankUnlock(BREW_TOKEN_QUOTE_THRESHOLD, BREW_TOKEN_QUOTE_THRESHOLD + 1), false);
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