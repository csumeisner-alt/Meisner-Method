import { test } from 'node:test';
import assert from 'node:assert/strict';
import { matchesFilter, mergeReorderedSubset, syncLocalOrder } from '../watchlistFilter.ts';

test('syncLocalOrder: full → filtered subset → clear filter restores canonical order', () => {
  const full = ['A', 'B', 'C', 'D', 'E', 'F'];
  // Apply filter: subset arrives — adopt subset order
  const filtered = syncLocalOrder(full, ['B', 'D']);
  assert.deepEqual(filtered, ['B', 'D']);
  // Clear filter: full list arrives — must match canonical order, not keep+append
  const restored = syncLocalOrder(filtered, full);
  assert.deepEqual(restored, full);
});

test('syncLocalOrder: identical set keeps local (optimistic drag) order', () => {
  assert.deepEqual(syncLocalOrder(['C', 'A', 'B'], ['A', 'B', 'C']), ['C', 'A', 'B']);
});

test('syncLocalOrder: add/remove adopts incoming order exactly', () => {
  assert.deepEqual(syncLocalOrder(['A', 'B'], ['A', 'B', 'C']), ['A', 'B', 'C']);
  assert.deepEqual(syncLocalOrder(['A', 'B', 'C'], ['C', 'A']), ['C', 'A']);
});

test('matchesFilter: empty query matches all', () => {
  assert.equal(matchesFilter('AAPL', ''), true);
  assert.equal(matchesFilter('AAPL', '   '), true);
});

test('matchesFilter: case-insensitive substring', () => {
  assert.equal(matchesFilter('AAPL', 'aap'), true);
  assert.equal(matchesFilter('AAPL', 'PL'), true);
  assert.equal(matchesFilter('AAPL', 'TSLA'), false);
});

test('mergeReorderedSubset: identity when subset unchanged', () => {
  const full = ['A', 'B', 'C', 'D'];
  assert.deepEqual(mergeReorderedSubset(full, ['B', 'D']), full);
});

test('mergeReorderedSubset: swaps subset members within their slots', () => {
  const full = ['A', 'B', 'C', 'D', 'E'];
  // Filtered subset was [B, D]; user dragged D above B.
  assert.deepEqual(mergeReorderedSubset(full, ['D', 'B']), ['A', 'D', 'C', 'B', 'E']);
});

test('mergeReorderedSubset: full-list reorder passes through', () => {
  const full = ['A', 'B', 'C'];
  assert.deepEqual(mergeReorderedSubset(full, ['C', 'A', 'B']), ['C', 'A', 'B']);
});

test('mergeReorderedSubset: non-members keep positions', () => {
  const full = ['X', 'A', 'Y', 'B', 'Z', 'C'];
  assert.deepEqual(mergeReorderedSubset(full, ['C', 'B', 'A']), ['X', 'C', 'Y', 'B', 'Z', 'A']);
});
