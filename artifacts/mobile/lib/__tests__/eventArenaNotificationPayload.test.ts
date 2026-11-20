import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildEventArenaNotificationRequest,
  isEventArenaNotification,
  readEventArenaNotificationMetadata,
} from '../eventArenaNotificationPayload.ts';

const reminder = {
  eventId: 'lightning-2026-11-27',
  kind: 'lightning-round-midpoint',
  scheduledAtMs: 1795833000000,
  title: 'Halfway update',
  body: 'Check standings',
};

test('Android schedule contains no JSONObject data payload and retains metadata in its identifier', () => {
  const request = buildEventArenaNotificationRequest(reminder, true);
  assert.equal('data' in request.content, false);
  assert.equal(request.trigger.date, reminder.scheduledAtMs);
  assert.equal(request.trigger.channelId, 'paper-event-reminders');
  assert.deepEqual(readEventArenaNotificationMetadata(request), {
    type: reminder.kind, eventId: reminder.eventId, scheduledAtMs: reminder.scheduledAtMs,
  });
  assert.equal(isEventArenaNotification(request), true);
  assert.deepEqual(JSON.parse(JSON.stringify(request)), request);
  assert.equal(buildEventArenaNotificationRequest(reminder, true).identifier, request.identifier);
});

test('iOS keeps its data and reads both current and legacy reminders', () => {
  const request = buildEventArenaNotificationRequest(reminder, false);
  assert.equal('channelId' in request.trigger, false);
  assert.deepEqual(readEventArenaNotificationMetadata(request), request.content.data);
  const legacy = { identifier: 'old-generated-id', content: { data: {
    type: 'event-start', eventId: '2026-11-16', scheduledAtMs: 123,
  } } };
  assert.deepEqual(readEventArenaNotificationMetadata(legacy), legacy.content.data);
  assert.equal(isEventArenaNotification(legacy), true);
});

test('unrelated price alerts are not included in Event Arena cleanup', () => {
  const priceAlert = { identifier: 'price-alert', content: { data: { type: 'price-alert' } } };
  assert.equal(isEventArenaNotification(priceAlert), false);
  assert.equal(readEventArenaNotificationMetadata(priceAlert), null);
  assert.equal(readEventArenaNotificationMetadata({ identifier: 'event-arena-reminder-v2:%broken' }), null);
});
