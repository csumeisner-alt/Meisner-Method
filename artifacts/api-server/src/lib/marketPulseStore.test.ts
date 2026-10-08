import assert from "node:assert/strict";
import test from "node:test";
import { createMarketPulseStore } from "./marketPulseStore.ts";

test("market pulse store writes and restores the exact quote and fetch timestamps", async () => {
  const rows = new Map<string, Record<string, unknown>>();
  const store = createMarketPulseStore(async (sql, values = []) => {
    if (sql.includes("INSERT INTO market_pulse_cache")) {
      rows.set(String(values[0]), {
        change_percent: values[1],
        price_timestamp: values[2],
        updated_at: values[3],
      });
    }
    if (sql.includes("SELECT change_percent")) {
      const row = rows.get(String(values[0]));
      return { rows: row ? [row] : [] };
    }
    return { rows: [] };
  });

  const snapshot = {
    changePercent: -1.2345,
    priceTimestamp: 1_760_000_000,
    updatedAt: 1_760_000_060,
  };
  await store.write(snapshot);

  assert.deepEqual(await store.read(), snapshot);
});

test("market pulse store does not replace a newer snapshot with an older quote", async () => {
  const rows = new Map<string, Record<string, unknown>>();
  const store = createMarketPulseStore(async (sql, values = []) => {
    if (sql.includes("INSERT INTO market_pulse_cache")) {
      const key = String(values[0]);
      const existing = rows.get(key);
      const hasTimestampGuard = sql.includes(
        "WHERE market_pulse_cache.price_timestamp <= EXCLUDED.price_timestamp",
      );
      if (
        !existing
        || !hasTimestampGuard
        || Number(values[2]) >= Number(existing.price_timestamp)
      ) {
        rows.set(key, {
          change_percent: values[1],
          price_timestamp: values[2],
          updated_at: values[3],
        });
      }
    }
    if (sql.includes("SELECT change_percent")) {
      const row = rows.get(String(values[0]));
      return { rows: row ? [row] : [] };
    }
    return { rows: [] };
  });

  const newerSnapshot = {
    changePercent: 1.75,
    priceTimestamp: 1_760_000_120,
    updatedAt: 1_760_000_180,
  };
  await store.write(newerSnapshot);
  await store.write({
    changePercent: -3.25,
    priceTimestamp: 1_760_000_060,
    updatedAt: 1_760_000_240,
  });

  assert.deepEqual(await store.read(), newerSnapshot);

  const sameTimestampSnapshot = {
    changePercent: -0.5,
    priceTimestamp: newerSnapshot.priceTimestamp,
    updatedAt: 1_760_000_300,
  };
  await store.write(sameTimestampSnapshot);
  assert.deepEqual(await store.read(), sameTimestampSnapshot);
});

test("market pulse store ignores invalid persisted snapshots", async () => {
  const store = createMarketPulseStore(async (sql) => ({
    rows: sql.includes("SELECT change_percent")
      ? [{
          change_percent: Number.NaN,
          price_timestamp: 1_760_000_000,
          updated_at: 1_760_000_060,
        }]
      : [],
  }));

  assert.equal(await store.read(), null);
});
