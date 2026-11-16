import assert from "node:assert/strict";
import test from "node:test";
import {
  DUE_LIGHTNING_ROUND_COMPLETION_NOTICES_QUERY,
  runLightningRoundCompletionCycle,
  type LightningRoundCompletionDatabase,
} from "./lightningRoundCompletionWorker.ts";

const row = {
  event_id: "lightning-2026-11-27",
  installation_id: "installation-id-123456",
  push_token: "ExponentPushToken[abcdefghijklmnop]",
};

test("completion notices require finalized rounds, entered players, and enabled notification preferences", () => {
  assert.match(DUE_LIGHTNING_ROUND_COMPLETION_NOTICES_QUERY, /event\.finalized_at IS NOT NULL/);
  assert.match(DUE_LIGHTNING_ROUND_COMPLETION_NOTICES_QUERY, /participant\.status='entered'/);
  assert.match(DUE_LIGHTNING_ROUND_COMPLETION_NOTICES_QUERY, /preference\.enabled=TRUE/);
  assert.match(DUE_LIGHTNING_ROUND_COMPLETION_NOTICES_QUERY, /device\.enabled=TRUE/);
  assert.doesNotMatch(DUE_LIGHTNING_ROUND_COMPLETION_NOTICES_QUERY, /alias|rank/);
  // Leaderboard opt-out affects public ranking, not a private completion notice.
  assert.doesNotMatch(DUE_LIGHTNING_ROUND_COMPLETION_NOTICES_QUERY, /leaderboard_opted_in/);
});

test("a finalized participant receives a generic private notice and accepted sends are not repeated", async () => {
  const delivered = new Set<string>();
  const sent: any[] = [];
  const db: LightningRoundCompletionDatabase = {
    async query(sql, values = []) {
      if (sql === DUE_LIGHTNING_ROUND_COMPLETION_NOTICES_QUERY) {
        return { rows: delivered.has(`${row.event_id}:${row.installation_id}`) ? [] : [row] };
      }
      if (sql.includes("INSERT INTO event_arena_lightning_completion_deliveries")) {
        assert.match(sql, /event\.finalized_at IS NOT NULL/);
        assert.match(sql, /preference\.enabled=TRUE/);
        assert.match(sql, /ON CONFLICT \(event_id, installation_id\) DO NOTHING/);
        const key = `${values[0]}:${values[1]}`;
        if (delivered.has(key)) return { rows: [] };
        delivered.add(key);
        return { rows: [{ event_id: values[0] }] };
      }
      if (sql.includes("UPDATE event_arena_lightning_completion_deliveries")) return { rows: [] };
      throw new Error(`Unexpected query: ${sql}`);
    },
  };
  const send = async (notice: any) => {
    sent.push(notice);
    return { accepted: true };
  };

  const first = await runLightningRoundCompletionCycle(db, send);
  const retry = await runLightningRoundCompletionCycle(db, send);
  assert.equal(first.accepted, 1);
  assert.equal(retry.claimed, 0);
  assert.equal(sent.length, 1);
  assert.deepEqual(sent[0], {
    eventId: row.event_id,
    installationId: row.installation_id,
    pushToken: row.push_token,
  });
});

test("ambiguous sends remain claimed while definitive transient rejections can retry", async () => {
  let claimExists = false;
  let sends = 0;
  const db: LightningRoundCompletionDatabase = {
    async query(sql) {
      if (sql === DUE_LIGHTNING_ROUND_COMPLETION_NOTICES_QUERY) return { rows: [row] };
      if (sql.includes("INSERT INTO event_arena_lightning_completion_deliveries")) {
        if (claimExists) return { rows: [] };
        claimExists = true;
        return { rows: [{ event_id: row.event_id }] };
      }
      if (sql.startsWith("DELETE FROM event_arena_lightning_completion_deliveries")) {
        claimExists = false;
        return { rows: [] };
      }
      throw new Error(`Unexpected query: ${sql}`);
    },
  };

  const uncertain = await runLightningRoundCompletionCycle(db, async () => {
    sends += 1;
    return { accepted: false, uncertain: true };
  });
  const duplicate = await runLightningRoundCompletionCycle(db, async () => {
    sends += 1;
    return { accepted: true };
  });
  assert.equal(uncertain.uncertain, 1);
  assert.equal(duplicate.claimed, 0);
  assert.equal(sends, 1);

  claimExists = false;
  const transientDb: LightningRoundCompletionDatabase = {
    async query(sql) {
      if (sql === DUE_LIGHTNING_ROUND_COMPLETION_NOTICES_QUERY) return { rows: [row] };
      if (sql.includes("INSERT INTO event_arena_lightning_completion_deliveries")) {
        if (claimExists) return { rows: [] };
        claimExists = true;
        return { rows: [{ event_id: row.event_id }] };
      }
      if (sql.startsWith("DELETE FROM event_arena_lightning_completion_deliveries")) {
        claimExists = false;
        return { rows: [] };
      }
      if (sql.includes("UPDATE event_arena_lightning_completion_deliveries")) return { rows: [] };
      throw new Error(`Unexpected query: ${sql}`);
    },
  };
  const rejected = await runLightningRoundCompletionCycle(transientDb, async () => ({
    accepted: false,
  }));
  assert.equal(rejected.rejected, 1);
});
