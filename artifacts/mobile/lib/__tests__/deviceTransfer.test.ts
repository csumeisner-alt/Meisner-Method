import assert from "node:assert/strict";
import test from "node:test";
import {
  DEVICE_TRANSFER_CATEGORIES,
  DEVICE_TRANSFER_MANIFEST,
  validateDeviceTransferBundle,
} from "../../../../lib/api-zod/src/deviceTransferManifest.ts";
import {
  applyDeviceTransfer,
  createDeviceTransferBundle,
  DEVICE_TRANSFER_JOURNAL_KEY,
  preflightDeviceTransfer,
  recoverInterruptedDeviceTransfer,
  type DeviceTransferStorage,
} from "../deviceTransfer.ts";

class MemoryStorage implements DeviceTransferStorage {
  values = new Map<string, string>();
  failNextSetFor: string | null = null;

  constructor(seed: Record<string, string> = {}) {
    for (const [key, value] of Object.entries(seed)) this.values.set(key, value);
  }

  async getItem(key: string) {
    return this.values.get(key) ?? null;
  }

  async setItem(key: string, value: string) {
    if (this.failNextSetFor === key) {
      this.failNextSetFor = null;
      throw new Error("simulated device storage interruption");
    }
    this.values.set(key, value);
  }

  async removeItem(key: string) {
    this.values.delete(key);
  }

  async getAllKeys() {
    return [...this.values.keys()];
  }
}

const watchlistKey = "@stocksense/watchlist_v1/__guest__";
const sourceWatchlist = JSON.stringify([
  { symbol: "AAPL", createdAt: "2026-11-16T10:00:00.000Z", sortOrder: 0 },
  { symbol: "MSFT", createdAt: "2026-11-16T11:00:00.000Z", sortOrder: 1 },
]);
const makeBundle = (raw = sourceWatchlist) => ({
  version: 1,
  bundleId: "test-bundle-12345",
  exportedAt: "2026-11-17T12:00:00.000Z",
  categories: [{
    id: "watchlist",
    version: 1,
    data: { [watchlistKey]: raw },
  }],
});

test("manifest identifies portable, server-owned, rebuildable, and device-bound data", () => {
  assert.equal(DEVICE_TRANSFER_CATEGORIES.length, 9);
  assert.ok(DEVICE_TRANSFER_MANIFEST.some((entry) => entry.portability === "server-managed"));
  assert.ok(DEVICE_TRANSFER_MANIFEST.some((entry) => entry.portability === "rebuildable"));
  assert.ok(DEVICE_TRANSFER_MANIFEST.some((entry) => entry.portability === "device-bound"));
  assert.ok(DEVICE_TRANSFER_MANIFEST.some((entry) => entry.keys?.includes("@stocksense/installation_id")));
  const migrated = validateDeviceTransferBundle(makeBundle());
  assert.equal(migrated.version, 2);
  assert.equal(migrated.categories[0]?.version, 2);
  assert.equal(migrated.categories[0]?.id, "watchlist");
});

test("bundle validation rejects unknown keys and broken financial relationships", () => {
  assert.throws(() => validateDeviceTransferBundle({
    ...makeBundle(),
    categories: [{ id: "watchlist", version: 1, data: { "@stocksense/installation_id": "copied-id" } }],
  }), /unsupported saved item/i);

  const brokenPaper = {
    version: 1,
    bundleId: "broken-bundle-1234",
    exportedAt: "2026-11-17T12:00:00.000Z",
    categories: [{
      id: "paper-and-event-arena",
      version: 1,
      data: {
        "@stocksense/paper_v2": JSON.stringify({
          accounts: [{ id: "account-1", name: "Practice", cash: 100_000 }],
          positions: [{ id: "position-1", accountId: "missing-account" }],
          transactions: [],
          orders: [],
          lots: [],
          activeId: "account-1",
        }),
      },
    }],
  };
  assert.throws(() => validateDeviceTransferBundle(brokenPaper), /do not match their accounts/i);

  const alertWithCredential = {
    version: 1,
    bundleId: "alert-bundle-1234",
    exportedAt: "2026-11-17T12:00:00.000Z",
    categories: [{
      id: "price-alerts",
      version: 1,
      data: {
        "@stocksense/price_alerts_v1": JSON.stringify([{
          id: "alert-1",
          symbol: "AAPL",
          direction: "above",
          targetPrice: 250,
          createdAt: "2026-11-16T10:00:00.000Z",
          firedAt: null,
          paused: false,
          pushToken: "ExponentPushToken[should-not-transfer]",
        }]),
      },
    }],
  };
  assert.throws(() => validateDeviceTransferBundle(alertWithCredential), /device credentials/i);
});

