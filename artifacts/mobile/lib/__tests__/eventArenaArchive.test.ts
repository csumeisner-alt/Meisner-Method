import assert from 'node:assert/strict';
import test from 'node:test';
import { groupCompletedEventWeeksByYear } from '../eventArenaArchive.ts';

test('completed Event Arena weeks are grouped newest year and week first', () => {
  const weeks = [
    { id: '2025-12-15', startAtMs: Date.parse('2025-12-15T14:30:00.000Z') },
    { id: '2026-02-02', startAtMs: Date.parse('2026-02-02T14:30:00.000Z') },
    { id: '2025-11-17', startAtMs: Date.parse('2025-11-17T14:30:00.000Z') },
    { id: '2026-01-05', startAtMs: Date.parse('2026-01-05T14:30:00.000Z') },
  ];

  const archive = groupCompletedEventWeeksByYear(weeks);

  assert.deepEqual(archive.map(({ year, weeks: yearWeeks }) => ({
    year,
    ids: yearWeeks.map((week) => week.id),
  })), [
    { year: 2026, ids: ['2026-02-02', '2026-01-05'] },
    { year: 2025, ids: ['2025-12-15', '2025-11-17'] },
  ]);
  assert.deepEqual(weeks.map((week) => week.id), [
    '2025-12-15',
    '2026-02-02',
    '2025-11-17',
    '2026-01-05',
  ]);
});

test('completed Event Arena archive groups remain empty when there are no weeks', () => {
  assert.deepEqual(groupCompletedEventWeeksByYear([]), []);
});
