import assert from 'node:assert/strict';
import test from 'node:test';
import { finishWatchlistDrag } from '../watchlistDrag.ts';
import { claimMainTabNavigation, reserveInteraction, releaseInteraction, isInteractionReserved } from '../interactionOwnership.ts';
import { requestHeatMapSummary } from '../heatMapSummaryRequest.ts';
import { getAdjacentPaperAccountId } from '../paperAccountManagement.ts';

test('repeated drags move the touched symbol after reorder and cancel safely on list changes', () => {
  const original = ['AAPL', 'MSFT', 'NVDA', 'SPY'];
  const reordered = finishWatchlistDrag(original, original, 'MSFT', 3, true)!;
  assert.deepEqual(reordered, ['AAPL', 'NVDA', 'SPY', 'MSFT']);
  assert.deepEqual(finishWatchlistDrag(reordered, reordered, 'NVDA', 3, true), ['AAPL', 'SPY', 'MSFT', 'NVDA']);
  assert.equal(finishWatchlistDrag(reordered, original, 'MSFT', 0, true), null);
  assert.equal(finishWatchlistDrag(['NVDA', 'SPY'], original, 'MSFT', 0, true), null);
  assert.equal(finishWatchlistDrag(original, original, 'MSFT', 3, false), null);
  assert.equal(finishWatchlistDrag(original, original, 'MSFT', 20, true), null);
  assert.deepEqual(original, ['AAPL', 'MSFT', 'NVDA', 'SPY']);
});

test('nested accounts own horizontal input at boundaries and navigation rejects rapid duplicate dispatches', () => {
  const accountOwner = {};
  const dragOwner = {};
  reserveInteraction(accountOwner);
  reserveInteraction(dragOwner);
  assert.equal(isInteractionReserved(), true);
  releaseInteraction(accountOwner);
  assert.equal(isInteractionReserved(), true);
  releaseInteraction(dragOwner);
  assert.equal(isInteractionReserved(), false);
  assert.equal(claimMainTabNavigation(1000), true);
  assert.equal(claimMainTabNavigation(1000), false);
  assert.equal(claimMainTabNavigation(1649), false);
  assert.equal(claimMainTabNavigation(1650), true);
  const accounts = [{ id: 'tiger' }, { id: 'borg' }, { id: 'paper-event:one' }];
  assert.equal(getAdjacentPaperAccountId(accounts, 'tiger', -1), 'tiger');
  assert.equal(getAdjacentPaperAccountId(accounts, 'tiger', 1), 'borg');
  assert.equal(getAdjacentPaperAccountId(accounts, 'borg', 1), 'paper-event:one');
  assert.equal(getAdjacentPaperAccountId(accounts, 'paper-event:one', 1), 'paper-event:one');
});

test('missing split summary route uses real info data but provider failures remain failures', async () => {
  let fallbackCalls = 0;
  const reported: { symbol: string; dayLow: number | null; dayHigh: number | null; beta: null } =
    { symbol: 'AAPL', dayLow: 100, dayHigh: 110, beta: null };
  const fallback = async () => { fallbackCalls++; return reported; };
  const missingRoute = Object.assign(new Error('Cannot GET summary'), { status: 404 });
  assert.equal(await requestHeatMapSummary(async () => { throw missingRoute; }, fallback), reported);
  assert.equal(fallbackCalls, 1);
  for (const status of [429, 500, 503, 504]) {
    const failure = Object.assign(new Error('Provider failure'), { status });
    await assert.rejects(requestHeatMapSummary(async () => { throw failure; }, fallback), failure);
  }
  const unreported = { symbol: 'AAPL', dayLow: null, dayHigh: null, beta: null };
  assert.equal(await requestHeatMapSummary(async () => unreported, fallback), unreported);
  assert.equal(fallbackCalls, 1);
});
