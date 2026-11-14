import test from 'node:test';
import assert from 'node:assert/strict';
import {
  formatPaperEventCountdown,
  getPaperEventDashboardPhase,
  getPaperEventDashboardProgress,
  getPaperEventDashboardRank,
} from '../paperEventDashboard.ts';

const start = 1_000_000;
const end = 1_100_000;

test('dashboard phase and countdown use the saved event timestamps', () => {
  assert.equal(getPaperEventDashboardPhase(start, end, start - 1), 'upcoming');
  assert.equal(formatPaperEventCountdown(start, end, start - 1), 'Starts in 1s');
  assert.equal(getPaperEventDashboardPhase(start, end, start), 'active');
  assert.equal(formatPaperEventCountdown(start, end, start), 'Ends in 1m 40s');
  assert.equal(getPaperEventDashboardPhase(start, end, end), 'ended');
  assert.equal(formatPaperEventCountdown(start, end, end), 'Event complete');
});

test('dashboard progress clamps at the event boundaries', () => {
  assert.equal(getPaperEventDashboardProgress(start, end, start - 1), 0);
  assert.equal(getPaperEventDashboardProgress(start, end, start + 50_000), 50);
  assert.equal(getPaperEventDashboardProgress(start, end, end + 1), 100);
  assert.equal(getPaperEventDashboardProgress(start, start, start), 0);
  assert.equal(getPaperEventDashboardPhase(Number.NaN, end, start), 'unavailable');
  assert.equal(formatPaperEventCountdown(start, start, start), 'Schedule unavailable');
});

test('only actual positive ranks receive a podium or placement label', () => {
  assert.deepEqual(getPaperEventDashboardRank(1), { label: 'CHAMPION · 1ST', medal: 'GOLD' });
  assert.deepEqual(getPaperEventDashboardRank(2), { label: 'SILVER · 2ND', medal: 'SILVER' });
  assert.deepEqual(getPaperEventDashboardRank(3), { label: 'BRONZE · 3RD', medal: 'BRONZE' });
  assert.deepEqual(getPaperEventDashboardRank(8), { label: '#8 PLACE', medal: null });
  assert.equal(getPaperEventDashboardRank(null), null);
  assert.equal(getPaperEventDashboardRank(0), null);
});
