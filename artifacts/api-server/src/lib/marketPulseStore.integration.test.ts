import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import pg from "pg";
import { createMarketPulseStore } from "./marketPulseStore.ts";

const { Pool } = pg;
const databaseUrl = process.env["DATABASE_URL"];

test(
  "Postgres keeps the newest market pulse across independent stores and accepts equal timestamps",
  { skip: !databaseUrl && "DATABASE_URL is not configured" },
  async () => {
    assert.ok(databaseUrl);

    const cacheKey = `market-pulse-test-${randomUUID()}`;
    const firstPool = new Pool({ connectionString: databaseUrl, max: 1 });
    const secondPool = new Pool({ connectionString: databaseUrl, max: 1 });
    const storeFor = (pool: InstanceType<typeof Pool>) =>
      createMarketPulseStore(
        (text, values = []) => pool.query(text, values as any[]),
        cacheKey,
      );
    const firstStore = storeFor(firstPool);
    const secondStore = storeFor(secondPool);
    let rowWasSeeded = false;

    try {
      const newestSnapshot = {
        changePercent: 1.75,
        priceTimestamp: 1_760_000_120,
        updatedAt: 1_760_000_180,
      };
      await firstStore.write(newestSnapshot);
      rowWasSeeded = true;

      // The older quote was fetched later, so its updatedAt is newer. The
      // conflict guard must use priceTimestamp and preserve every saved field.
      await secondStore.write({
        changePercent: -3.25,
        priceTimestamp: 1_760_000_060,
        updatedAt: 1_760_000_240,
      });
      assert.deepEqual(await secondStore.read(), newestSnapshot);

      const equalTimestampSnapshot = {
        changePercent: -0.5,
        priceTimestamp: newestSnapshot.priceTimestamp,
        updatedAt: 1_760_000_300,
      };
      await secondStore.write(equalTimestampSnapshot);
      assert.deepEqual(await firstStore.read(), equalTimestampSnapshot);
    } finally {
      try {
        if (rowWasSeeded) {
          await firstPool.query(
            "DELETE FROM market_pulse_cache WHERE cache_key = $1",
            [cacheKey],
          );
        }
      } finally {
        await Promise.all([firstPool.end(), secondPool.end()]);
      }
    }
  },
);
