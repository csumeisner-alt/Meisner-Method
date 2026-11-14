import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  getEventArenaChartHistory,
  getEventArenaCountdown,
  getEventArenaParticipation,
  getEventArenaPerformance,
  selectEventArenaWindow,
} from '../eventArenaHome.ts';
import type { PaperChallengeEnrollment, PaperChallengeWindow } from '../paperChallenge.ts';

const event: PaperChallengeWindow = {
  id: '2026-11-16',
  startAtMs: Date.parse('2026-11-16T14:30:00.000Z'),
  endAtMs: Date.parse('2026-11-20T21:00:00.000Z'),
  phase: 'active',
};

const enrollment: PaperChallengeEnrollment = {
  eventId: event.id,
  eventStartAtMs: event.startAtMs,
  eventEndAtMs: event.endAtMs,
  joinedAtMs: event.startAtMs,
  accountId: `paper-event:${event.id}`,
  accountName: 'Event Portfolio',
  startEquity: 100_000,
};

test('event selection uses the selected available event and safely falls back to current', () => {
  const past: PaperChallengeWindow = {
    id: '2026-11-02',
    startAtMs: event.startAtMs - 14 * 86_400_000,
    endAtMs: event.endAtMs - 14 * 86_400_000,
    phase: 'ended',
  };
  assert.equal(selectEventArenaWindow(event, [past], past.id), past);
  assert.equal(selectEventArenaWindow(event, [past], event.id), event);
  assert.equal(selectEventArenaWindow(event, [past], 'missing-event'), event);
  assert.equal(selectEventArenaWindow(event, [past], null), event);
});

test('countdown changes target at exact event boundaries and never goes negative', () => {
  const beforeStart = getEventArenaCountdown(event, event.startAtMs - 90_061);
  assert.equal(beforeStart.mode, 'starts');
  assert.deepEqual(
    [beforeStart.days, beforeStart.hours, beforeStart.minutes, beforeStart.seconds],
    [0, 0, 1, 30],
  );

  const atStart = getEventArenaCountdown(event, event.startAtMs);
  assert.equal(atStart.mode, 'ends');
  assert.equal(atStart.remainingMs, event.endAtMs - event.startAtMs);

  const atEnd = getEventArenaCountdown(event, event.endAtMs);
  assert.equal(atEnd.mode, 'ends');
  assert.equal(atEnd.remainingMs, 0);
  const afterEnd = getEventArenaCountdown(event, event.endAtMs + 1);
  assert.equal(afterEnd.mode, 'ended');
  assert.equal(afterEnd.remainingMs, 0);
});

test('participation states preserve the one-enrollment rule around event boundaries', () => {
  assert.equal(getEventArenaParticipation(event, enrollment, event.startAtMs), 'joined');
  assert.equal(getEventArenaParticipation(event, null, event.startAtMs - 1), 'eligible');
  assert.equal(getEventArenaParticipation(event, null, event.endAtMs + 1), 'event-ended');
  assert.equal(getEventArenaParticipation(event, {
    ...enrollment,
    eventId: '2026-11-02',
    eventEndAtMs: event.startAtMs + 1,
  }, event.startAtMs), 'finish-previous');
  assert.equal(getEventArenaParticipation(event, {
    ...enrollment,
    eventId: '2026-11-02',
    eventEndAtMs: event.startAtMs,
  }, event.startAtMs), 'results-pending');
});

