import assert from 'node:assert/strict';
import test from 'node:test';
import {
  formatEventArenaReturn,
  formatEventArenaSignedMoney,
  getEventArenaPodiumSlots,
  getEventArenaStatus,
} from '../eventArenaLeaderboard.ts';

test('podium slots follow rank order and leave missing places empty', () => {
  const participants = [
    { rank: 4, alias: 'Fourth', equity: 99_000 },
    { rank: 2, alias: 'Silver', equity: 101_000 },
    { rank: 1, alias: 'Gold', equity: 102_000 },
  ];
  const podium = getEventArenaPodiumSlots(participants);

  assert.deepEqual(podium.map(({ rank, entry }) => [rank, entry?.alias ?? null]), [
    [1, 'Gold'],
    [2, 'Silver'],
    [3, null],
  ]);
  assert.equal(podium[0].entry?.equity, 102_000);
  assert.deepEqual(
    getEventArenaPodiumSlots([]).map(({ entry }) => entry),
    [null, null, null],
  );
});

test('event status and countdown use the scheduled start and end times', () => {
  const start = Date.parse('2026-11-16T14:30:00.000Z');
  const end = Date.parse('2026-11-20T21:00:00.000Z');

  assert.deepEqual(getEventArenaStatus(start, end, start - 90 * 60_000), {
    phase: 'upcoming',
    label: 'Upcoming',
    countdown: 'Starts in 1h 30m',
  });
  assert.deepEqual(getEventArenaStatus(start, end, start + 60_000), {
    phase: 'active',
    label: 'Live now',
    countdown: 'Ends in 4d 6h',
  });
  assert.deepEqual(getEventArenaStatus(start, end, end), {
    phase: 'ended',
    label: 'Complete',
    countdown: 'Event complete',
  });
});

test('rounded score labels do not show negative zero', () => {
  assert.equal(formatEventArenaReturn(-0.001), '+0.00%');
  assert.equal(formatEventArenaSignedMoney(-0.001), '+$0.00');
  assert.equal(formatEventArenaReturn(-0.01), '-0.01%');
  assert.equal(formatEventArenaSignedMoney(-0.01), '−$0.01');
});
