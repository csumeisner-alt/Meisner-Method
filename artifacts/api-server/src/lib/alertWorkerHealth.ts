/**
 * Health-state calculation for the alert worker liveness probe.
 *
 * Extracted from alert-worker.ts so it can be unit-tested without starting a
 * real HTTP server or database connection.
 */

export interface WorkerHealthState {
  /** Unix timestamp (ms) when the worker process started. */
  workerStartedAt: number;
  /** Unix timestamp (ms) of the last successfully completed check cycle,
   *  or null if no cycle has finished yet. */
  lastCycleCompletedAt: number | null;
  /** How long a normal check cycle is, in milliseconds. */
  checkIntervalMs: number;
}

export interface HealthResult {
  healthy: boolean;
  /** Seconds since the last meaningful progress (cycle or start). */
  secondsSinceProgress: number;
  /** The timestamp used as the progress baseline. */
  progressBaseline: number;
}

/**
 * Return whether the worker is considered live at `now`.
 *
 * The liveness window is 2× `checkIntervalMs`.  The baseline is:
 * - `lastCycleCompletedAt` once at least one cycle has completed, or
 * - `workerStartedAt` while the worker is still completing its first cycle.
 *
 * Using the start time as the fallback means a worker that hangs before its
 * first cycle also becomes 503 after the liveness window elapses.
 */
export function computeHealthStatus(
  state: WorkerHealthState,
  now: number,
): HealthResult {
  const LIVENESS_WINDOW_MS = 2 * state.checkIntervalMs;
  const progressBaseline = state.lastCycleCompletedAt ?? state.workerStartedAt;
  const elapsed = now - progressBaseline;
  const healthy = elapsed <= LIVENESS_WINDOW_MS;
  return {
    healthy,
    secondsSinceProgress: Math.floor(elapsed / 1000),
    progressBaseline,
  };
}