test('performance uses only the enrolled event account and counts completed event trades', () => {
  const performance = getEventArenaPerformance(enrollment, event, {
    accounts: [
      { id: 'paper-main', name: 'Main', cash: 10_000, createdAt: '2026-01-01T00:00:00.000Z' },
      { id: enrollment.accountId, name: 'Event Portfolio', cash: 60_000, unsettledCash: 500, createdAt: '2026-11-16T14:30:00.000Z' },
    ],
    positions: [
      { id: 'event-aapl', accountId: enrollment.accountId, symbol: 'AAPL', companyName: 'Apple', shares: 100, avgCost: 390, openedAt: '2026-11-17T15:00:00.000Z', dividendYield: 0, sector: 'Technology' },
      { id: 'main-msft', accountId: 'paper-main', symbol: 'MSFT', companyName: 'Microsoft', shares: 50, avgCost: 400, openedAt: '2026-11-17T15:00:00.000Z', dividendYield: 0, sector: 'Technology' },
    ],
    transactions: [
      { id: 'event-buy', accountId: enrollment.accountId, symbol: 'AAPL', companyName: 'Apple', action: 'BUY', shares: 100, price: 400, total: 40_000, date: '2026-11-17T15:00:00.000Z' },
      { id: 'event-dividend', accountId: enrollment.accountId, symbol: 'AAPL', companyName: 'Apple', action: 'DIVIDEND', shares: 0, price: 0, total: 20, date: '2026-11-18T15:00:00.000Z' },
      { id: 'other-account-sell', accountId: 'paper-main', symbol: 'MSFT', companyName: 'Microsoft', action: 'SELL', shares: 1, price: 410, total: 410, date: '2026-11-18T15:00:00.000Z' },
      { id: 'outside-window', accountId: enrollment.accountId, symbol: 'AAPL', companyName: 'Apple', action: 'SELL', shares: 1, price: 410, total: 410, date: '2026-11-21T15:00:00.000Z' },
    ],
    orders: [
      { id: 'pending-event', accountId: enrollment.accountId, symbol: 'AAPL', companyName: 'Apple', orderType: 'limit', side: 'buy', shares: 1, status: 'pending', placedAt: '2026-11-18T15:00:00.000Z' },
      { id: 'filled-event', accountId: enrollment.accountId, symbol: 'AAPL', companyName: 'Apple', orderType: 'market', side: 'buy', shares: 1, status: 'filled', placedAt: '2026-11-17T15:00:00.000Z' },
    ],
    snapshots: [
      { accountId: enrollment.accountId, date: '2026-11-16T14:30:00.000Z', value: 100_000 },
      { accountId: 'paper-main', date: '2026-11-18T16:00:00.000Z', value: 999_999 },
    ],
  }, { AAPL: 405, MSFT: 500 }, Date.parse('2026-11-19T16:00:00.000Z'));

  assert.equal(performance.equity, 101_000);
  assert.equal(performance.profitLoss, 1_000);
  assert.equal(performance.returnPercent, 1);
  assert.equal(performance.buyingPower, 60_000);
  assert.equal(performance.completedTradeCount, 1);
  assert.deepEqual(performance.pendingOrders.map((order) => order.id), ['pending-event']);
  assert.deepEqual(performance.positions.map((position) => position.id), ['event-aapl']);
  assert.deepEqual(performance.chartPoints, [{ date: '2026-11-16T14:30:00.000Z', value: 100_000 }]);
});

test('equity is unavailable rather than estimated when a held position has no valid quote', () => {
  const performance = getEventArenaPerformance(enrollment, event, {
    accounts: [{ id: enrollment.accountId, name: 'Event Portfolio', cash: 75_000, createdAt: '2026-11-16T14:30:00.000Z' }],
    positions: [{ id: 'event-aapl', accountId: enrollment.accountId, symbol: 'AAPL', companyName: 'Apple', shares: 50, avgCost: 400, openedAt: '2026-11-17T15:00:00.000Z', dividendYield: 0, sector: 'Technology' }],
    transactions: [],
    orders: [],
    snapshots: [],
  }, {}, Date.parse('2026-11-19T16:00:00.000Z'));
  assert.equal(performance.equity, null);
  assert.equal(performance.profitLoss, null);
  assert.equal(performance.returnPercent, null);
  assert.equal(performance.buyingPower, 75_000);
  assert.deepEqual(performance.chartPoints, []);
});

test('event chart includes only real snapshots for this event account inside event dates', () => {
  const points = getEventArenaChartHistory([
    { accountId: enrollment.accountId, date: '2026-11-16T14:30:00.000Z', value: 100_000 },
    { accountId: enrollment.accountId, date: '2026-11-18T16:00:00.000Z', value: 101_000 },
    { accountId: enrollment.accountId, date: '2026-11-21T16:00:00.000Z', value: 105_000 },
    { accountId: 'paper-main', date: '2026-11-18T16:00:00.000Z', value: 500_000 },
  ], enrollment.accountId, event, Date.parse('2026-11-20T20:00:00.000Z'));
  assert.deepEqual(points, [
    { date: '2026-11-16T14:30:00.000Z', value: 100_000 },
    { date: '2026-11-18T16:00:00.000Z', value: 101_000 },
  ]);
  assert.deepEqual(
    getEventArenaChartHistory([], enrollment.accountId, event, Date.parse('2026-11-20T20:00:00.000Z')),
    [],
  );
});

