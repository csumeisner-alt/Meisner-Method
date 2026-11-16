import assert from "node:assert/strict";
import test from "node:test";
import {
  DUE_LIGHTNING_ROUND_REMINDERS_QUERY,
  getLightningRoundPreparationAtMs,
  isLightningRoundPreparationReminderDue,
  runLightningRoundReminderCycle,
  type LightningRoundReminderDatabase,
} from "./lightningRoundReminderWorker.ts";
import { LIGHTNING_ROUND_PREPARATION_MS } from "../../../mobile/lib/paperChallenge.ts";

const startAtMs = Date.parse("2026-11-27T14:30:00.000Z");
const nowMs = startAtMs - LIGHTNING_ROUND_PREPARATION_MS;
const eligibleRow = {
  event_id: "lightning-2026-11-27",
  installation_id: "installation-id-123456",
  push_token: "ExponentPushToken[abcdefghijklmnop]",
  event_start_at_ms: String(startAtMs),
};

test("prep reminder time is exactly 72 hours before the saved round start", () => {
  assert.equal(isLightningRoundPreparationReminderDue(startAtMs, nowMs - 1), false);
  assert.equal(isLightningRoundPreparationReminderDue(startAtMs, nowMs), true);
  assert.equal(isLightningRoundPreparationReminderDue(startAtMs, startAtMs - 1), true);
  assert.equal(isLightningRoundPreparationReminderDue(startAtMs, startAtMs), false);
  assert.equal(getLightningRoundPreparationAtMs(startAtMs), startAtMs - 72 * 60 * 60 * 1000);
  assert.match(DUE_LIGHTNING_ROUND_REMINDERS_QUERY, /event_start_at <= TO_TIMESTAMP\(\(\$1 \+ \$2\) \/ 1000\.0\)/);
});

test("due reminders require enabled preferences and active Lightning Round enrollment", async () => {
  assert.match(DUE_LIGHTNING_ROUND_REMINDERS_QUERY, /preference\.enabled=TRUE/);
  assert.match(DUE_LIGHTNING_ROUND_REMINDERS_QUERY, /participant\.status IN \('queued','entered'\)/);
  assert.match(DUE_LIGHTNING_ROUND_REMINDERS_QUERY, /event_start_at > TO_TIMESTAMP/);
  assert.match(DUE_LIGHTNING_ROUND_REMINDERS_QUERY, /event_start_at <= TO_TIMESTAMP/);

  const queriedValues: unknown[][] = [];
  const db: LightningRoundReminderDatabase = {
    async query(sql, values = []) {
      queriedValues.push(values);
      if (sql === DUE_LIGHTNING_ROUND_REMINDERS_QUERY) return { rows: [eligibleRow] };
      if (sql.includes("INSERT INTO event_arena_reminder_deliveries")) {
        assert.match(sql, /ON CONFLICT \(event_id, installation_id\) DO NOTHING/);
        assert.deepEqual(values, [
          "lightning-2026-11-27",
          "installation-id-123456",
          nowMs,
          LIGHTNING_ROUND_PREPARATION_MS,
        ]);
        return { rows: [{ event_id: eligibleRow.event_id }] };
      }
      if (sql.includes("UPDATE event_arena_reminder_deliveries")) return { rows: [] };
      throw new Error(`Unexpected query: ${sql}`);
    },
  };
  const sent: any[] = [];
  const stats = await runLightningRoundReminderCycle(db, async (reminder) => {
    sent.push(reminder);
    return { accepted: true };
  }, nowMs);

  assert.equal(stats.due, 1);
  assert.equal(stats.claimed, 1);
  assert.equal(stats.accepted, 1);
  assert.equal(sent[0].eventStartAtMs, startAtMs);
  assert.equal(queriedValues.length, 3);
});

test("duplicate cycles cannot resend an accepted or ambiguous reminder", async () => {
  const claimed = new Set<string>();
  let sends = 0;
  const db: LightningRoundReminderDatabase = {
    async query(sql, values = []) {
      if (sql === DUE_LIGHTNING_ROUND_REMINDERS_QUERY) return { rows: [eligibleRow] };
      if (sql.includes("INSERT INTO event_arena_reminder_deliveries")) {
        const key = `${values[0]}:${values[1]}`;
        if (claimed.has(key)) return { rows: [] };
        claimed.add(key);
        return { rows: [{ event_id: values[0] }] };
      }
      if (sql.includes("UPDATE event_arena_reminder_deliveries")) return { rows: [] };
      throw new Error(`Unexpected query: ${sql}`);
    },
  };
  const send = async () => {
    sends += 1;
    return { accepted: false, uncertain: true };
  };

  const first = await runLightningRoundReminderCycle(db, send, nowMs);
  const retry = await runLightningRoundReminderCycle(db, send, nowMs + 5 * 60 * 1000);
  assert.equal(first.uncertain, 1);
  assert.equal(retry.claimed, 0);
  assert.equal(sends, 1);
});

test("definitively rejected reminder can retry without duplicating an accepted push", async () => {
  let claimExists = false;
  let sends = 0;
  const db: LightningRoundReminderDatabase = {
    async query(sql) {
      if (sql === DUE_LIGHTNING_ROUND_REMINDERS_QUERY) return { rows: [eligibleRow] };
      if (sql.includes("INSERT INTO event_arena_reminder_deliveries")) {
        if (claimExists) return { rows: [] };
        claimExists = true;
        return { rows: [{ event_id: eligibleRow.event_id }] };
      }
      if (sql.startsWith("DELETE FROM event_arena_reminder_deliveries")) {
        claimExists = false;
        return { rows: [] };
      }
      if (sql.includes("UPDATE event_arena_reminder_deliveries")) return { rows: [] };
      throw new Error(`Unexpected query: ${sql}`);
    },
  };
  const send = async () => {
    sends += 1;
    return sends === 1 ? { accepted: false } : { accepted: true };
  };

  const rejected = await runLightningRoundReminderCycle(db, send, nowMs);
  const retried = await runLightningRoundReminderCycle(db, send, nowMs + 5 * 60 * 1000);
  assert.equal(rejected.rejected, 1);
  assert.equal(retried.accepted, 1);
  assert.equal(sends, 2);
});
