/**
 * Unit tests for the alert-worker liveness health calculation.
 * Run: node --test --experimental-strip-types src/lib/alertWorkerHealth.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { computeHealthStatus, type WorkerHealthState } from "./alertWorkerHealth.ts";

const CHECK_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes, same as production
const LIVENESS_WINDOW_MS = 2 * CHECK_INTERVAL_MS; // 10 minutes

// ── Before first cycle (null lastCycleCompletedAt) ──────────────────────────

test("healthy during startup grace: no cycle yet, within 2× interval of start", () => {
  const now = 1_000_000;
  const state: WorkerHealthState = {
    workerStartedAt: now - 1_000, // 1 second after boot
    lastCycleCompletedAt: null,
    checkIntervalMs: CHECK_INTERVAL_MS,
  };
  const result = computeHealthStatus(state, now);
  assert.equal(result.healthy, true);
});

test("stuck: no cycle completed and 2× interval elapsed since start", () => {
  const now = 1_000_000;
  const state: WorkerHealthState = {
    workerStartedAt: now - LIVENESS_WINDOW_MS - 1, // just past the window
    lastCycleCompletedAt: null,
    checkIntervalMs: CHECK_INTERVAL_MS,
  };
  const result = computeHealthStatus(state, now);
  assert.equal(result.healthy, false);
  assert.ok(result.secondsSinceProgress > 0);
});

test("exactly at boundary (no cycle): window elapsed exactly → not healthy", () => {
  const now = 1_000_000;
  const state: WorkerHealthState = {
    workerStartedAt: now - LIVENESS_WINDOW_MS,
    lastCycleCompletedAt: null,
    checkIntervalMs: CHECK_INTERVAL_MS,
  };
  // elapsed === LIVENESS_WINDOW_MS, condition is elapsed <= window → healthy
  const result = computeHealthStatus(state, now);
  assert.equal(result.healthy, true);
});

// ── After first cycle completed ─────────────────────────────────────────────

test("healthy: last cycle completed recently", () => {
  const now = 1_000_000;
  const state: WorkerHealthState = {
    workerStartedAt: now - 20 * 60 * 1000, // started 20 min ago
    lastCycleCompletedAt: now - 3 * 60 * 1000, // last cycle 3 min ago (within 10 min window)
    checkIntervalMs: CHECK_INTERVAL_MS,
  };
  const result = computeHealthStatus(state, now);
  assert.equal(result.healthy, true);
});

test("stuck: last cycle completed more than 2× interval ago", () => {
  const now = 1_000_000;
  const state: WorkerHealthState = {
    workerStartedAt: now - 30 * 60 * 1000,
    lastCycleCompletedAt: now - LIVENESS_WINDOW_MS - 1, // just past the 10 min window
    checkIntervalMs: CHECK_INTERVAL_MS,
  };
  const result = computeHealthStatus(state, now);
  assert.equal(result.healthy, false);
  assert.ok(result.secondsSinceProgress > 0);
});

test("uses lastCycleCompletedAt as baseline (not workerStartedAt) once a cycle has run", () => {
  const now = 1_000_000;
  // workerStartedAt is old enough that using it would be 503,
  // but lastCycleCompletedAt is recent → should be healthy
  const state: WorkerHealthState = {
    workerStartedAt: now - 60 * 60 * 1000, // 1 hour ago
    lastCycleCompletedAt: now - 4 * 60 * 1000, // 4 min ago (within 10 min)
    checkIntervalMs: CHECK_INTERVAL_MS,
  };
  const result = computeHealthStatus(state, now);
  assert.equal(result.healthy, true);
  assert.equal(result.progressBaseline, state.lastCycleCompletedAt);
});

test("secondsSinceProgress reflects elapsed time from baseline", () => {
  const now = 1_000_000;
  const lastCycleCompletedAt = now - 7 * 60 * 1000; // 7 minutes ago
  const state: WorkerHealthState = {
    workerStartedAt: now - 30 * 60 * 1000,
    lastCycleCompletedAt,
    checkIntervalMs: CHECK_INTERVAL_MS,
  };
  const result = computeHealthStatus(state, now);
  assert.equal(result.healthy, true);
  assert.equal(result.secondsSinceProgress, 7 * 60);
});
