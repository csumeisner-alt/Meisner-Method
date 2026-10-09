import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import pg from "pg";
import { createMarketPulseService } from "./marketPulseService.ts";
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

test(
  "a market pulse refresh persists after a temporary write failure and is restored after restart",
  { skip: !databaseUrl && "DATABASE_URL is not configured" },
  async () => {
    assert.ok(databaseUrl);

    const cacheKey = `market-pulse-recovery-test-${randomUUID()}`;
    const pool = new Pool({ connectionString: databaseUrl, max: 1 });
    let failFirstWrite = true;
    const store = createMarketPulseStore((text, values = []) => {
      if (failFirstWrite && text.includes("INSERT INTO market_pulse_cache")) {
        failFirstWrite = false;
        return Promise.reject(new Error("Temporary database write outage"));
      }
      return pool.query(text, values as any[]);
    }, cacheKey);
    const firstSnapshot = {
      changePercent: 0.5,
      priceTimestamp: 1_780_000_000,
      updatedAt: 1_780_000_060,
    };
    const latestSnapshot = {
      changePercent: 1.5,
      priceTimestamp: 1_780_000_120,
      updatedAt: 1_780_000_180,
    };
    let fetchAttempts = 0;
    let persistFailures = 0;
    let restoredSnapshot: typeof latestSnapshot | null = null;

    try {
      const service = createMarketPulseService({
        store,
        fetchSnapshot: async () => {
          fetchAttempts += 1;
          return fetchAttempts === 1 ? firstSnapshot : latestSnapshot;
        },
        onPersistFailure: () => {
          persistFailures += 1;
        },
      });

      await service.warm();
      assert.deepEqual(await service.getSnapshot(), firstSnapshot);
      assert.equal(persistFailures, 1);
      assert.equal(await createMarketPulseStore(
        (text, values = []) => pool.query(text, values as any[]),
        cacheKey,
      ).read(), null);

      await service.warm();
      assert.deepEqual(await createMarketPulseStore(
        (text, values = []) => pool.query(text, values as any[]),
        cacheKey,
      ).read(), latestSnapshot);

      const restartedService = createMarketPulseService({
        store: createMarketPulseStore(
          (text, values = []) => pool.query(text, values as any[]),
          cacheKey,
        ),
        fetchSnapshot: async () => {
          throw new Error("Yahoo is unavailable");
        },
        onRestored: (data) => {
          restoredSnapshot = data;
        },
      });
      await restartedService.warm();

      assert.deepEqual(restoredSnapshot, latestSnapshot);
      assert.deepEqual(await restartedService.getSnapshot(), latestSnapshot);
      assert.equal(fetchAttempts, 2);
    } finally {
      try {
        await pool.query(
          "DELETE FROM market_pulse_cache WHERE cache_key = $1",
          [cacheKey],
        );
      } finally {
        await pool.end();
      }
    }
  },
);
