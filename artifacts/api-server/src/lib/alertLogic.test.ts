/**
 * Unit tests for the price-alert pipeline logic.
 * Run: node --test --experimental-strip-types src/lib/alertLogic.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  isAlertTriggered,
  classifyExpoPushResponse,
  processPendingAlerts,
  type PendingAlert,
} from "./alertLogic.ts";

const alert = (over: Partial<PendingAlert> = {}): PendingAlert => ({
  id: "a1",
  userId: "u1",
  symbol: "AAPL",
  direction: "above",
  targetPrice: 100,
  pushToken: "ExponentPushToken[test]",
  ...over,
});

// ── isAlertTriggered ─────────────────────────────────────────────────────────

test("above triggers at or beyond target", () => {
  assert.equal(isAlertTriggered("above", 100, 100), true);
  assert.equal(isAlertTriggered("above", 100, 101), true);
  assert.equal(isAlertTriggered("above", 100, 99.99), false);
});

test("below triggers at or beyond target", () => {
  assert.equal(isAlertTriggered("below", 100, 100), true);
  assert.equal(isAlertTriggered("below", 100, 99), true);
  assert.equal(isAlertTriggered("below", 100, 100.01), false);
});

// ── classifyExpoPushResponse ─────────────────────────────────────────────────

test("HTTP failure is transient", () => {
  const r = classifyExpoPushResponse(false, null);
  assert.deepEqual(r, { accepted: false, permanentFailure: false });
});

test("ticket ok is accepted", () => {
  const r = classifyExpoPushResponse(true, { data: { status: "ok", id: "x" } });
  assert.deepEqual(r, { accepted: true, permanentFailure: false });
});

test("ticket array ok is accepted", () => {
  const r = classifyExpoPushResponse(true, { data: [{ status: "ok" }] });
  assert.equal(r.accepted, true);
});

test("ticket array classification uses the requested alert index", () => {
  const r = classifyExpoPushResponse(true, {
    data: [
      { status: "error", details: { error: "MessageRateExceeded" } },
      { status: "ok" },
    ],
  }, 1);
  assert.equal(r.accepted, true);
});

test("missing or malformed ticket body is transient, never accepted", () => {
  assert.deepEqual(classifyExpoPushResponse(true, null), { accepted: false, permanentFailure: false });
  assert.deepEqual(classifyExpoPushResponse(true, {}), { accepted: false, permanentFailure: false });
  assert.deepEqual(classifyExpoPushResponse(true, { data: "weird" }), { accepted: false, permanentFailure: false });
  assert.deepEqual(classifyExpoPushResponse(true, { data: [] }), { accepted: false, permanentFailure: false });
});

test("DeviceNotRegistered is a permanent failure", () => {
  const r = classifyExpoPushResponse(true, {
    data: { status: "error", details: { error: "DeviceNotRegistered" } },
  });
  assert.deepEqual(r, { accepted: false, permanentFailure: true });
});

test("other ticket errors are transient (retry)", () => {
  const r = classifyExpoPushResponse(true, {
    data: { status: "error", details: { error: "MessageRateExceeded" } },
  });
  assert.deepEqual(r, { accepted: false, permanentFailure: false });
});

// ── processPendingAlerts pipeline ────────────────────────────────────────────

test("triggered alert is delivered and marked fired exactly once", async () => {
  const fired: string[] = [];
  const stats = await processPendingAlerts([alert({ targetPrice: 100 })], {
    fetchPrice: async () => 150, // above 100 → triggers
    sendPush: async () => ({ accepted: true, permanentFailure: false }),
    markFired: async (id) => { fired.push(id); },
  });
  assert.equal(stats.triggered, 1);
  assert.equal(stats.delivered, 1);
  assert.deepEqual(fired, ["a1"]); // exactly once
});

test("batched push results are applied independently per alert", async () => {
  const fired: string[] = [];
  const stats = await processPendingAlerts(
    [
      alert({ id: "a1", symbol: "AAPL" }),
      alert({ id: "a2", symbol: "TSLA" }),
    ],
    {
      fetchPrice: async () => 150,
      // The batch path must be used instead of sending two concurrent singles.
      sendPush: async () => { throw new Error("single sender should not run"); },
      sendPushBatch: async (requests) => new Map([
        [requests[0]!.alert.id, { accepted: true, permanentFailure: false }],
        [requests[1]!.alert.id, { accepted: false, permanentFailure: false }],
      ]),
      markFired: async (id) => { fired.push(id); },
    },
  );

  assert.equal(stats.triggered, 2);
  assert.equal(stats.delivered, 1);
  assert.equal(stats.retriedTransient, 1);
  assert.deepEqual(fired, ["a1"]);
});

test("non-triggered alert is untouched", async () => {
  const fired: string[] = [];
  const stats = await processPendingAlerts([alert({ targetPrice: 500 })], {
    fetchPrice: async () => 150,
    sendPush: async () => { throw new Error("should not send"); },
    markFired: async (id) => { fired.push(id); },
  });
  assert.equal(stats.triggered, 0);
  assert.deepEqual(fired, []);
});

test("transient push failure leaves alert active for retry", async () => {
  const fired: string[] = [];
  const stats = await processPendingAlerts([alert()], {
    fetchPrice: async () => 150,
    sendPush: async () => ({ accepted: false, permanentFailure: false }),
    markFired: async (id) => { fired.push(id); },
  });
  assert.equal(stats.retriedTransient, 1);
  assert.deepEqual(fired, []); // NOT fired — retries next cycle
});

test("permanent failure (dead token) marks fired to stop retry loop", async () => {
  const fired: string[] = [];
  const stats = await processPendingAlerts([alert()], {
    fetchPrice: async () => 150,
    sendPush: async () => ({ accepted: false, permanentFailure: true }),
    markFired: async (id) => { fired.push(id); },
  });
  assert.equal(stats.firedPermanentFailure, 1);
  assert.deepEqual(fired, ["a1"]);
});

test("missing price skips alert without firing", async () => {
  const fired: string[] = [];
  const stats = await processPendingAlerts([alert()], {
    fetchPrice: async () => null,
    sendPush: async () => ({ accepted: true, permanentFailure: false }),
    markFired: async (id) => { fired.push(id); },
  });
  assert.equal(stats.skippedNoPrice, 1);
  assert.deepEqual(fired, []);
});

test("price fetched once per unique symbol", async () => {
  let calls = 0;
  await processPendingAlerts(
    [alert({ id: "a1" }), alert({ id: "a2" }), alert({ id: "a3", symbol: "TSLA" })],
    {
      fetchPrice: async () => { calls++; return 150; },
      sendPush: async () => ({ accepted: true, permanentFailure: false }),
      markFired: async () => {},
    },
  );
  assert.equal(calls, 2); // AAPL once + TSLA once
});

test("quote fetches run sequentially to avoid provider bursts", async () => {
  const order: string[] = [];
  let active = 0;
  let maxActive = 0;
  const alerts = [
    alert({ id: "a1", symbol: "AAPL" }),
    alert({ id: "a2", symbol: "MSFT" }),
    alert({ id: "a3", symbol: "NVDA" }),
  ];
  await processPendingAlerts(alerts, {
    fetchPrice: async (symbol) => {
      order.push(`${symbol}:start`);
      active++;
      maxActive = Math.max(maxActive, active);
      await new Promise((resolve) => setTimeout(resolve, 5));
      active--;
      order.push(`${symbol}:end`);
      return 100;
    },
    sendPush: async () => ({ accepted: false, permanentFailure: false }),
    markFired: async () => {},
  });
  assert.equal(maxActive, 1);
  assert.deepEqual(order, [
    "AAPL:start", "AAPL:end",
    "MSFT:start", "MSFT:end",
    "NVDA:start", "NVDA:end",
  ]);
});

test("sendPush throwing is treated as transient", async () => {
  const fired: string[] = [];
  const stats = await processPendingAlerts([alert()], {
    fetchPrice: async () => 150,
    sendPush: async () => { throw new Error("network down"); },
    markFired: async (id) => { fired.push(id); },
  });
  assert.equal(stats.retriedTransient, 1);
  assert.deepEqual(fired, []);
});
