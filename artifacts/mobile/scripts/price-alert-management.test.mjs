import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const watchlistHook = source("../hooks/useWatchlist.ts");
const settings = source("../components/DonationSidebar.tsx");
const home = source("../app/index.tsx");
const modal = source("../components/PriceAlertModal.tsx");
const apiRoutes = source("../../api-server/src/routes/user.ts");

test("creating a price alert preserves other active alerts for the same symbol", () => {
  assert.match(watchlistHook, /const next = \[saved, \.\.\.prev\]/);
  assert.match(watchlistHook, /const updateAlert = useCallback/);
  assert.match(watchlistHook, /method: 'PUT'/);
  assert.match(apiRoutes, /router\.put\("\/notifications\/alerts\/:id"/);
  assert.doesNotMatch(
    apiRoutes.slice(apiRoutes.indexOf('router.post("/notifications/alerts"'), apiRoutes.indexOf('router.put("/notifications/alerts/')),
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
  assert.match(apiRoutes, /router\.patch\("\/notifications\/alerts\/:id"/);
  assert.match(apiRoutes, /SET paused=\$3\s+WHERE id=\$1 AND installation_id=\$2/);
  assert.match(home, /onAddAlert=\{openNewAlertModal\}/);
  assert.match(home, /onEditAlert=\{openManagedAlertModal\}/);
});

test("paused alerts are excluded from both worker queries and can resume", () => {
  const workerCycle = source("../../api-server/src/lib/alertWorkerCycle.ts");
  assert.match(workerCycle, /AND a\.paused=FALSE/);
  assert.match(apiRoutes, /AND a\.paused=FALSE/);
  assert.match(apiRoutes, /ALTER TABLE price_alerts ADD COLUMN IF NOT EXISTS paused BOOLEAN NOT NULL DEFAULT FALSE/);
  assert.match(watchlistHook, /const setAlertPaused = useCallback/);
  assert.match(watchlistHook, /method: 'PATCH'/);
});

test("alert collapse state persists and modal edits target one alert ID", () => {
  assert.match(settings, /AsyncStorage\.getItem\(ALERTS_COLLAPSED_KEY\)/);
  assert.match(settings, /AsyncStorage\.setItem\(ALERTS_COLLAPSED_KEY/);
  assert.match(settings, /toggle-alerts-collapsed/);
  assert.match(modal, /existingAlertId\?: string/);
  assert.match(home, /watchlist\.updateAlert\(selectedAlert\.id/);
});