test('Event Arena is a dedicated destination with separate competition sections', async () => {
  const testDirectory = dirname(fileURLToPath(import.meta.url));
  const screen = await readFile(resolve(testDirectory, '../../components/EventArenaScreen.tsx'), 'utf8');
  const overview = await readFile(resolve(testDirectory, '../../components/EventArenaOverview.tsx'), 'utf8');
  const route = await readFile(resolve(testDirectory, '../../app/event-arena.tsx'), 'utf8');
  const paper = await readFile(resolve(testDirectory, '../../app/paper.tsx'), 'utf8');
  const tabs = await readFile(resolve(testDirectory, '../../components/BottomTabBar.tsx'), 'utf8');
  const settings = await readFile(resolve(testDirectory, '../../components/DonationSidebar.tsx'), 'utf8');
  const leaderboard = await readFile(resolve(testDirectory, '../../components/PaperChallengeLeaderboard.tsx'), 'utf8');

  assert.match(route, /<EventArenaScreen \/>/);
  for (const section of ['competition', 'leaderboard', 'trades', 'past']) {
    assert.match(screen, new RegExp(`id: '${section}'`));
    assert.match(screen, new RegExp(`section === '${section}'`));
  }
  assert.match(tabs, /bottom-tab-event-arena/);
  assert.match(settings, /AlertManagementSection/);
  assert.doesNotMatch(settings, /PaperChallengeHistory/);
  assert.match(screen, /getEventArenaPerformance\(enrollment, currentWindow, accountData, quotes, now\)/);
  assert.match(screen, /onEnrollmentChange=\{updateLeaderboardEnrollment\}/);
  assert.match(screen, /onRankChange=\{setRank\}/);
  assert.match(screen, /const participantAlias = enrollment\?\.leaderboardAlias\?\.trim\(\)/);
  assert.match(screen, /testID="event-arena-header-alias"/);
  assert.match(screen, /\{participantAlias \|\| 'MEISNER'\}/);
  assert.match(overview, /testID="event-arena-sticky-action"/);
  assert.match(screen, /sortPaperChallengeHistory\(store\.history, sortMode\)/);
  assert.match(screen, /accountData\.transactions[\s\S]*item\.accountId === eventAccountId/);
  assert.match(screen, /event-arena-trades-awaiting-start/);
  assert.match(screen, /No event orders can be placed before then/);
  assert.match(screen, /event-arena-open-past-detail-/);
  assert.match(screen, /Trade records are unavailable for this older event/);
  assert.match(screen, /leaderboardAlias: alias,[\s\S]*leaderboardOptedIn: false/);
  assert.match(screen, /testID="event-arena-join-alias"/);
  assert.match(screen, /This name identifies your event entry[\s\S]*separately opt in to leaderboard sharing/);
  assert.match(screen, /embedded/);
  assert.match(leaderboard, /testID="edit-paper-event-leaderboard-alias"/);
  assert.match(leaderboard, /testID="save-paper-event-leaderboard-alias"/);
  assert.match(screen, /router\.push\('\/paper'\)/);
  assert.match(overview, /points=\{chartPoints\}/);
  assert.match(overview, /chartPoints\.length < 2/);
  assert.match(overview, /referenceLine=\{/);
  assert.match(leaderboard, /matchingOwnEntries\.length !== 1/);
  assert.match(leaderboard, /onRankChange\?\.\(matchingOwnEntries\[0\]\?\.rank \?\? null\)/);
  assert.match(leaderboard, /enabled: false/);
  assert.match(paper, /shouldEnsurePaperChallengeAccount\(enrollment, challengeNow\)/);
  assert.match(paper, /Date\.now\(\) < enrollment\.eventStartAtMs/);
});

test('Event Arena signup save failures are visible on web and preserve native alerts', async () => {
  const testDirectory = dirname(fileURLToPath(import.meta.url));
  const screen = await readFile(resolve(testDirectory, '../../components/EventArenaScreen.tsx'), 'utf8');

  assert.match(
    screen,
    /catch \{\s*if \(Platform\.OS === 'web'\) \{\s*setJoinAliasError\('Your event signup was not saved\. Your enrollment is unchanged\. Please try again\.'\);\s*\} else \{\s*Alert\.alert\('Could not join', 'Your event enrollment was not saved\. Please try again\.'\);\s*\}/,
  );
  assert.match(screen, /joinAliasError \? \(\s*<Text accessibilityRole="alert"[^>]*>[\s\S]*?\{joinAliasError\}/);
  assert.match(screen, /const updated = await updatePaperChallengeStore[\s\S]*?setStore\(updated\);[\s\S]*?catch \{/);
});
