import {
  getLightningRoundPreparationAtMs,
  LIGHTNING_ROUND_PREPARATION_MS,
} from "../../../mobile/lib/paperChallenge.ts";

export const DUE_LIGHTNING_ROUND_REMINDERS_QUERY = `
  SELECT event.event_id, participant.installation_id,
         device.expo_push_token AS push_token,
         (EXTRACT(EPOCH FROM event.event_start_at) * 1000)::bigint AS event_start_at_ms
  FROM event_arena_events AS event
  JOIN event_arena_lightning_participants AS participant
    ON participant.event_id=event.event_id
  JOIN event_arena_reminder_preferences AS preference
    ON preference.installation_id=participant.installation_id
   AND preference.enabled=TRUE
  JOIN push_devices AS device
    ON device.installation_id=participant.installation_id
   AND device.enabled=TRUE
  WHERE event.event_type='lightning-round'
    AND event.event_start_at > TO_TIMESTAMP($1 / 1000.0)
    AND event.event_start_at <= TO_TIMESTAMP(($1 + $2) / 1000.0)
    AND participant.status IN ('queued','entered')
`;

export type LightningRoundReminderPush = {
  eventId: string;
  installationId: string;
  pushToken: string;
  eventStartAtMs: number;
};

export type LightningRoundReminderSendResult = {
  accepted: boolean;
  permanentFailure?: boolean;
  /** No definitive provider ticket was received, so retrying could duplicate a delivered notification. */
  uncertain?: boolean;
};

export type LightningRoundReminderCycleStats = {
  due: number;
  claimed: number;
  accepted: number;
  rejected: number;
  uncertain: number;
};

export interface LightningRoundReminderDatabase {
  query(sql: string, values?: any[]): Promise<{ rows: any[]; rowCount?: number | null }>;
}

export async function runLightningRoundReminderCycle(
  db: LightningRoundReminderDatabase,
  sendPush: (reminder: LightningRoundReminderPush) => Promise<LightningRoundReminderSendResult>,
  nowMs = Date.now(),
): Promise<LightningRoundReminderCycleStats> {
  const { rows } = await db.query(DUE_LIGHTNING_ROUND_REMINDERS_QUERY, [
    nowMs,
    LIGHTNING_ROUND_PREPARATION_MS,
  ]);
  const stats: LightningRoundReminderCycleStats = {
    due: rows.length,
    claimed: 0,
    accepted: 0,
    rejected: 0,
    uncertain: 0,
  };
  for (const row of rows) {
    const reminder: LightningRoundReminderPush = {
      eventId: String(row.event_id),
      installationId: String(row.installation_id),
      pushToken: String(row.push_token),
      eventStartAtMs: Number(row.event_start_at_ms),
    };
    if (!Number.isFinite(reminder.eventStartAtMs)) continue;

    const claim = await db.query(
      `INSERT INTO event_arena_reminder_deliveries
         (event_id, installation_id, delivery_started_at)
       SELECT $1,$2,NOW()
       WHERE EXISTS (
         SELECT 1
         FROM event_arena_events AS event
         JOIN event_arena_lightning_participants AS participant
           ON participant.event_id=event.event_id
         JOIN event_arena_reminder_preferences AS preference
           ON preference.installation_id=participant.installation_id AND preference.enabled=TRUE
         JOIN push_devices AS device
           ON device.installation_id=participant.installation_id AND device.enabled=TRUE
         WHERE event.event_id=$1 AND event.event_type='lightning-round'
           AND event.event_start_at > TO_TIMESTAMP($3 / 1000.0)
           AND event.event_start_at <= TO_TIMESTAMP(($3 + $4) / 1000.0)
           AND participant.installation_id=$2
           AND participant.status IN ('queued','entered')
       )
       ON CONFLICT (event_id, installation_id) DO NOTHING
       RETURNING event_id`,
      [reminder.eventId, reminder.installationId, nowMs, LIGHTNING_ROUND_PREPARATION_MS],
    );
    if (claim.rows.length === 0) continue;
    stats.claimed += 1;

    let result: LightningRoundReminderSendResult;
    try {
      result = await sendPush(reminder);
    } catch {
      // The provider may have accepted a request before the connection failed.
      // Keep the unique claim so later cycles cannot send a duplicate.
      stats.uncertain += 1;
      continue;
    }

    if (result.accepted) {
      await db.query(
        `UPDATE event_arena_reminder_deliveries
         SET accepted_at=NOW()
         WHERE event_id=$1 AND installation_id=$2`,
        [reminder.eventId, reminder.installationId],
      );
      stats.accepted += 1;
    } else if (result.uncertain) {
      stats.uncertain += 1;
    } else if (result.permanentFailure) {
      stats.rejected += 1;
    } else {
      await db.query(
        `DELETE FROM event_arena_reminder_deliveries
         WHERE event_id=$1 AND installation_id=$2 AND accepted_at IS NULL`,
        [reminder.eventId, reminder.installationId],
      );
      stats.rejected += 1;
    }
  }
  return stats;
}

export function isLightningRoundPreparationReminderDue(startAtMs: number, nowMs: number): boolean {
  return Number.isFinite(startAtMs)
    && Number.isFinite(nowMs)
    && nowMs >= getLightningRoundPreparationAtMs(startAtMs)
    && nowMs < startAtMs;
}

export { getLightningRoundPreparationAtMs };
