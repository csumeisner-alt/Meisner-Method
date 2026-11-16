export const DUE_LIGHTNING_ROUND_COMPLETION_NOTICES_QUERY = `
  SELECT event.event_id, participant.installation_id,
         device.expo_push_token AS push_token
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
    AND event.finalized_at IS NOT NULL
    AND participant.status='entered'
    AND NOT EXISTS (
      SELECT 1 FROM event_arena_lightning_completion_deliveries AS delivery
      WHERE delivery.event_id=event.event_id
        AND delivery.installation_id=participant.installation_id
    )
`;

export type LightningRoundCompletionNotice = {
  eventId: string;
  installationId: string;
  pushToken: string;
};

export type LightningRoundCompletionSendResult = {
  accepted: boolean;
  permanentFailure?: boolean;
  /** No definitive provider ticket was received, so retrying could duplicate a delivered notice. */
  uncertain?: boolean;
};

export type LightningRoundCompletionCycleStats = {
  due: number;
  claimed: number;
  accepted: number;
  rejected: number;
  uncertain: number;
};

export interface LightningRoundCompletionDatabase {
  query(sql: string, values?: any[]): Promise<{ rows: any[]; rowCount?: number | null }>;
}

export async function runLightningRoundCompletionCycle(
  db: LightningRoundCompletionDatabase,
  sendPush: (notice: LightningRoundCompletionNotice) => Promise<LightningRoundCompletionSendResult>,
): Promise<LightningRoundCompletionCycleStats> {
  const { rows } = await db.query(DUE_LIGHTNING_ROUND_COMPLETION_NOTICES_QUERY);
  const stats: LightningRoundCompletionCycleStats = {
    due: rows.length,
    claimed: 0,
    accepted: 0,
    rejected: 0,
    uncertain: 0,
  };

  for (const row of rows) {
    const notice: LightningRoundCompletionNotice = {
      eventId: String(row.event_id),
      installationId: String(row.installation_id),
      pushToken: String(row.push_token),
    };
    if (!notice.eventId || !notice.installationId || !notice.pushToken) continue;

    const claim = await db.query(
      `INSERT INTO event_arena_lightning_completion_deliveries
         (event_id, installation_id, delivery_started_at)
       SELECT event.event_id,participant.installation_id,NOW()
       FROM event_arena_events AS event
       JOIN event_arena_lightning_participants AS participant
         ON participant.event_id=event.event_id
       JOIN event_arena_reminder_preferences AS preference
         ON preference.installation_id=participant.installation_id AND preference.enabled=TRUE
       JOIN push_devices AS device
         ON device.installation_id=participant.installation_id AND device.enabled=TRUE
       WHERE event.event_id=$1 AND event.event_type='lightning-round'
         AND event.finalized_at IS NOT NULL
         AND participant.installation_id=$2 AND participant.status='entered'
       ON CONFLICT (event_id, installation_id) DO NOTHING
       RETURNING event_id`,
      [notice.eventId, notice.installationId],
    );
    if (claim.rows.length === 0) continue;
    stats.claimed += 1;

    let result: LightningRoundCompletionSendResult;
    try {
      result = await sendPush(notice);
    } catch {
      // The provider may have accepted the request before the connection failed.
      // Keep the unique claim so a later cycle cannot create a duplicate.
      stats.uncertain += 1;
      continue;
    }

    if (result.accepted) {
      await db.query(
        `UPDATE event_arena_lightning_completion_deliveries
         SET accepted_at=NOW()
         WHERE event_id=$1 AND installation_id=$2`,
        [notice.eventId, notice.installationId],
      );
      stats.accepted += 1;
    } else if (result.uncertain || result.permanentFailure) {
      stats.uncertain += result.uncertain ? 1 : 0;
      stats.rejected += result.permanentFailure ? 1 : 0;
    } else {
      await db.query(
        `DELETE FROM event_arena_lightning_completion_deliveries
         WHERE event_id=$1 AND installation_id=$2 AND accepted_at IS NULL`,
        [notice.eventId, notice.installationId],
      );
      stats.rejected += 1;
    }
  }

  return stats;
}
