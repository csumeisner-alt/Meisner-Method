export type EventArenaReminderDefinition = {
  eventId: string;
  kind: string;
  scheduledAtMs: number;
  title: string;
  body: string;
};

export type ExistingEventArenaReminder = EventArenaReminderDefinition & {
  id: string;
};

export type EventArenaReminderScheduleResult = {
  ids: string[];
  cleanupFailures: number;
};

export function getEventArenaReminderKey(reminder: EventArenaReminderDefinition): string {
  return `${reminder.eventId}:${reminder.kind}:${reminder.scheduledAtMs}`;
}

/**
 * Replaces only Event Arena notifications. New notifications are created and
 * persisted before obsolete ones are cancelled, so a scheduling failure keeps
 * the previous working schedule intact.
 */
export async function replaceEventArenaReminderSchedule(args: {
  existing: ExistingEventArenaReminder[];
  legacyIds: string[];
  desired: EventArenaReminderDefinition[];
  schedule: (reminder: EventArenaReminderDefinition) => Promise<string>;
  persistIds: (ids: string[]) => Promise<void>;
  cancel: (id: string) => Promise<void>;
}): Promise<EventArenaReminderScheduleResult> {
  const existingByKey = new Map<string, ExistingEventArenaReminder>();
  const duplicateIds = new Set<string>();
  for (const reminder of args.existing) {
    const key = getEventArenaReminderKey(reminder);
    if (existingByKey.has(key)) duplicateIds.add(reminder.id);
    else existingByKey.set(key, reminder);
  }

  const ids: string[] = [];
  const newlyScheduledIds: string[] = [];
  try {
    for (const reminder of args.desired) {
      const existing = existingByKey.get(getEventArenaReminderKey(reminder));
      if (existing) {
        ids.push(existing.id);
        existingByKey.delete(getEventArenaReminderKey(reminder));
        continue;
      }
      try {
        const id = await args.schedule(reminder);
        ids.push(id);
        newlyScheduledIds.push(id);
      } catch (error) {
        const detail = error instanceof Error ? error.message : String(error);
        throw new Error(`Could not schedule “${reminder.title}”: ${detail}`);
      }
    }
    await args.persistIds(ids);
  } catch (error) {
    await Promise.all(newlyScheduledIds.map((id) => args.cancel(id).catch(() => {})));
    throw error;
  }

  const keep = new Set(ids);
  const obsoleteIds = new Set([
    ...args.legacyIds,
    ...duplicateIds,
    ...[...existingByKey.values()].map((reminder) => reminder.id),
  ]);
  for (const id of keep) obsoleteIds.delete(id);
  const cleanupResults = await Promise.all(
    [...obsoleteIds].map((id) => args.cancel(id).then(() => true, () => false)),
  );
  return {
    ids,
    cleanupFailures: cleanupResults.filter((ok) => !ok).length,
  };
}
