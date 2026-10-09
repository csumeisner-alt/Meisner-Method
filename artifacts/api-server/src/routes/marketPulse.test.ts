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
  app.use(createMarketPulseRouter(service, async () => true));
  const server = app.listen(0, "127.0.0.1");
  try {
    await once(server, "listening");
    const address = server.address();
    assert.ok(address && typeof address !== "string");

    const response = await fetch(`http://127.0.0.1:${address.port}/stocks/market-pulse`);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("cache-control"), "public, max-age=30");
    assert.deepEqual(await response.json(), { ...savedSnapshot, marketOpen: true });

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

test("public market-pulse endpoint recovers the persisted signal after startup database and Yahoo outages", async () => {
  const rows = new Map<string, Record<string, unknown>>();
  let failNextRead = false;
  const query = async (sql: string, values: unknown[] = []) => {
    if (sql.includes("INSERT INTO market_pulse_cache")) {
      const key = String(values[0]);
      const row = {
        change_percent: values[1],
        price_timestamp: values[2],
        updated_at: values[3],
      };
      rows.set(key, row);
      return { rows: [row] };
    }
    if (sql.includes("SELECT change_percent")) {
      if (failNextRead) {
        failNextRead = false;
        throw new Error("Temporary database read outage");
      }
      const row = rows.get(String(values[0]));
      return { rows: row ? [row] : [] };
    }
    return { rows: [] };
  };

  const savedSnapshot = {
    changePercent: -2.3456,
    priceTimestamp: 1_760_100_000,
    updatedAt: 1_760_100_060,
  };
  await createMarketPulseStore(query).write(savedSnapshot);

  const restartTime = 1_800_000_000_000;
  failNextRead = true;
  let yahooAttempts = 0;
  let restoreFailures = 0;
  let restoredSnapshot: typeof savedSnapshot | null = null;
  const service = createMarketPulseService({
    store: createMarketPulseStore(query),
    now: () => restartTime,
    fetchSnapshot: async () => {
      yahooAttempts += 1;
      throw new Error("Yahoo is unavailable");
    },
    onRestoreFailure: () => {
      restoreFailures += 1;
    },
    onRestored: (data) => {
      restoredSnapshot = data;
    },
  });

  await service.warm();
  assert.equal(restoreFailures, 1, "the startup database read failed");
  assert.equal(yahooAttempts, 1, "startup attempted a Yahoo refresh");

  const app = express();
  app.use(createMarketPulseRouter(service, async () => true));
  const server = app.listen(0, "127.0.0.1");
  try {
    await once(server, "listening");
    const address = server.address();
    assert.ok(address && typeof address !== "string");

    const response = await fetch(`http://127.0.0.1:${address.port}/stocks/market-pulse`);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { ...savedSnapshot, marketOpen: true });
    assert.deepEqual(restoredSnapshot, savedSnapshot);
  } finally {
    server.close();
    await once(server, "close");
  }
});

test("market-pulse endpoint serves an in-memory snapshot during a write outage and restores the later saved refresh", async () => {
  const rows = new Map<string, Record<string, unknown>>();
  let writeAttempts = 0;
  const query = async (sql: string, values: unknown[] = []) => {
    if (sql.includes("INSERT INTO market_pulse_cache")) {
      writeAttempts += 1;
      if (writeAttempts === 1) throw new Error("Temporary database write outage");
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
  };

  const firstSnapshot = {
    changePercent: 0.75,
    priceTimestamp: 1_800_000_000,
    updatedAt: 1_800_000_060,
  };
  const latestSnapshot = {
    changePercent: 1.25,
    priceTimestamp: 1_800_000_120,
    updatedAt: 1_800_000_180,
  };
  const store = createMarketPulseStore(query);
  let fetchAttempts = 0;
  let persistFailures = 0;
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
  assert.equal(persistFailures, 1);
  assert.deepEqual(await service.getSnapshot(), firstSnapshot);
  assert.equal(await store.read(), null, "the first snapshot was not saved during the outage");

  const app = express();
  app.use(createMarketPulseRouter(service, async () => true));
  const server = app.listen(0, "127.0.0.1");
  try {
    await once(server, "listening");
    const address = server.address();
    assert.ok(address && typeof address !== "string");

    const duringOutage = await fetch(`http://127.0.0.1:${address.port}/stocks/market-pulse`);
    assert.equal(duringOutage.status, 200);
    assert.deepEqual(await duringOutage.json(), { ...firstSnapshot, marketOpen: true });

    await service.warm();
    assert.deepEqual(await store.read(), latestSnapshot);

    const restartedService = createMarketPulseService({
      store: createMarketPulseStore(query),
      fetchSnapshot: async () => {
        throw new Error("Yahoo is unavailable");
      },
    });
    await restartedService.warm();

    const restartedApp = express();
    restartedApp.use(createMarketPulseRouter(restartedService, async () => true));
    const restartedServer = restartedApp.listen(0, "127.0.0.1");
    try {
      await once(restartedServer, "listening");
      const restartedAddress = restartedServer.address();
      assert.ok(restartedAddress && typeof restartedAddress !== "string");

      const afterRestart = await fetch(
        `http://127.0.0.1:${restartedAddress.port}/stocks/market-pulse`,
      );
      assert.equal(afterRestart.status, 200);
      assert.deepEqual(await afterRestart.json(), { ...latestSnapshot, marketOpen: true });
      assert.ok(fetchAttempts >= 2, "a later provider refresh ran after the failed write");
      assert.equal(writeAttempts, 2, "the later refresh persisted the latest snapshot");
    } finally {
      restartedServer.close();
      await once(restartedServer, "close");
    }
  } finally {
    server.close();
    await once(server, "close");
  }
});