test("paper snapshots and Event Arena enrollments must reference included account IDs", () => {
  const paperCategory = {
    id: "paper-and-event-arena",
    version: 1,
    data: {
      "@stocksense/paper_v2": JSON.stringify({
        accounts: [{ id: "paper-1", name: "Practice", cash: 100_000, createdAt: "2026-11-16T10:00:00.000Z" }],
        positions: [],
        transactions: [],
        orders: [],
        lots: [],
        activeId: "paper-1",
      }),
      "@stocksense/paper_equity_snapshots_v1": JSON.stringify([
        { accountId: "paper-1", date: "2026-11-16T10:00:00.000Z", value: 100_000 },
      ]),
      "@stocksense/paper_events_v1": JSON.stringify({
        enrollment: {
          eventId: "event-1",
          accountId: "paper-1",
          eventStartAtMs: 1_000,
          eventEndAtMs: 2_000,
          joinedAtMs: 1_000,
          startEquity: 100_000,
        },
        lightningEnrollment: null,
        history: [],
      }),
    },
  };
  const valid = {
    version: 1,
    bundleId: "paper-bundle-1234",
    exportedAt: "2026-11-17T12:00:00.000Z",
    categories: [paperCategory],
  };
  assert.equal(validateDeviceTransferBundle(valid).categories[0]?.id, "paper-and-event-arena");

  const orphan = structuredClone(valid);
  orphan.categories[0]!.data["@stocksense/paper_events_v1"] = JSON.stringify({
    enrollment: {
      eventId: "event-1",
      accountId: "missing-account",
      eventStartAtMs: 1_000,
      eventEndAtMs: 2_000,
      joinedAtMs: 1_000,
      startEquity: 100_000,
    },
    lightningEnrollment: null,
    history: [],
  });
  assert.throws(() => validateDeviceTransferBundle(orphan), /does not match its saved account/i);
});

test("source bundle preserves local values, and exact repeated imports are idempotent", async () => {
  const source = new MemoryStorage({
    [watchlistKey]: sourceWatchlist,
    "@stocksense/installation_id": "source-installation-id",
  });
  const bundle = await createDeviceTransferBundle(source, "source-bundle-123");
  const destination = new MemoryStorage();
  const first = await applyDeviceTransfer(destination, bundle, null);
  assert.equal(first.results.find((item) => item.id === "watchlist")?.status, "restored");
  assert.equal(first.results.find((item) => item.id === "authenticated-records")?.status, "unchanged");
  assert.equal(first.results.find((item) => item.id === "installation-notifications")?.status, "skipped");
  assert.equal(first.results.find((item) => item.id === "rebuildable-market-cache")?.status, "skipped");
  assert.equal(first.results.find((item) => item.id === "device-pairing-state")?.status, "skipped");
  assert.equal(await destination.getItem(watchlistKey), sourceWatchlist);
  assert.equal(bundle.categories.some((category) => Object.keys(category.data).includes("@stocksense/installation_id")), false);
  const repeated = await applyDeviceTransfer(destination, bundle, null);
  assert.equal(repeated.results.find((item) => item.id === "watchlist")?.status, "unchanged");
  assert.equal(await source.getItem(watchlistKey), sourceWatchlist);
});

test("a fresh install restores a version-one backup through the current schema", async () => {
  const timestamp = "2026-11-16T10:00:00.000Z";
  const legacyBundle = {
    version: 1,
    bundleId: "reinstall-bundle-123",
    exportedAt: "2026-11-17T12:00:00.000Z",
    categories: [
      {
        id: "paper-and-event-arena",
        version: 1,
        data: {
          "@stocksense/paper_v2": JSON.stringify({
            accounts: [{ id: "account-1", name: "Practice", cash: 95_000, createdAt: timestamp }],
            positions: [],
            transactions: [],
            orders: [],
            lots: [],
            activeId: "account-1",
          }),
          "@stocksense/paper_equity_snapshots_v1": JSON.stringify([
            { accountId: "account-1", date: timestamp, value: 100_000 },
          ]),
        },
      },
      {
        id: "portfolio-history",
        version: 1,
        data: {
          "@stocksense/portfolio_trades_v1": JSON.stringify([
            { id: "trade-1", symbol: "AAPL", type: "buy", shares: 2, pricePerShare: 101, date: timestamp },
          ]),
        },
      },
      { id: "watchlist", version: 1, data: { [watchlistKey]: sourceWatchlist } },
      {
        id: "theme-and-brew-progress",
        version: 1,
        data: {
          "@stocksense/facts_read_v1": "8",
          "@stocksense/brew_tokens_v1": "3",
          "@stocksense/brew_sound_enabled_v1": "false",
        },
      },
      {
        id: "price-alerts",
        version: 1,
        data: {
          "@stocksense/price_alerts_v1": JSON.stringify([{
            id: "alert-1",
            symbol: "AAPL",
            direction: "above",
            targetPrice: 250,
            createdAt: timestamp,
            firedAt: null,
            paused: false,
          }]),
        },
      },
      {
        id: "achievements",
        version: 1,
        data: {
          "@meisnermethod/achievements_v1": JSON.stringify(["first-quote"]),
          "@meisnermethod/analyze_search_count_v1": "4",
        },
      },
      { id: "custom-heat-map", version: 1, data: { "meisner.heat-map.custom-symbols.v1": JSON.stringify(["AAPL", "MSFT"]) } },
      { id: "research-and-comparisons", version: 1, data: { "@stocksense/pinned_comp_symbol": "SPY" } },
      { id: "saved-display-preferences", version: 1, data: { "@stocksense/watchlist_collapsed": "1" } },
    ],
  };

  // The empty destination represents AsyncStorage after a full uninstall.
  const reinstalledAppStorage = new MemoryStorage();
  const restored = await applyDeviceTransfer(reinstalledAppStorage, legacyBundle, null);
  assert.equal(restored.results.filter((result) => result.status === "restored").length, 9);
  assert.equal(await reinstalledAppStorage.getItem(watchlistKey), sourceWatchlist);
  assert.match(await reinstalledAppStorage.getItem("@stocksense/paper_v2") ?? "", /account-1/);
  assert.match(await reinstalledAppStorage.getItem("@stocksense/portfolio_trades_v1") ?? "", /trade-1/);
  assert.equal(await reinstalledAppStorage.getItem("@stocksense/facts_read_v1"), "8");
  assert.match(await reinstalledAppStorage.getItem("@stocksense/price_alerts_v1") ?? "", /alert-1/);
  assert.match(await reinstalledAppStorage.getItem("@meisnermethod/achievements_v1") ?? "", /first-quote/);
  assert.equal(await reinstalledAppStorage.getItem("meisner.heat-map.custom-symbols.v1"), '["AAPL","MSFT"]');
  assert.equal(await reinstalledAppStorage.getItem("@stocksense/pinned_comp_symbol"), "SPY");
  assert.equal(await reinstalledAppStorage.getItem("@stocksense/watchlist_collapsed"), "1");
});

