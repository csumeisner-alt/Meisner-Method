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
  assert.match(settings, /alert\.firedAt \? 'Fired' : 'Active'/);
  assert.match(home, /onAddAlert=\{openNewAlertModal\}/);
  assert.match(home, /onEditAlert=\{openManagedAlertModal\}/);
});

test("alert collapse state persists and modal edits target one alert ID", () => {
  assert.match(settings, /AsyncStorage\.getItem\(ALERTS_COLLAPSED_KEY\)/);
  assert.match(settings, /AsyncStorage\.setItem\(ALERTS_COLLAPSED_KEY/);
  assert.match(settings, /toggle-alerts-collapsed/);
  assert.match(modal, /existingAlertId\?: string/);
  assert.match(home, /watchlist\.updateAlert\(selectedAlert\.id/);
});
