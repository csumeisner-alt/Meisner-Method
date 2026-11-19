import assert from 'node:assert/strict';
import test from 'node:test';
import {
  getEventArenaReminderKey,
  replaceEventArenaReminderSchedule,
  type EventArenaReminderDefinition,
  type ExistingEventArenaReminder,
} from '../eventArenaReminderSchedule.ts';

const makeReminder = (
  eventId: string,
  kind: string,
  scheduledAtMs: number,
): EventArenaReminderDefinition => ({
  eventId,
  kind,
  scheduledAtMs,
  title: `${eventId} ${kind}`,
  body: `${eventId} ${kind} body`,
});

test('Event Arena reminder keys include event, kind, and exact scheduled time', () => {
  assert.equal(
    getEventArenaReminderKey(makeReminder('event-a', 'event-start', 100)),
    'event-a:event-start:100',
  );
  assert.notEqual(
    getEventArenaReminderKey(makeReminder('event-a', 'event-start', 100)),
    getEventArenaReminderKey(makeReminder('event-a', 'event-start', 101)),
  );
});

test('refresh reuses matching reminders and cancels only obsolete Event Arena reminders', async () => {
  const existing: ExistingEventArenaReminder[] = [
    { ...makeReminder('event-a', 'event-start', 100), id: 'keep-me' },
    { ...makeReminder('event-a', 'event-midweek', 200), id: 'old-midweek' },
    { ...makeReminder('event-a', 'event-start', 100), id: 'duplicate' },
  ];
  const scheduled: string[] = [];
  const cancelled: string[] = [];
  const persisted: string[][] = [];
  const result = await replaceEventArenaReminderSchedule({
    existing,
    legacyIds: ['legacy-notification'],
    desired: [
      makeReminder('event-a', 'event-start', 100),
      makeReminder('event-b', 'event-start', 300),
    ],
    schedule: async (reminder) => {
      const id = `new-${reminder.eventId}`;
      scheduled.push(id);
      return id;
    },
    persistIds: async (ids) => { persisted.push(ids); },
    cancel: async (id) => { cancelled.push(id); },
  });

  assert.deepEqual(scheduled, ['new-event-b']);
  assert.deepEqual(result.ids, ['keep-me', 'new-event-b']);
  assert.deepEqual(persisted, [['keep-me', 'new-event-b']]);
  assert.deepEqual(cancelled.sort(), ['duplicate', 'legacy-notification', 'old-midweek']);
  assert.equal(result.cleanupFailures, 0);
});

test('a failed schedule keeps the previous saved schedule and cleans up partial additions', async () => {
  const existing: ExistingEventArenaReminder[] = [
    { ...makeReminder('event-a', 'event-start', 100), id: 'existing' },
  ];
  const cancelled: string[] = [];
  let persisted = false;

  await assert.rejects(
    replaceEventArenaReminderSchedule({
      existing,
      legacyIds: [],
      desired: [
        makeReminder('event-a', 'event-start', 100),
        makeReminder('event-b', 'event-start', 300),
        makeReminder('event-c', 'event-start', 400),
      ],
      schedule: async (reminder) => {
        if (reminder.eventId === 'event-c') throw new Error('OS scheduling failed');
        return `new-${reminder.eventId}`;
      },
      persistIds: async () => { persisted = true; },
      cancel: async (id) => { cancelled.push(id); },
    }),
    /Could not schedule “event-c event-start”: OS scheduling failed/,
  );

  assert.deepEqual(cancelled, ['new-event-b']);
  assert.equal(persisted, false);
});

test('a storage failure removes newly scheduled reminders without cancelling the old schedule', async () => {
  const cancelled: string[] = [];
  await assert.rejects(
    replaceEventArenaReminderSchedule({
      existing: [{ ...makeReminder('event-a', 'event-start', 100), id: 'existing' }],
      legacyIds: [],
      desired: [
        makeReminder('event-a', 'event-start', 100),
        makeReminder('event-b', 'event-start', 300),
      ],
      schedule: async () => 'new-event-b',
      persistIds: async () => { throw new Error('storage unavailable'); },
      cancel: async (id) => { cancelled.push(id); },
    }),
    /storage unavailable/,
  );
  assert.deepEqual(cancelled, ['new-event-b']);
});
