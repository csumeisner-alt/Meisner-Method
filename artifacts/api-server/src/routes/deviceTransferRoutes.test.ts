import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { once } from "node:events";
import express from "express";
import test from "node:test";
import {
  DEVICE_TRANSFER_CATEGORIES,
  stableDeviceTransferJson,
} from "../../../../lib/api-zod/src/deviceTransferManifest.ts";
import { createDeviceTransferRouter } from "./deviceTransferRoutes.ts";

class MemoryTransferDatabase {
  codes = new Map<string, any>();
  eventTokens = new Map<string, string>();
  eventSync = new Map<string, { source_installation_id: string; revision: number }>();
  pushDevices = new Map<string, string>();
  alerts = new Map<string, any>();
  failBackupReadback = false;

  async query(sql: string, values: any[] = []) {
    const query = sql.replace(/\s+/g, " ").trim();
    if (query.startsWith("DELETE FROM app_device_transfer_codes")) return { rows: [] };
    if (query.startsWith("SELECT sync_id FROM event_arena_device_sync_tokens")) {
      const syncId = this.eventTokens.get(values[0]);
      return { rows: syncId ? [{ sync_id: syncId }] : [] };
    }
    if (query.startsWith("INSERT INTO app_device_transfer_codes")) {
      this.codes.set(values[0], {
        bundle_id: values[1],
        bundle: JSON.parse(values[2]),
        bundle_sha256: values[3],
        expires_at: new Date(values[4]),
        event_arena_sync_id: values[5],
        destination_token_hash: null,
        alert_restore_result: null,
        consumed_at: null,
        restored_at: null,
      });
      return { rows: [] };
    }
    if (query.startsWith("SELECT bundle,bundle_sha256 FROM app_device_transfer_codes")) {
      const row = this.codes.get(values[0]);
      return { rows: row && !this.failBackupReadback
        ? [{ bundle: row.bundle, bundle_sha256: row.bundle_sha256 }]
        : [] };
    }
    if (query.startsWith("SELECT bundle,bundle_sha256,expires_at,destination_token_hash,event_arena_sync_id,restored_at")) {
      const row = this.codes.get(values[0]);
      return { rows: row ? [row] : [] };
    }
    if (query.startsWith("SELECT bundle,bundle_sha256,bundle_id,destination_token_hash,restored_at")) {
      const row = this.codes.get(values[0]);
      return { rows: row ? [row] : [] };
    }
    if (query.startsWith("SELECT bundle,bundle_sha256,destination_token_hash,alert_restore_result,restored_at")) {
      const row = this.codes.get(values[0]);
      return { rows: row ? [row] : [] };
    }
    if (query.startsWith("UPDATE app_device_transfer_codes SET bundle=$2::jsonb,bundle_sha256=$3")) {
      const row = this.codes.get(values[0]);
      if (row) {
        row.bundle = JSON.parse(values[1]);
        row.bundle_sha256 = values[2];
      }
      return { rows: [] };
    }
    if (query.startsWith("UPDATE app_device_transfer_codes SET restored_at=NOW(),bundle=NULL")) {
      const row = this.codes.get(values[0]);
      if (row) {
        row.restored_at = new Date();
        row.bundle = null;
      }
      return { rows: [] };
    }
    if (query.startsWith("UPDATE app_device_transfer_codes SET alert_restore_result")) {
      const row = this.codes.get(values[0]);
      if (row) row.alert_restore_result = JSON.parse(values[1]);
      return { rows: [] };
    }
    if (query.startsWith("UPDATE app_device_transfer_codes SET destination_token_hash")) {
      const row = this.codes.get(values[0]);
      if (row) {
        row.destination_token_hash = values[1];
        row.consumed_at = new Date();
      }
      return { rows: [] };
    }
    if (query.startsWith("INSERT INTO push_devices")) {
      this.pushDevices.set(values[0], values[1]);
      return { rows: [] };
    }
    if (query.startsWith("INSERT INTO price_alerts")) {
      const alert = {
        id: values[0],
        installation_id: values[1],
        symbol: values[2],
        direction: values[3],
        target_price: values[4],
        push_token: values[5],
        created_at: values[6],
        fired_at: values[7],
        paused: values[8],
      };
      this.alerts.set(alert.id, alert);
      return { rows: [alert] };
    }
    if (query.startsWith("DELETE FROM price_alerts WHERE installation_id=$1 AND NOT (id = ANY")) {
      const keep = new Set(values[1] as string[]);
      for (const [id, alert] of this.alerts) {
        if (alert.installation_id === values[0] && !keep.has(id)) this.alerts.delete(id);
      }
      return { rows: [] };
    }
    if (query.startsWith("DELETE FROM price_alerts WHERE installation_id=$1")) {
      for (const [id, alert] of this.alerts) {
        if (alert.installation_id === values[0]) this.alerts.delete(id);
      }
      return { rows: [] };
    }
    if (query.startsWith("INSERT INTO event_arena_device_sync_tokens")) {
      this.eventTokens.set(values[0], values[1]);
      return { rows: [] };
    }
    if (query.startsWith("SELECT source_installation_id,revision FROM event_arena_device_sync")) {
      const row = this.eventSync.get(values[0]);
      return { rows: row ? [row] : [] };
    }
    throw new Error(`Unimplemented transfer SQL: ${query}`);
  }
}

