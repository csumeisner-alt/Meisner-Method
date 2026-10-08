import assert from "node:assert/strict";
import { once } from "node:events";
import test from "node:test";
import express from "express";
import { createMarketPulseStore } from "../lib/marketPulseStore.ts";
import { createMarketPulseService } from "../lib/marketPulseService.ts";
import { createMarketPulseRouter } from "./marketPulse.ts";

test("public market-pulse endpoint serves the persisted signal through a Yahoo outage after restart", async () => {
  const rows = new Map<string, Record<string, unknown>>();
  const query = async (sql: string, values: unknown[] = []) => {
    if (sql.includes("INSERT INTO market_pulse_cache")) {
      const key = String(values[0]);
      const previous = rows.get(key);
      if (!previous || Number(previous["price_timestamp"]) <= Number(values[2])) {
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
  };

  const savedSnapshot = {
    changePercent: -1.2345,
    priceTimestamp: 1_760_000_000,
    updatedAt: 1_760_000_060,
  };
  await createMarketPulseStore(query).write(savedSnapshot);

  // New store/service instances have empty memory caches, like a restarted API.
  const restartedStore = createMarketPulseStore(query);
  const restartTime = 1_800_000_000_000;
  let yahooAttempts = 0;
  let restoredSnapshot: typeof savedSnapshot | null = null;
  const service = createMarketPulseService({
    store: restartedStore,
    now: () => restartTime,
    fetchSnapshot: async () => {
      yahooAttempts += 1;
      throw new Error("Yahoo is unavailable");
    },
    onRestored: (data) => {
      restoredSnapshot = data;
    },
  });

  await service.warm();
  assert.deepEqual(restoredSnapshot, savedSnapshot);
  assert.ok(yahooAttempts >= 1, "startup attempted a Yahoo refresh");

  const app = express();
  app.use(createMarketPulseRouter(service));
  const server = app.listen(0, "127.0.0.1");
  try {
    await once(server, "listening");
    const address = server.address();
    assert.ok(address && typeof address !== "string");

    const response = await fetch(`http://127.0.0.1:${address.port}/stocks/market-pulse`);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("cache-control"), "public, max-age=30");
    assert.deepEqual(await response.json(), savedSnapshot);

    const storedAfterRestart = await restartedStore.read();
    assert.deepEqual(storedAfterRestart, savedSnapshot);
    assert.notEqual(savedSnapshot.updatedAt, Math.floor(restartTime / 1000));
    assert.equal(storedAfterRestart?.updatedAt, savedSnapshot.updatedAt);
    assert.equal(storedAfterRestart?.priceTimestamp, savedSnapshot.priceTimestamp);
  } finally {
    server.close();
    await once(server, "close");
  }
});
