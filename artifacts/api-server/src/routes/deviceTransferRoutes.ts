import { createHash, randomBytes, randomUUID } from "node:crypto";
import { Router } from "express";
import {
  stableDeviceTransferJson,
  validateDeviceTransferBundle,
  type ValidatedDeviceTransferBundle,
} from "../../../../lib/api-zod/src/deviceTransferManifest.ts";

type TransferDatabase = {
  query(sql: string, values?: any[]): Promise<{ rows: any[] }>;
  connect?: () => Promise<{
    query(sql: string, values?: any[]): Promise<{ rows: any[] }>;
    release: () => void;
  }>;
};
type Middleware = (req: any, res: any, next: any) => void;

const CODE_TTL_MS = 30 * 24 * 60 * 60_000;

function hashSecret(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function bundleIntegrityHash(bundle: unknown): string {
  return hashSecret(stableDeviceTransferJson(bundle));
}

function parseJsonColumn(value: unknown): unknown {
  return typeof value === "string" ? JSON.parse(value) : value;
}

async function getVerifiedBundle(
  client: Pick<TransferDatabase, "query">,
  codeHash: string,
  row: { bundle: unknown; bundle_sha256?: unknown },
): Promise<ValidatedDeviceTransferBundle> {
  const bundle = validateDeviceTransferBundle(parseJsonColumn(row.bundle));
  const digest = bundleIntegrityHash(bundle);
  if (row.bundle_sha256 === null || row.bundle_sha256 === undefined) {
    // Backfill legacy rows once, after validating and migrating their schema.
    await client.query(
      "UPDATE app_device_transfer_codes SET bundle=$2::jsonb,bundle_sha256=$3 WHERE code_hash=$1",
      [codeHash, JSON.stringify(bundle), digest],
    );
    return bundle;
  }
  if (typeof row.bundle_sha256 !== "string" || row.bundle_sha256 !== digest) {
    throw Object.assign(new Error("The saved-data backup failed its integrity check."), { status: 422 });
  }
  return bundle;
}

function validSecret(value: unknown): value is string {
  return typeof value === "string" && value.length >= 32 && value.length <= 128
    && /^[A-Za-z0-9_-]+$/.test(value);
}

function validInstallationId(value: unknown): value is string {
  return typeof value === "string" && value.length >= 12 && value.length <= 128;
}

function validExpoPushToken(value: unknown): value is string {
  return typeof value === "string" && value.length >= 20 && value.length <= 256
    && /^(Expo(nent)?PushToken)\[.+\]$/.test(value);
}

function normalizeAlert(row: any) {
  return {
    id: row.id,
    symbol: row.symbol,
    direction: row.direction,
    targetPrice: Number(row.target_price),
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
    firedAt: row.fired_at instanceof Date ? row.fired_at.toISOString() : row.fired_at ?? null,
    paused: Boolean(row.paused),
  };
}

async function withTransaction<T>(
  db: TransferDatabase,
  operation: (client: Pick<TransferDatabase, "query">) => Promise<T>,
): Promise<T> {
  if (!db.connect) return operation(db);
  const client = await db.connect();
  try {
    await client.query("BEGIN");
    const result = await operation(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

export function createDeviceTransferRouter(db: TransferDatabase, requireSchema: Middleware) {
  const router = Router();

  router.post("/device-transfer/create", requireSchema, async (req: any, res: any) => {
    let bundle: ValidatedDeviceTransferBundle;
    try {
      bundle = validateDeviceTransferBundle(req.body?.bundle);
    } catch (error) {
      res.status(400).json({
        error: error instanceof Error ? error.message : "The saved-data bundle is invalid.",
      });
      return;
    }
    const code = randomBytes(24).toString("base64url");
    const expiresAt = new Date(Date.now() + CODE_TTL_MS);
    const codeHash = hashSecret(code);
    const bundleSha256 = bundleIntegrityHash(bundle);
    try {
      await db.query(
        `DELETE FROM app_device_transfer_codes
         WHERE restored_at IS NOT NULL AND expires_at < NOW() - INTERVAL '1 day'`,
      );
      const sourceToken = req.get("x-event-arena-device-token");
      let eventArenaSyncId: string | null = null;
      if (validSecret(sourceToken)) {
        const { rows } = await db.query(
          "SELECT sync_id FROM event_arena_device_sync_tokens WHERE token_hash=$1",
          [hashSecret(sourceToken)],
        );
        eventArenaSyncId = rows[0]?.sync_id ?? null;
      }
      await db.query(
        `INSERT INTO app_device_transfer_codes
           (code_hash, bundle_id, bundle, bundle_sha256, expires_at, event_arena_sync_id)
         VALUES ($1,$2,$3::jsonb,$4,$5,$6)`,
        [codeHash, bundle.bundleId, JSON.stringify(bundle), bundleSha256, expiresAt.toISOString(), eventArenaSyncId],
      );
      const stored = await db.query(
        "SELECT bundle,bundle_sha256 FROM app_device_transfer_codes WHERE code_hash=$1",
        [codeHash],
      );
      if (!stored.rows[0]) throw new Error("Stored transfer backup could not be retrieved.");
      const storedBundle = validateDeviceTransferBundle(parseJsonColumn(stored.rows[0].bundle));
      if (bundleIntegrityHash(storedBundle) !== bundleSha256
        || stored.rows[0].bundle_sha256 !== bundleSha256) {
        throw new Error("Stored transfer backup failed its integrity check.");
      }
      res.json({ code, expiresAt: expiresAt.toISOString(), bundleId: bundle.bundleId });
    } catch {
      res.status(500).json({ error: "Could not prepare the saved-data transfer code." });
    }
  });

  router.post("/device-transfer/redeem", requireSchema, async (req: any, res: any) => {
    const code = req.body?.code;
    const destinationToken = req.body?.destinationToken;
    if (typeof code !== "string" || code.length < 32 || code.length > 64 || !validSecret(destinationToken)) {
      res.status(400).json({ error: "The transfer code or destination is invalid." });
      return;
    }
    try {
      const bundle = await withTransaction(db, async (client) => {
        const result = await client.query(
          `SELECT bundle,bundle_sha256,expires_at,destination_token_hash,event_arena_sync_id,restored_at
           FROM app_device_transfer_codes WHERE code_hash=$1 FOR UPDATE`,
          [hashSecret(code)],
        );
        const row = result.rows[0];
        if (!row) throw Object.assign(new Error("Transfer code not found."), { status: 404 });
        if (row.restored_at || row.bundle == null) {
          throw Object.assign(new Error("This transfer has already been completed."), { status: 410 });
        }
        const expiresAtMs = row.expires_at instanceof Date
          ? row.expires_at.getTime()
          : Date.parse(row.expires_at);
        const destinationHash = hashSecret(destinationToken);
        const alreadyRedeemedForDestination = row.destination_token_hash === destinationHash;
        if (row.destination_token_hash && !alreadyRedeemedForDestination) {
          throw Object.assign(new Error("Transfer code already used on another phone."), { status: 409 });
        }
        if (!alreadyRedeemedForDestination && (!Number.isFinite(expiresAtMs) || expiresAtMs < Date.now())) {
          throw Object.assign(new Error("Transfer code expired."), { status: 410 });
        }
        const bundle = await getVerifiedBundle(client, hashSecret(code), row);

        if (!row.destination_token_hash) {
          await client.query(
            `UPDATE app_device_transfer_codes
             SET destination_token_hash=$2,consumed_at=NOW()
             WHERE code_hash=$1`,
            [hashSecret(code), destinationHash],
          );
        }
        let eventArenaSync: { sourceInstallationId: string; revision: number } | null = null;
        if (row.event_arena_sync_id) {
          const existing = await client.query(
            "SELECT sync_id FROM event_arena_device_sync_tokens WHERE token_hash=$1 FOR UPDATE",
            [destinationHash],
          );
          if (existing.rows[0] && existing.rows[0].sync_id !== row.event_arena_sync_id) {
            throw Object.assign(new Error("Destination is paired with another Event Arena account."), { status: 409 });
          }
          if (!existing.rows[0]) {
            await client.query(
              "INSERT INTO event_arena_device_sync_tokens (token_hash,sync_id) VALUES ($1,$2)",
              [destinationHash, row.event_arena_sync_id],
            );
          }
          const metadata = await client.query(
            "SELECT source_installation_id,revision FROM event_arena_device_sync WHERE sync_id=$1",
            [row.event_arena_sync_id],
          );
          if (metadata.rows[0]) {
            eventArenaSync = {
              sourceInstallationId: metadata.rows[0].source_installation_id,
              revision: Number(metadata.rows[0].revision),
            };
          }
        }
        return {
          bundle,
          bundleSha256: bundleIntegrityHash(bundle),
          eventArenaSync,
        };
      });
      res.json(bundle);
    } catch (error: any) {
      const status = [404, 409, 410, 422].includes(error?.status) ? error.status : 500;
      res.status(status).json({
        error: status === 404 ? "Transfer code not found."
          : status === 409 ? "Transfer code already used on another phone."
            : status === 410 ? "Transfer code expired."
              : status === 422 ? "The saved-data backup failed its integrity check."
              : "Could not restore the saved-data bundle.",
      });
    }
  });

  router.post("/device-transfer/complete", requireSchema, async (req: any, res: any) => {
    const { code, destinationToken, bundleId, categoryResults } = req.body ?? {};
    if (typeof code !== "string" || code.length < 32 || code.length > 64
      || !validSecret(destinationToken) || typeof bundleId !== "string"
      || !Array.isArray(categoryResults) || categoryResults.length > 20
      || categoryResults.some((item: any) =>
        !item || typeof item.id !== "string"
        || !["restored", "unchanged", "skipped"].includes(item.status))) {
      res.status(400).json({ error: "The restore confirmation is invalid." });
      return;
    }
    try {
      const completed = await withTransaction(db, async (client) => {
        const codeHash = hashSecret(code);
        const result = await client.query(
          `SELECT bundle,bundle_sha256,bundle_id,destination_token_hash,restored_at
           FROM app_device_transfer_codes WHERE code_hash=$1 FOR UPDATE`,
          [codeHash],
        );
        const row = result.rows[0];
        if (!row) throw Object.assign(new Error("Transfer code not found."), { status: 404 });
        if (row.destination_token_hash !== hashSecret(destinationToken)) {
          throw Object.assign(new Error("This phone is not authorized to confirm the transfer."), { status: 409 });
        }
        if (row.restored_at) return true;
        if (!row.bundle || row.bundle_id !== bundleId) {
          throw Object.assign(new Error("The restore confirmation does not match this backup."), { status: 409 });
        }
        const bundle = await getVerifiedBundle(client, codeHash, row);
        const expected = new Set(bundle.categories.map((category) => category.id));
        const received = new Set<string>();
        for (const item of categoryResults) {
          if (!expected.has(item.id) || received.has(item.id)) {
            throw Object.assign(new Error("The restore confirmation categories do not match the backup."), { status: 400 });
          }
          received.add(item.id);
        }
        if (received.size !== expected.size) {
          throw Object.assign(new Error("The restore confirmation is missing saved-data categories."), { status: 400 });
        }
        await client.query(
          `UPDATE app_device_transfer_codes
           SET restored_at=NOW(),bundle=NULL
           WHERE code_hash=$1`,
          [codeHash],
        );
        return true;
      });
      res.json({ completed });
    } catch (error: any) {
      const status = [400, 404, 409, 422].includes(error?.status) ? error.status : 500;
      res.status(status).json({
        error: status === 404 ? "Transfer code not found."
          : status === 409 ? "This phone cannot confirm that transfer."
            : status === 422 ? "The saved-data backup failed its integrity check."
              : status === 400 ? "The restore confirmation is incomplete or invalid."
                : "Could not confirm the saved-data restore.",
      });
    }
  });

  router.post("/device-transfer/restore-alerts", requireSchema, async (req: any, res: any) => {
    const { code, destinationToken, installationId, pushToken, replaceExisting } = req.body ?? {};
    if (typeof code !== "string" || code.length < 32 || code.length > 64
      || !validSecret(destinationToken) || !validInstallationId(installationId)
      || (pushToken !== undefined && !validExpoPushToken(pushToken))
      || typeof replaceExisting !== "boolean") {
      res.status(400).json({ error: "The transfer, destination phone, or notification registration is invalid." });
      return;
    }
    try {
      const alerts = await withTransaction(db, async (client) => {
        const result = await client.query(
          `SELECT bundle,bundle_sha256,destination_token_hash,alert_restore_result,restored_at
           FROM app_device_transfer_codes WHERE code_hash=$1 FOR UPDATE`,
          [hashSecret(code)],
        );
        const row = result.rows[0];
        if (!row) throw Object.assign(new Error("Transfer code not found."), { status: 404 });
        if (!row.destination_token_hash || row.destination_token_hash !== hashSecret(destinationToken)) {
          throw Object.assign(new Error("This phone has not redeemed the transfer code."), { status: 409 });
        }
        if (row.restored_at || row.bundle == null) {
          throw Object.assign(new Error("This transfer has already been completed."), { status: 410 });
        }
        const bundle = await getVerifiedBundle(client, hashSecret(code), row);
        const category = bundle.categories.find((item) => item.id === "price-alerts");
        const raw = category?.data["@stocksense/price_alerts_v1"];
        const sourceAlerts = raw ? JSON.parse(raw) as Array<{
          id: string;
          symbol: string;
          direction: "above" | "below";
          targetPrice: number;
          createdAt: string;
          firedAt: string | null;
          paused: boolean;
        }> : [];
        if (sourceAlerts.length > 0 && !validExpoPushToken(pushToken)) {
          throw Object.assign(new Error("A registered push token is required to restore alerts."), { status: 400 });
        }
        if (validExpoPushToken(pushToken)) {
          await client.query(
            `INSERT INTO push_devices (installation_id,expo_push_token,platform,enabled,last_seen_at,updated_at)
             VALUES ($1,$2,'android',TRUE,NOW(),NOW())
             ON CONFLICT (installation_id) DO UPDATE SET
               expo_push_token=EXCLUDED.expo_push_token,enabled=TRUE,last_seen_at=NOW(),updated_at=NOW()`,
            [installationId, pushToken],
          );
        }
        if (row.alert_restore_result) {
          const savedAlerts = typeof row.alert_restore_result === "string"
            ? JSON.parse(row.alert_restore_result)
            : row.alert_restore_result;
          if (replaceExisting) {
            const importedIds = savedAlerts.map((alert: any) => alert.id);
            await client.query(
              "DELETE FROM price_alerts WHERE installation_id=$1 AND NOT (id = ANY($2::text[]))",
              [installationId, importedIds],
            );
          }
          return savedAlerts;
        }

        if (replaceExisting) {
          await client.query("DELETE FROM price_alerts WHERE installation_id=$1", [installationId]);
        }
        const restored = [];
        for (const alert of sourceAlerts) {
          const inserted = await client.query(
            `INSERT INTO price_alerts
               (id,user_id,installation_id,symbol,direction,target_price,push_token,created_at,fired_at,paused)
             VALUES ($1,NULL,$2,$3,$4,$5,$6,$7,$8,$9)
             RETURNING id,symbol,direction,target_price,created_at,fired_at,paused`,
            [
              randomUUID(), installationId, alert.symbol, alert.direction, alert.targetPrice,
              pushToken, alert.createdAt, alert.firedAt, alert.paused,
            ],
          );
          restored.push(normalizeAlert(inserted.rows[0]));
        }
        await client.query(
          "UPDATE app_device_transfer_codes SET alert_restore_result=$2::jsonb WHERE code_hash=$1",
          [hashSecret(code), JSON.stringify(restored)],
        );
        return restored;
      });
      res.json({ alerts });
    } catch (error: any) {
      const status = [400, 404, 409, 410, 422].includes(error?.status) ? error.status : 500;
      res.status(status).json({
        error: status === 400 ? "A registered destination notification token is required for saved alerts."
          : status === 404 ? "Transfer code not found."
            : status === 409 ? "The transfer code is not authorized for this phone."
              : status === 410 ? "This transfer has already been completed."
                : status === 422 ? "The saved-data backup failed its integrity check."
                  : "Could not restore price alerts.",
      });
    }
  });

  return router;
}