function hash(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

async function withApi(run: (baseUrl: string, db: MemoryTransferDatabase) => Promise<void>) {
  const app = express();
  app.use(express.json());
  const db = new MemoryTransferDatabase();
  app.use(createDeviceTransferRouter(db, (_req, _res, next) => next()));
  const server = app.listen(0);
  await once(server, "listening");
  const address = server.address();
  assert.ok(address && typeof address === "object");
  try {
    await run(`http://127.0.0.1:${address.port}`, db);
  } finally {
    server.close();
    await once(server, "close");
  }
}

const bundle = {
  version: 1,
  bundleId: "bundle-20261117-a1b2",
  exportedAt: "2026-11-17T12:00:00.000Z",
  categories: [
    {
      id: "portfolio-history",
      version: 1,
      data: {
        "@stocksense/portfolio_trades_v1": JSON.stringify([
          { id: "trade-1", symbol: "AAPL", type: "buy", shares: 2, pricePerShare: 101, date: "2026-11-16T14:00:00.000Z" },
        ]),
      },
    },
    {
      id: "watchlist",
      version: 1,
      data: {
        "@stocksense/watchlist_v1/__guest__": JSON.stringify([
          { symbol: "AAPL", createdAt: "2026-11-16T14:00:00.000Z", sortOrder: 0 },
        ]),
      },
    },
    {
      id: "price-alerts",
      version: 1,
      data: {
        "@stocksense/price_alerts_v1": JSON.stringify([
          {
            id: "source-alert-1",
            symbol: "AAPL",
            direction: "above",
            targetPrice: 250,
            createdAt: "2026-11-16T14:00:00.000Z",
            firedAt: null,
            paused: true,
          },
        ]),
      },
    },
  ],
};
const migratedBundle = {
  ...bundle,
  version: 2,
  categories: bundle.categories.map((category) => ({ ...category, version: 2 })),
};
const completeLegacyBundle = {
  ...bundle,
  categories: DEVICE_TRANSFER_CATEGORIES.map((entry) =>
    bundle.categories.find((category) => category.id === entry.id)
      ?? { id: entry.id, version: 1, data: {} },
  ),
};
const completeMigratedBundle = {
  ...completeLegacyBundle,
  version: 2,
  categories: completeLegacyBundle.categories.map((category) => ({ ...category, version: 2 })),
};
const destinationToken = "d".repeat(64);

test("device transfer validates bundles, preserves the source bundle, and permits only same-phone retry", async () => {
  await withApi(async (baseUrl, db) => {
    const invalid = await fetch(`${baseUrl}/device-transfer/create`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ bundle: { ...bundle, categories: [{
        id: "device-pairing-state", version: 1, data: { "@stocksense/installation_id": "source-installation" },
      }] } }),
    });
    assert.equal(invalid.status, 400);
    assert.equal(db.codes.size, 0);

    const sourceBefore = structuredClone(bundle);
    const create = await fetch(`${baseUrl}/device-transfer/create`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ bundle }),
    });
    assert.equal(create.status, 200);
    const pairing = await create.json() as { code: string; bundleId: string };
    assert.equal(pairing.code.length, 32);
    assert.equal(pairing.bundleId, bundle.bundleId);
    assert.deepEqual(bundle, sourceBefore, "creating a transfer must not alter original device state");

    const redeem = () => fetch(`${baseUrl}/device-transfer/redeem`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ code: pairing.code, destinationToken }),
    });
    const restored = await redeem();
    assert.equal(restored.status, 200);
    assert.deepEqual((await restored.json() as any).bundle, migratedBundle);
    assert.equal((await redeem()).status, 200, "the same destination can safely retry after interruption");
    const secondPhone = await fetch(`${baseUrl}/device-transfer/redeem`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ code: pairing.code, destinationToken: "e".repeat(64) }),
    });
    assert.equal(secondPhone.status, 409);
    assert.deepEqual(db.codes.get(hash(pairing.code)).bundle, migratedBundle);
  });
});

