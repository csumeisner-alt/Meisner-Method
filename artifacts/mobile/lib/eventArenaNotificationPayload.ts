import type { EventArenaReminderDefinition } from './eventArenaReminderSchedule.ts';

const PREFIX = 'event-arena-reminder-v2:';
export const EVENT_ARENA_REMINDER_TYPES = new Set([
  'event-start', 'event-midweek', 'event-trade-reminder',
  'lightning-round-start', 'lightning-round-midpoint', 'lightning-round-final-hour',
]);

export function buildEventArenaNotificationRequest(
  reminder: EventArenaReminderDefinition,
  android: boolean,
) {
  const metadata = {
    type: reminder.kind,
    eventId: reminder.eventId,
    scheduledAtMs: reminder.scheduledAtMs,
  };
  return {
    identifier: PREFIX + encodeURIComponent(JSON.stringify(metadata)),
    content: {
      title: reminder.title,
      body: reminder.body,
      // Older Android builds cannot serialize JSONObject notification data
      // into their persisted schedule. The identifier carries the same metadata.
      ...(!android ? { data: metadata } : {}),
    },
    trigger: {
      type: 'date' as const,
      date: reminder.scheduledAtMs,
      ...(android ? { channelId: 'paper-event-reminders' } : {}),
    },
  };
}

export function readEventArenaNotificationMetadata(notification: {
  identifier: string;
  content?: { data?: Record<string, unknown> | null };
}): { type: string; eventId: string; scheduledAtMs: number } | null {
  let data = notification.content?.data;
  if (notification.identifier.startsWith(PREFIX)) {
    try {
      data = JSON.parse(decodeURIComponent(notification.identifier.slice(PREFIX.length)));
    } catch {
      return null;
    }
  }
  if (!data || typeof data.type !== 'string' || !EVENT_ARENA_REMINDER_TYPES.has(data.type)
    || typeof data.eventId !== 'string' || typeof data.scheduledAtMs !== 'number'
    || !Number.isFinite(data.scheduledAtMs)) return null;
  return { type: data.type, eventId: data.eventId, scheduledAtMs: data.scheduledAtMs };
}

export function isEventArenaNotification(notification: {
  identifier: string;
  content?: { data?: Record<string, unknown> | null };
}) {
  return notification.identifier.startsWith(PREFIX)
    || EVENT_ARENA_REMINDER_TYPES.has(String(notification.content?.data?.type ?? ''));
}
