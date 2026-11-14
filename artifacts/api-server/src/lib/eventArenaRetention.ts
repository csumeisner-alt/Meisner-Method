interface EventArenaDatabase {
  query(sql: string, values?: any[]): Promise<{ rows: any[] }>;
}

export const EVENT_ARENA_RETENTION_DAYS = 30;

/** Deletes expired public entries, including their event-scoped alias locks. */
export async function purgeExpiredEventArenaEntries(db: EventArenaDatabase) {
  await db.query(
    `DELETE FROM event_arena_leaderboard_entries
     WHERE event_end_at <= NOW() - ($1 * INTERVAL '1 day')`,
    [EVENT_ARENA_RETENTION_DAYS],
  );
  await db.query(
    `DELETE FROM event_arena_cash_transfers
     WHERE event_end_at <= NOW() - ($1 * INTERVAL '1 day')`,
    [EVENT_ARENA_RETENTION_DAYS],
  );
}
