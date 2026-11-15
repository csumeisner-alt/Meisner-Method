import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  getRegularEventCalendarError,
  getRegularEventSequenceIndex,
  hasRegularEventWindowOverlap,
  REGULAR_EVENT_CALENDAR,
  REGULAR_EVENT_CALENDAR_ERROR,
} from '../paperChallengeCalendar.ts';
import { getLightningRoundWindow, getPaperChallengeReminders } from '../paperChallenge.ts';

const here = dirname(fileURLToPath(import.meta.url));

test('regular event duration must remain shorter than cadence', () => {
  const calendar = REGULAR_EVENT_CALENDAR as unknown as {
    cadenceDays: number;
    durationDays: number;
  };
  const originalDurationDays = calendar.durationDays;
  try {
    calendar.durationDays = calendar.cadenceDays - 1;
    assert.equal(getRegularEventCalendarError(), null);
    assert.equal(getRegularEventSequenceIndex('2026-11-16'), 0);

    for (const durationDays of [calendar.cadenceDays, calendar.cadenceDays + 1]) {
      calendar.durationDays = durationDays;
      assert.equal(getRegularEventCalendarError(), REGULAR_EVENT_CALENDAR_ERROR);
      assert.equal(getRegularEventSequenceIndex('2026-11-16'), null);
      assert.equal(hasRegularEventWindowOverlap(1_000, 2_000), true);
      assert.deepEqual(getPaperChallengeReminders(), []);
      assert.throws(
        () => getLightningRoundWindow(Date.parse('2026-11-21T16:00:00.000Z')),
        new RegExp(REGULAR_EVENT_CALENDAR_ERROR.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')),
      );
    }
  } finally {
    calendar.durationDays = originalDurationDays;
  }
});

test('Event Arena screen exposes the shared calendar error accessibly', async () => {
  const source = await readFile(resolve(here, '../../components/EventArenaScreen.tsx'), 'utf8');
  const historySource = await readFile(resolve(here, '../../components/PaperChallengeHistory.tsx'), 'utf8');
  const lightningSource = await readFile(resolve(here, '../../components/LightningRoundScreen.tsx'), 'utf8');
  assert.match(source, /getRegularEventCalendarError\(\)/);
  assert.match(source, /testID="event-arena-calendar-error"/);
  assert.match(source, /accessibilityRole="alert"/);
  assert.match(historySource, /getRegularEventCalendarError\(\)/);
  assert.match(historySource, /testID="paper-event-calendar-error"/);
  assert.match(historySource, /!calendarError && !hasCurrentEnrollment/);
  assert.match(lightningSource, /getRegularEventCalendarError\(\)/);
  assert.match(lightningSource, /testID="lightning-round-calendar-error"/);
});
