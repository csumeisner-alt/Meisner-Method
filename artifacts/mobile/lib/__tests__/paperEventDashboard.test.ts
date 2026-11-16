import test from 'node:test';
import assert from 'node:assert/strict';
import {
  formatPaperEventCountdown,
  getLightningRoundCardPromotionPhase,
  getPaperEventDashboardPhase,
  getPaperEventDashboardProgress,
  getPaperEventDashboardRank,
  getPaperEventDashboardRankText,
} from '../paperEventDashboard.ts';

const start = 1_000_000;
const end = 1_100_000;
const lightningStart = 10_000_000;
const lightningEnd = lightningStart + 24 * 60 * 60 * 1000;

test('Lightning Round card promotion uses exact preparation, event, and post-event boundaries', () => {
  const schedule = { startAtMs: lightningStart, endAtMs: lightningEnd };
  const lead = 72 * 60 * 60 * 1000;
  const postEvent = 24 * 60 * 60 * 1000;

  assert.equal(getLightningRoundCardPromotionPhase(schedule, lightningStart - lead - 1), null);
  assert.equal(getLightningRoundCardPromotionPhase(schedule, lightningStart - lead), 'preparation');
  assert.equal(getLightningRoundCardPromotionPhase(schedule, lightningStart - 1), 'preparation');
  assert.equal(getLightningRoundCardPromotionPhase(schedule, lightningStart), 'active');
  assert.equal(getLightningRoundCardPromotionPhase(schedule, lightningEnd - 1), 'active');
  assert.equal(getLightningRoundCardPromotionPhase(schedule, lightningEnd), 'post-event');
  assert.equal(getLightningRoundCardPromotionPhase(schedule, lightningEnd + postEvent - 1), 'post-event');
  assert.equal(getLightningRoundCardPromotionPhase(schedule, lightningEnd + postEvent), null);
});

test('missing or invalid Lightning Round schedules leave the normal card unpromoted', () => {
  assert.equal(getLightningRoundCardPromotionPhase(null, lightningStart), null);
  assert.equal(getLightningRoundCardPromotionPhase(undefined, lightningStart), null);
  assert.equal(
    getLightningRoundCardPromotionPhase({ startAtMs: lightningStart, endAtMs: lightningStart }, lightningStart),
    null,
  );
  assert.equal(
    getLightningRoundCardPromotionPhase({ startAtMs: Number.NaN, endAtMs: lightningEnd }, lightningStart),
    null,
  );
  assert.equal(
    getLightningRoundCardPromotionPhase({ startAtMs: lightningStart, endAtMs: lightningEnd }, Number.NaN),
    null,
  );
});

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

test('rank status resolves loading, no-rank, upcoming, and unavailable states', () => {
  const base = {
    phase: 'active' as const,
    optedIn: true,
    rank: null,
    hasResponse: false,
    unavailable: false,
  };
  assert.equal(getPaperEventDashboardRankText(base), 'LOADING RANK');
  assert.equal(getPaperEventDashboardRankText({ ...base, hasResponse: true }), 'NOT RANKED');
  assert.equal(getPaperEventDashboardRankText({ ...base, unavailable: true }), 'UNAVAILABLE');
  assert.equal(getPaperEventDashboardRankText({ ...base, rank: 4 }), '#4 PLACE');
  assert.equal(getPaperEventDashboardRankText({ ...base, phase: 'upcoming' }), 'UPCOMING');
  assert.equal(getPaperEventDashboardRankText({ ...base, optedIn: false }), 'NOT RANKED');
  assert.equal(
    getPaperEventDashboardRankText({ ...base, phase: 'unavailable' }),
    'UNAVAILABLE',
  );
});
