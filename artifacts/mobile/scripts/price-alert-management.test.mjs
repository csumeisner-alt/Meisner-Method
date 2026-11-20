import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const watchlistHook = source("../hooks/useWatchlist.ts");
const settings = source("../components/DonationSidebar.tsx");
const home = source("../app/(tabs)/index.tsx");
const modal = source("../components/PriceAlertModal.tsx");
const apiRoutes = source("../../api-server/src/routes/user.ts");
const notificationRoutes = source("../../api-server/src/routes/notificationAlertRoutes.ts");

test("creating a price alert preserves other active alerts for the same symbol", () => {
  assert.match(watchlistHook, /const next = \[saved, \.\.\.prev\]/);
  assert.match(watchlistHook, /const updateAlert = useCallback/);
  assert.match(watchlistHook, /method: 'PUT'/);
  assert.match(notificationRoutes, /router\.put\("\/notifications\/alerts\/:id"/);
  assert.doesNotMatch(
    notificationRoutes.slice(notificationRoutes.indexOf('router.post("/notifications/alerts"'), notificationRoutes.indexOf('router.put("/notifications/alerts/')),
    /UPDATE price_alerts/,
  );
});

test("settings lists alerts by ticker with independent edit and remove actions", () => {
  assert.match(settings, /settings-price-alerts/);
  assert.match(settings, /alerts\.reduce<Record<string, AlertData\[\]>>/);
  assert.match(settings, /onEditAlert\(alert\)/);
  assert.match(settings, /onDeleteAlert\(alert\.id\)/);
  assert.match(settings, /alert\.paused \? \(alert\.firedAt \? 'Paused · Fired' : 'Paused'\)/);
  assert.match(settings, /onSetAlertPaused\(alert\.id, !alert\.paused\)/);
  assert.match(settings, /accessibilityLabel=\{\`\$\{alert\.paused \? 'Resume' : 'Pause'\}/);
  assert.match(home, /onSetAlertPaused=\{\(id, paused\) => watchlist\.setAlertPaused\(id, paused\)\}/);
  assert.match(watchlistHook, /method: 'PATCH'/);
  assert.match(watchlistHook, /!a\.firedAt && !a\.paused/);
  assert.match(notificationRoutes, /router\.patch\("\/notifications\/alerts\/:id"/);
  assert.match(notificationRoutes, /SET paused=\$3\s+WHERE id=\$1 AND installation_id=\$2/);
  assert.match(home, /onAddAlert=\{openNewAlertModal\}/);
  assert.match(home, /onEditAlert=\{openManagedAlertModal\}/);
});

test("paused alerts are excluded from both worker queries and can resume", () => {
  const workerCycle = source("../../api-server/src/lib/alertWorkerCycle.ts");
  assert.match(workerCycle, /AND a\.paused=FALSE/);
  assert.match(apiRoutes, /runAlertCheckCycle\(pool/);
  assert.match(apiRoutes, /ALTER TABLE price_alerts ADD COLUMN IF NOT EXISTS paused BOOLEAN NOT NULL DEFAULT FALSE/);
  assert.match(watchlistHook, /const setAlertPaused = useCallback/);
  assert.match(watchlistHook, /method: 'PATCH'/);
});

test("a refresh keeps the server pause state instead of applying an older cache read afterward", () => {
  assert.match(
    watchlistHook,
    /apiFetch<AlertData\[\]>\([\s\S]*?\.then\(\(alertList\) => \{\s*void writeAlertCache\(alertList\);\s*return alertList;/,
  );
  assert.match(watchlistHook, /setAlerts\(alertList\)/);
  assert.doesNotMatch(watchlistHook, /readAlertCache\(\)\.then\(\(cached\) =>/);
  assert.match(settings, /alert\.paused \? \(alert\.firedAt \? 'Paused · Fired' : 'Paused'\)/);
  assert.match(settings, /accessibilityLabel=\{\`\$\{alert\.paused \? 'Resume' : 'Pause'\}/);
});

test("alert collapse state persists and modal edits target one alert ID", () => {
  assert.match(settings, /AsyncStorage\.getItem\(ALERTS_COLLAPSED_KEY\)/);
  assert.match(settings, /AsyncStorage\.setItem\(ALERTS_COLLAPSED_KEY/);
  assert.match(settings, /toggle-alerts-collapsed/);
  assert.match(modal, /existingAlertId\?: string/);
  assert.match(home, /watchlist\.updateAlert\(selectedAlert\.id/);
});
