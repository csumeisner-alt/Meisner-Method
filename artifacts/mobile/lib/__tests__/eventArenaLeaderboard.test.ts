import assert from 'node:assert/strict';
import test from 'node:test';
import {
  formatEventArenaReturn,
  formatEventArenaSignedMoney,
  getEventArenaOwnEntry,
  getEventArenaPodiumSlots,
  getEventArenaProfitLossTone,
  getEventArenaReturnTone,
  getEventArenaStandingsEntries,
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

test('podium presentation handles zero through three real participants without inventing entries', () => {
  const participants = [1, 2, 3].map((rank) => ({
    rank,
    alias: `Rank ${rank}`,
    isCurrentUser: false,
  }));

  for (let count = 0; count <= 3; count += 1) {
    const podium = getEventArenaPodiumSlots(participants.slice(0, count));
    assert.deepEqual(
      podium.map(({ entry }) => entry?.alias ?? null),
      [1, 2, 3].map((rank) => rank <= count ? `Rank ${rank}` : null),
    );
  }
});

test('larger fields keep the top three separate from competitive standings', () => {
  const participants = Array.from({ length: 8 }, (_, index) => ({
    rank: index + 1,
    alias: `Rank ${index + 1}`,
    isCurrentUser: index === 6,
  }));

  assert.deepEqual(getEventArenaPodiumSlots(participants).map(({ entry }) => entry?.rank), [1, 2, 3]);
  assert.deepEqual(getEventArenaStandingsEntries(participants).map(({ rank }) => rank), [4, 5, 6, 7, 8]);
  assert.equal(getEventArenaOwnEntry(participants, true)?.rank, 7);
});

test('current participant stays in the actual podium or standings position and respects opt-in', () => {
  const podiumEntry = { rank: 2, alias: 'My alias', isCurrentUser: true };
  const standingsEntry = { rank: 5, alias: 'My alias', isCurrentUser: true };

  assert.equal(getEventArenaOwnEntry([podiumEntry], true), podiumEntry);
  assert.equal(getEventArenaOwnEntry([standingsEntry], true), standingsEntry);
  assert.equal(getEventArenaOwnEntry([standingsEntry], false), null);
  assert.equal(getEventArenaOwnEntry([podiumEntry, standingsEntry], true), null);
  assert.deepEqual(getEventArenaStandingsEntries([podiumEntry, standingsEntry]), [standingsEntry]);
});

test('event status and countdown use the scheduled start and end times', () => {
  const start = Date.parse('2026-11-16T14:30:00.000Z');
  const end = Date.parse('2026-11-20T21:00:00.000Z');

  assert.deepEqual(getEventArenaStatus(start, end, start - 90 * 60_000), {
    phase: 'upcoming',
    label: 'Upcoming Competition',
    countdown: 'Starts in 1h 30m',
  });
  assert.deepEqual(getEventArenaStatus(start, end, start + 60_000), {
    phase: 'active',
    label: 'Live Championship',
    countdown: 'Ends in 4d 6h',
  });
  assert.equal(getEventArenaStatus(start, end, start).phase, 'active');
  assert.equal(getEventArenaStatus(start, end, end - 1).phase, 'active');
  assert.deepEqual(getEventArenaStatus(start, end, end), {
    phase: 'ended',
    label: 'Final Results',
    countdown: 'Event complete',
  });
});

test('return colors treat rounded zero as neutral', () => {
  assert.equal(getEventArenaReturnTone(2.5), 'positive');
  assert.equal(getEventArenaReturnTone(-2.5), 'negative');
  assert.equal(getEventArenaReturnTone(0), 'neutral');
  assert.equal(getEventArenaReturnTone(0.001), 'neutral');
  assert.equal(getEventArenaReturnTone(-0.001), 'neutral');
});

test('profit and loss colors match rounded money, including displayed zero', () => {
  assert.equal(getEventArenaProfitLossTone(25), 'positive');
  assert.equal(getEventArenaProfitLossTone(-25), 'negative');
  assert.equal(getEventArenaProfitLossTone(0), 'neutral');
  assert.equal(getEventArenaProfitLossTone(0.001), 'neutral');
  assert.equal(getEventArenaProfitLossTone(-0.001), 'neutral');
});

test('rounded score labels do not show negative zero', () => {
  assert.equal(formatEventArenaReturn(-0.001), '+0.00%');
  assert.equal(formatEventArenaSignedMoney(-0.001), '+$0.00');
  assert.equal(formatEventArenaReturn(-0.01), '-0.01%');
  assert.equal(formatEventArenaSignedMoney(-0.01), '−$0.01');
});