test("conflicting financial categories require a choice and are never merged", async () => {
  const destination = new MemoryStorage({
    [watchlistKey]: JSON.stringify([{ symbol: "TSLA", createdAt: "2026-11-15T10:00:00.000Z" }]),
  });
  const preview = await preflightDeviceTransfer(destination, makeBundle());
  assert.equal(preview.categories.find((item) => item.id === "watchlist")?.status, "conflict");
  const undecided = await applyDeviceTransfer(destination, makeBundle(), null);
  assert.equal(undecided.needsReview, true);
  assert.match(await destination.getItem(watchlistKey) ?? "", /TSLA/);

  const keep = await applyDeviceTransfer(destination, makeBundle(), "keep-destination");
  assert.equal(keep.results.find((item) => item.id === "watchlist")?.status, "skipped");
  assert.match(await destination.getItem(watchlistKey) ?? "", /TSLA/);
  const replace = await applyDeviceTransfer(destination, makeBundle(), "replace-conflicts");
  assert.equal(replace.results.find((item) => item.id === "watchlist")?.status, "restored");
  assert.match(await destination.getItem(watchlistKey) ?? "", /AAPL/);
  assert.doesNotMatch(await destination.getItem(watchlistKey) ?? "", /TSLA/);
});

test("a destination change after review requires a fresh preflight before any writes", async () => {
  const destination = new MemoryStorage();
  const bundle = makeBundle();
  const reviewed = await preflightDeviceTransfer(destination, bundle);
  await destination.setItem(watchlistKey, JSON.stringify([
    { symbol: "TSLA", createdAt: "2026-11-17T10:00:00.000Z" },
  ]));
  const applied = await applyDeviceTransfer(destination, bundle, "replace-conflicts", reviewed);
  assert.equal(applied.needsReview, true);
  assert.match(await destination.getItem(watchlistKey) ?? "", /TSLA/);
});

test("interrupted restore rolls back before retrying, and a failed write leaves destination unchanged", async () => {
  const original = JSON.stringify([{ symbol: "TSLA", createdAt: "2026-11-15T10:00:00.000Z" }]);
  const destination = new MemoryStorage({
    [watchlistKey]: sourceWatchlist,
    [DEVICE_TRANSFER_JOURNAL_KEY]: JSON.stringify({
      state: "applying",
      before: [{ key: watchlistKey, value: original }],
    }),
  });
  await recoverInterruptedDeviceTransfer(destination);
  assert.equal(await destination.getItem(watchlistKey), original);
  assert.equal(await destination.getItem(DEVICE_TRANSFER_JOURNAL_KEY), null);

  destination.failNextSetFor = watchlistKey;
  const failed = await applyDeviceTransfer(destination, makeBundle(), "replace-conflicts");
  assert.equal(failed.results.find((item) => item.id === "watchlist")?.status, "failed");
  assert.equal(await destination.getItem(watchlistKey), original);
  assert.equal(await destination.getItem(DEVICE_TRANSFER_JOURNAL_KEY), null);
});

