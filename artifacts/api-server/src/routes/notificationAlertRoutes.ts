import { Router } from "express";

interface AlertDatabase {
  query(sql: string, values?: any[]): Promise<{ rows: any[] }>;
}

type Middleware = (req: any, res: any, next: any) => void;

function validInstallationId(value: unknown): value is string {
  return typeof value === "string" && value.length >= 12 && value.length <= 128;
}

function validExpoPushToken(value: unknown): value is string {
  return typeof value === "string"
    && value.length >= 20
    && value.length <= 256
    && /^(Expo(nent)?PushToken)\[.+\]$/.test(value);
}

function normalizeAlertRow(row: any) {
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

export function createNotificationAlertRouter(
  db: AlertDatabase,
  requireSchema: Middleware,
  createId: () => string,
) {
  const router = Router();

  router.post("/notifications/device", requireSchema, async (req: any, res: any) => {
    const { installationId, expoPushToken, platform } = req.body ?? {};
    if (!validInstallationId(installationId) || !validExpoPushToken(expoPushToken)) {
      res.status(400).json({ error: "valid installationId and Expo push token required" });
      return;
    }
    const normalizedPlatform = platform === "ios" ? "ios" : "android";
    try {
      await db.query(
        `INSERT INTO push_devices (installation_id, expo_push_token, platform, enabled, last_seen_at, updated_at)
         VALUES ($1,$2,$3,TRUE,NOW(),NOW())
         ON CONFLICT (installation_id) DO UPDATE SET
           expo_push_token = EXCLUDED.expo_push_token,
           platform = EXCLUDED.platform,
           enabled = TRUE,
           last_seen_at = NOW(),
           updated_at = NOW()`,
        [installationId, expoPushToken, normalizedPlatform],
      );
      res.json({ ok: true });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  router.get("/notifications/alerts", requireSchema, async (req: any, res: any) => {
    const installationId = req.query.installationId;
    if (!validInstallationId(installationId)) {
      res.status(400).json({ error: "valid installationId required" });
      return;
    }
    try {
      const { rows } = await db.query(
        `SELECT id, symbol, direction, target_price, created_at, fired_at, paused
         FROM price_alerts
         WHERE installation_id=$1
         ORDER BY created_at DESC`,
        [installationId],
      );
      res.json(rows.map(normalizeAlertRow));
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  router.post("/notifications/alerts", requireSchema, async (req: any, res: any) => {
    const { installationId, symbol, direction, targetPrice, pushToken } = req.body ?? {};
    const normalizedSymbol = typeof symbol === "string" ? symbol.toUpperCase().trim() : "";
    const numericTarget = Number(targetPrice);
    if (
      !validInstallationId(installationId)
      || !normalizedSymbol
      || normalizedSymbol.length > 12
      || !validExpoPushToken(pushToken)
      || !Number.isFinite(numericTarget)
      || numericTarget <= 0
      || (direction !== "above" && direction !== "below")
    ) {
      res.status(400).json({ error: "installationId, symbol, direction, targetPrice, and pushToken are required" });
      return;
    }
    try {
      await db.query(
        `INSERT INTO push_devices (installation_id, expo_push_token, platform, enabled, last_seen_at, updated_at)
         VALUES ($1,$2,'android',TRUE,NOW(),NOW())
         ON CONFLICT (installation_id) DO UPDATE SET
           expo_push_token = EXCLUDED.expo_push_token,
           enabled = TRUE,
           last_seen_at = NOW(),
           updated_at = NOW()`,
        [installationId, pushToken],
      );
      const id = createId();
      const inserted = await db.query(
        `INSERT INTO price_alerts (id, user_id, installation_id, symbol, direction, target_price, push_token)
         VALUES ($1,NULL,$2,$3,$4,$5,$6)
         RETURNING id, symbol, direction, target_price, created_at, fired_at, paused`,
        [id, installationId, normalizedSymbol, direction, numericTarget, pushToken],
      );
      res.json(normalizeAlertRow(inserted.rows[0]));
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  router.put("/notifications/alerts/:id", requireSchema, async (req: any, res: any) => {
    const { installationId, direction, targetPrice, pushToken } = req.body ?? {};
    const numericTarget = Number(targetPrice);
    if (
      !validInstallationId(installationId)
      || !validExpoPushToken(pushToken)
      || !Number.isFinite(numericTarget)
      || numericTarget <= 0
      || (direction !== "above" && direction !== "below")
    ) {
      res.status(400).json({ error: "installationId, direction, targetPrice, and pushToken are required" });
      return;
    }
    try {
      await db.query(
        `INSERT INTO push_devices (installation_id, expo_push_token, platform, enabled, last_seen_at, updated_at)
         VALUES ($1,$2,'android',TRUE,NOW(),NOW())
         ON CONFLICT (installation_id) DO UPDATE SET
           expo_push_token = EXCLUDED.expo_push_token,
           enabled = TRUE,
           last_seen_at = NOW(),
           updated_at = NOW()`,
        [installationId, pushToken],
      );
      const { rows } = await db.query(
        `UPDATE price_alerts
         SET direction=$3, target_price=$4, push_token=$5, fired_at=NULL, created_at=NOW()
         WHERE id=$1 AND installation_id=$2
         RETURNING id, symbol, direction, target_price, created_at, fired_at, paused`,
        [req.params.id, installationId, direction, numericTarget, pushToken],
      );
      if (!rows[0]) {
        res.status(404).json({ error: "Alert not found" });
        return;
      }
      res.json(normalizeAlertRow(rows[0]));
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  router.patch("/notifications/alerts/:id", requireSchema, async (req: any, res: any) => {
    const { installationId, paused } = req.body ?? {};
    if (!validInstallationId(installationId) || typeof paused !== "boolean") {
      res.status(400).json({ error: "valid installationId and paused boolean required" });
      return;
    }
    try {
      const { rows } = await db.query(
        `UPDATE price_alerts
         SET paused=$3
         WHERE id=$1 AND installation_id=$2
         RETURNING id, symbol, direction, target_price, created_at, fired_at, paused`,
        [req.params.id, installationId, paused],
      );
      if (!rows[0]) {
        res.status(404).json({ error: "Alert not found" });
        return;
      }
      res.json(normalizeAlertRow(rows[0]));
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  router.delete("/notifications/alerts/:id", requireSchema, async (req: any, res: any) => {
    const installationId = req.query.installationId;
    if (!validInstallationId(installationId)) {
      res.status(400).json({ error: "valid installationId required" });
      return;
    }
    try {
      const { rows } = await db.query(
        "DELETE FROM price_alerts WHERE id=$1 AND installation_id=$2 RETURNING id",
        [req.params.id, installationId],
      );
      if (!rows[0]) {
        res.status(404).json({ error: "Alert not found" });
        return;
      }
      res.json({ ok: true });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  return router;
}