test("a v1 backup survives a simulated uninstall and is deleted only after restore confirmation", async () => {
  await withApi(async (baseUrl, db) => {
    const create = await fetch(`${baseUrl}/device-transfer/create`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ bundle: completeLegacyBundle }),
    });
    assert.equal(create.status, 200);
    const { code } = await create.json() as { code: string };
    const stored = db.codes.get(hash(code));
    assert.deepEqual(stored.bundle, completeMigratedBundle, "older app data is migrated before it is backed up");
    assert.equal(stored.bundle_sha256, hash(stableDeviceTransferJson(completeMigratedBundle)));

    // The credential is reproducible from the one-use code after local app
    // storage has been erased by uninstalling and reinstalling the app.
    const destinationToken = hash(`meisner-device-transfer:${code}`);
    const redeem = () => fetch(`${baseUrl}/device-transfer/redeem`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ code, destinationToken }),
    });
    const first = await redeem();
    assert.equal(first.status, 200);
    const response = await first.json() as any;
    assert.deepEqual(response.bundle, completeMigratedBundle);
    assert.equal(response.bundleSha256, hash(stableDeviceTransferJson(completeMigratedBundle)));
    assert.ok(stored.bundle, "the server backup remains until completion is confirmed");

    const afterReinstall = await redeem();
    assert.equal(afterReinstall.status, 200, "same-code retry resumes on a fresh installation");
    assert.deepEqual((await afterReinstall.json() as any).bundle, completeMigratedBundle);
    const incomplete = await fetch(`${baseUrl}/device-transfer/complete`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        code, destinationToken, bundleId: completeMigratedBundle.bundleId,
        categoryResults: [{ id: "watchlist", status: "restored" }],
      }),
    });
    assert.equal(incomplete.status, 400);
    assert.ok(stored.bundle, "invalid confirmation cannot remove the backup");

    const completed = await fetch(`${baseUrl}/device-transfer/complete`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        code,
        destinationToken,
        bundleId: completeMigratedBundle.bundleId,
        categoryResults: completeMigratedBundle.categories.map(({ id }) => ({ id, status: "restored" })),
      }),
    });
    assert.equal(completed.status, 200);
    assert.equal(db.codes.get(hash(code)).restored_at instanceof Date, true);
    assert.equal(db.codes.get(hash(code)).bundle, null, "backup is removed only after confirmation");

    const lostAckRetry = await fetch(`${baseUrl}/device-transfer/complete`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        code,
        destinationToken,
        bundleId: completeMigratedBundle.bundleId,
        categoryResults: completeMigratedBundle.categories.map(({ id }) => ({ id, status: "restored" })),
      }),
    });
    assert.equal(lostAckRetry.status, 200, "completion retries are idempotent after a lost response");
    assert.equal((await redeem()).status, 410, "a completed transfer code cannot restore a second time");
  });
});

test("a changed server backup fails its integrity check before redemption", async () => {
  await withApi(async (baseUrl, db) => {
    const create = await fetch(`${baseUrl}/device-transfer/create`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ bundle }),
    });
    const { code } = await create.json() as { code: string };
    db.codes.get(hash(code)).bundle.categories[0].data["@stocksense/portfolio_trades_v1"] = "[]";
    const response = await fetch(`${baseUrl}/device-transfer/redeem`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ code, destinationToken }),
    });
    assert.equal(response.status, 422);
    assert.equal(db.codes.get(hash(code)).destination_token_hash, null);
  });
});

test("the server does not return a code unless it can read back the stored backup", async () => {
  await withApi(async (baseUrl, db) => {
    db.failBackupReadback = true;
    const response = await fetch(`${baseUrl}/device-transfer/create`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ bundle }),
    });
    assert.equal(response.status, 500);
    assert.equal(JSON.stringify(await response.json()).includes('"code"'), false);
  });
});

