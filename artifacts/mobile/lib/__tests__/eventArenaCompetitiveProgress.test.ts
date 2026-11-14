import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  getEventArenaCompetitiveBadges,
  getEventArenaCompetitiveChanges,
  getEventArenaNextRankReturnGap,
  getEventArenaWindowProgress,
  type CompetitiveEntry,
} from '../eventArenaCompetitiveProgress.ts';

function participant(overrides: Partial<CompetitiveEntry> = {}): CompetitiveEntry {
  return {
    participantToken: 'participant-a',
    rank: 5,
    profitLoss: 0,
    returnPercent: 2,
    tradeCount: null,
    ...overrides,
  };
}

test('ACTIVE TRADER requires at least 25 reported trades', () => {
  assert.equal(getEventArenaCompetitiveBadges(4, 24).includes('ACTIVE TRADER'), false);
  assert.equal(getEventArenaCompetitiveBadges(4, 25).includes('ACTIVE TRADER'), true);
  assert.equal(getEventArenaCompetitiveBadges(4, null).includes('ACTIVE TRADER'), false);
});

test('rank and comeback badges require matching records in both successful responses', () => {
  const previous = [
    participant({ rank: 8, profitLoss: 0 }),
    participant({ participantToken: 'two', rank: 4, profitLoss: -12 }),
    participant({ participantToken: 'three', rank: 6, profitLoss: 4 }),
  ];
  const current = [
    participant({ rank: 5, profitLoss: 2 }),
    participant({ participantToken: 'two', rank: 2, profitLoss: 3 }),
    participant({ participantToken: 'three', rank: 3, profitLoss: 8 }),
    participant({ participantToken: 'new', rank: 1, profitLoss: 10 }),
  ];

  const changes = getEventArenaCompetitiveChanges(previous, current);
  assert.deepEqual(changes.get('participant-a'), { placesMoved: 3, risingStar: true, comeback: true });
  assert.deepEqual(changes.get('two'), { placesMoved: 2, risingStar: false, comeback: true });
  assert.deepEqual(changes.get('three'), { placesMoved: 3, risingStar: true, comeback: false });
  assert.equal(changes.has('new'), false);
  assert.deepEqual(getEventArenaCompetitiveChanges(null, current), new Map());
});

test('COMEBACK recognizes zero or negative to positive only', () => {
  const previous = [
    participant({ profitLoss: 0 }),
    participant({ participantToken: 'negative', profitLoss: -1 }),
    participant({ participantToken: 'already-positive', profitLoss: 1 }),
  ];
  const current = [
    participant({ profitLoss: 0.01 }),
    participant({ participantToken: 'negative', profitLoss: 1 }),
    participant({ participantToken: 'already-positive', profitLoss: 2 }),
  ];
  const changes = getEventArenaCompetitiveChanges(previous, current);
  assert.equal(changes.get('participant-a')?.comeback, true);
  assert.equal(changes.get('negative')?.comeback, true);
  assert.equal(changes.get('already-positive')?.comeback, false);
});

test('rank badges follow current position and require no fabricated history', () => {
  assert.deepEqual(getEventArenaCompetitiveBadges(1, null), ['CHAMPION']);
  assert.deepEqual(getEventArenaCompetitiveBadges(2, null), ['PODIUM FINISH']);
  assert.deepEqual(getEventArenaCompetitiveBadges(4, null), []);
});

test('next-rank return gap requires the immediately higher rank and both returns', () => {
  const own = { rank: 4, returnPercent: 1.25 };
  assert.equal(getEventArenaNextRankReturnGap(own, [
    { rank: 2, returnPercent: 4 },
  ]), null);
  assert.equal(getEventArenaNextRankReturnGap(own, [
    { rank: 3, returnPercent: 2 },
  ]), 0.75);
  assert.equal(getEventArenaNextRankReturnGap(own, [
    { rank: 3, returnPercent: Number.NaN },
  ]), null);
  assert.equal(getEventArenaNextRankReturnGap({ rank: 1, returnPercent: 2 }, [
    { rank: 0, returnPercent: 3 },
  ]), null);
});

test('event progress follows the scheduled window and clamps outside it', () => {
  assert.equal(getEventArenaWindowProgress(100, 200, 50), 0);
  assert.equal(getEventArenaWindowProgress(100, 200, 100), 0);
  assert.equal(getEventArenaWindowProgress(100, 200, 150), 50);
  assert.equal(getEventArenaWindowProgress(100, 200, 200), 100);
  assert.equal(getEventArenaWindowProgress(100, 200, 250), 100);
  assert.equal(getEventArenaWindowProgress(100, 100, 100), 0);
});
