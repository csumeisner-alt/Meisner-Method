const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Authoritative calendar for regular Event Arena windows.
 *
 * The API server imports this same module so validation, generated Lightning
 * Rounds, and the mobile calendar cannot drift apart.
 */
export const REGULAR_EVENT_CALENDAR = {
  anchorStartDate: '2026-11-16',
  cadenceDays: 14,
  availabilityDays: 7,
  durationDays: 4,
  startHour: 9,
  startMinute: 30,
  endHour: 16,
  endMinute: 0,
  timeZone: 'America/New_York',
} as const;

const EVENT_ANCHOR_DAY = Math.floor(
  Date.parse(`${REGULAR_EVENT_CALENDAR.anchorStartDate}T00:00:00.000Z`) / DAY_MS,
);

export type RegularEventWindow = {
  startAtMs: number;
  endAtMs: number;
};

function easternParts(timestamp: number): {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
} {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: REGULAR_EVENT_CALENDAR.timeZone,
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(timestamp));
  const value = (type: string) => Number(parts.find((part) => part.type === type)?.value);
  return {
    year: value('year'),
    month: value('month'),
    day: value('day'),
    hour: value('hour'),
    minute: value('minute'),
  };
}

function easternLocalToUtc(year: number, month: number, day: number, hour: number, minute: number): number {
  const targetAsUtc = Date.UTC(year, month - 1, day, hour, minute);
  let candidate = targetAsUtc;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const local = easternParts(candidate);
    const representedAsUtc = Date.UTC(local.year, local.month - 1, local.day, local.hour, local.minute);
    candidate += targetAsUtc - representedAsUtc;
  }
  return candidate;
}

function parseDateSerial(dateText: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateText)) return null;
  const timestamp = Date.parse(`${dateText}T00:00:00.000Z`);
  if (!Number.isFinite(timestamp) || new Date(timestamp).toISOString().slice(0, 10) !== dateText) return null;
  return Math.floor(timestamp / DAY_MS);
}

function dateTextFromSerial(serial: number): string {
  return new Date(serial * DAY_MS).toISOString().slice(0, 10);
}

function windowForStartSerial(startSerial: number): RegularEventWindow {
  const startDate = new Date(startSerial * DAY_MS);
  const endDate = new Date((startSerial + REGULAR_EVENT_CALENDAR.durationDays) * DAY_MS);
  return {
    startAtMs: easternLocalToUtc(
      startDate.getUTCFullYear(),
      startDate.getUTCMonth() + 1,
      startDate.getUTCDate(),
      REGULAR_EVENT_CALENDAR.startHour,
      REGULAR_EVENT_CALENDAR.startMinute,
    ),
    endAtMs: easternLocalToUtc(
      endDate.getUTCFullYear(),
      endDate.getUTCMonth() + 1,
      endDate.getUTCDate(),
      REGULAR_EVENT_CALENDAR.endHour,
      REGULAR_EVENT_CALENDAR.endMinute,
    ),
  };
}

/** Return the regular-event sequence index for a scheduled date, or null. */
export function getRegularEventSequenceIndex(eventId: unknown): number | null {
  if (typeof eventId !== 'string') return null;
  const daySerial = parseDateSerial(eventId);
  if (daySerial === null) return null;
  const daysSinceAnchor = daySerial - EVENT_ANCHOR_DAY;
  if (daysSinceAnchor < 0 || daysSinceAnchor % REGULAR_EVENT_CALENDAR.cadenceDays !== 0) return null;
  return Math.floor(daysSinceAnchor / REGULAR_EVENT_CALENDAR.cadenceDays);
}

/** Return the authoritative regular-event window for a scheduled event ID. */
export function getRegularEventWindowForStartDate(eventId: unknown): RegularEventWindow | null {
  if (getRegularEventSequenceIndex(eventId) === null || typeof eventId !== 'string') return null;
  const daySerial = parseDateSerial(eventId);
  return daySerial === null ? null : windowForStartSerial(daySerial);
}

/** Return the regular-event window shown for the local calendar date. */
export function getRegularEventWindowForCurrentDate(nowMs = Date.now()): {
  eventId: string;
  startAtMs: number;
  endAtMs: number;
} {
  const local = easternParts(nowMs);
  const daySerial = Math.floor(Date.UTC(local.year, local.month - 1, local.day) / DAY_MS);
  const daysSinceAnchor = daySerial - EVENT_ANCHOR_DAY;
  const isThisCycleEventWeek = daysSinceAnchor >= 0
    && daysSinceAnchor % REGULAR_EVENT_CALENDAR.cadenceDays < REGULAR_EVENT_CALENDAR.availabilityDays;
  const startSerial = isThisCycleEventWeek
    ? EVENT_ANCHOR_DAY
      + Math.floor(daysSinceAnchor / REGULAR_EVENT_CALENDAR.cadenceDays)
        * REGULAR_EVENT_CALENDAR.cadenceDays
    : getNextRegularEventStartSerial(daySerial);
  return {
    eventId: dateTextFromSerial(startSerial),
    ...windowForStartSerial(startSerial),
  };
}

function getNextRegularEventStartSerial(daySerial: number): number {
  if (daySerial < EVENT_ANCHOR_DAY) return EVENT_ANCHOR_DAY;
  const daysSinceAnchor = daySerial - EVENT_ANCHOR_DAY;
  const cycle = Math.floor(daysSinceAnchor / REGULAR_EVENT_CALENDAR.cadenceDays);
  const dayInCycle = daysSinceAnchor % REGULAR_EVENT_CALENDAR.cadenceDays;
  return EVENT_ANCHOR_DAY
    + (cycle + (dayInCycle >= REGULAR_EVENT_CALENDAR.availabilityDays ? 1 : 0))
      * REGULAR_EVENT_CALENDAR.cadenceDays;
}

/** First Friday candidate for a Lightning Round; overlapping windows are filtered separately. */
export function getFirstLightningRoundCandidateDaySerial(): number {
  const anchorWeekday = new Date(EVENT_ANCHOR_DAY * DAY_MS).getUTCDay();
  return EVENT_ANCHOR_DAY + (5 - anchorWeekday + 7) % 7;
}

/** Check an entire candidate window against all scheduled regular Event Arena windows. */
export function hasRegularEventWindowOverlap(startAtMs: number, endAtMs: number): boolean {
  if (!Number.isFinite(startAtMs) || !Number.isFinite(endAtMs) || endAtMs <= startAtMs) return false;
  const firstSerial = Math.floor(startAtMs / DAY_MS) - REGULAR_EVENT_CALENDAR.durationDays - 2;
  const lastSerial = Math.floor(endAtMs / DAY_MS) + 1;
  for (let serial = firstSerial; serial <= lastSerial; serial += 1) {
    const regular = getRegularEventWindowForStartDate(dateTextFromSerial(serial));
    if (regular && regular.startAtMs < endAtMs && startAtMs < regular.endAtMs) return true;
  }
  return false;
}