test("device transfer rejects missing, malformed, and expired codes", async () => {
  await withApi(async (baseUrl, db) => {
    const invalidToken = await fetch(`${baseUrl}/device-transfer/redeem`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ code: "x".repeat(32), destinationToken: "short" }),
    });
    assert.equal(invalidToken.status, 400);
    const missing = await fetch(`${baseUrl}/device-transfer/redeem`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ code: "x".repeat(32), destinationToken }),
    });
    assert.equal(missing.status, 404);

    const create = await fetch(`${baseUrl}/device-transfer/create`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ bundle }),
    });
    const { code } = await create.json() as { code: string };
    db.codes.get(hash(code)).expires_at = new Date(Date.now() - 1_000);
    const expired = await fetch(`${baseUrl}/device-transfer/redeem`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ code, destinationToken }),
    });
    assert.equal(expired.status, 410);
    assert.equal(db.codes.get(hash(code)).destination_token_hash, null);
  });
});

test("a restored phone is added to the existing Event Arena sync without copying its source token", async () => {
  await withApi(async (baseUrl, db) => {
    const sourceToken = "s".repeat(64);
    const syncId = "existing-event-sync";
    db.eventTokens.set(hash(sourceToken), syncId);
    db.eventSync.set(syncId, { source_installation_id: "source-installation-123", revision: 7 });
    const create = await fetch(`${baseUrl}/device-transfer/create`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-event-arena-device-token": sourceToken,
      },
      body: JSON.stringify({ bundle }),
    });
    const { code } = await create.json() as { code: string };
    const restored = await fetch(`${baseUrl}/device-transfer/redeem`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ code, destinationToken }),
    });
    assert.equal(restored.status, 200);
    const response = await restored.json() as any;
    assert.deepEqual(response.eventArenaSync, {
      sourceInstallationId: "source-installation-123",
      revision: 7,
    });
    assert.equal(db.eventTokens.get(hash(destinationToken)), syncId);
    assert.equal(db.eventTokens.get(hash(sourceToken)), syncId);
    assert.equal(db.eventTokens.has(sourceToken), false, "raw tokens are never stored");
  });
});

test("price alerts are recreated on the authorized phone once without copying the source token", async () => {
  await withApi(async (baseUrl, db) => {
    const create = await fetch(`${baseUrl}/device-transfer/create`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ bundle }),
    });
    const { code } = await create.json() as { code: string };
    const redeem = await fetch(`${baseUrl}/device-transfer/redeem`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ code, destinationToken }),
    });
    assert.equal(redeem.status, 200);

    const restore = (token: string) => fetch(`${baseUrl}/device-transfer/restore-alerts`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        code,
        destinationToken: token,
        installationId: "target-installation-123",
        pushToken: "ExponentPushToken[012345678901234567890123456789]",
        replaceExisting: false,
      }),
    });
    assert.equal((await restore("x".repeat(64))).status, 409, "another phone cannot use the redeemed bundle");

    const first = await restore(destinationToken);
    assert.equal(first.status, 200);
    const firstBody = await first.json() as { alerts: any[] };
    assert.equal(firstBody.alerts.length, 1);
    assert.notEqual(firstBody.alerts[0].id, "source-alert-1");
    assert.equal(firstBody.alerts[0].paused, true);
    assert.equal(JSON.stringify(firstBody).includes("ExponentPushToken"), false);

    const second = await restore(destinationToken);
    assert.deepEqual(await second.json(), firstBody, "retry returns the same destination alert records");
    assert.equal(db.alerts.size, 1);
    assert.equal(db.pushDevices.get("target-installation-123"), "ExponentPushToken[012345678901234567890123456789]");
    assert.equal(db.codes.get(hash(code)).bundle.categories.find((item: any) => item.id === "price-alerts")
      .data["@stocksense/price_alerts_v1"].includes("source-alert-1"), true);

    db.alerts.set("destination-extra", {
      id: "destination-extra",
      installation_id: "target-installation-123",
    });
    const replace = await fetch(`${baseUrl}/device-transfer/restore-alerts`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        code,
        destinationToken,
        installationId: "target-installation-123",
        pushToken: "ExponentPushToken[012345678901234567890123456789]",
        replaceExisting: true,
      }),
    });
    assert.equal(replace.status, 200);
    assert.equal(db.alerts.size, 1, "explicit replacement removes only the destination's conflicting alert set");
  });
});

