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
