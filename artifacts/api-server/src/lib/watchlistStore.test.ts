/**
 * Integration tests for watchlist drag-reorder persistence.
 * Run: node --test --experimental-strip-types src/lib/watchlistStore.test.ts
 *
 * These run against the real Postgres (DATABASE_URL) using a throwaway
 * random user id, so they exercise the exact SQL the API routes use:
 * - PUT /api/user/watchlist/reorder → reorderWatchlist writes sort_order 0..n-1
 * - GET /api/user/watchlist → getWatchlist returns rows in saved order,
 *   not created_at order, including from a brand-new connection pool
 *   (simulating a server restart / next app launch).
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import pg from "pg";
import {
  getWatchlist,
  addToWatchlist,
  reorderWatchlist,
  removeFromWatchlist,
} from "./watchlistStore.ts";

const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const userId = `test-reorder-${randomUUID()}`;

before(async () => {
  // Mirror the boot migration so the table/column exist even on a fresh DB.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS watchlist (
      user_id TEXT NOT NULL,
      symbol TEXT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      PRIMARY KEY (user_id, symbol)
    )
  `);
  await pool.query(
    "ALTER TABLE watchlist ADD COLUMN IF NOT EXISTS sort_order INTEGER DEFAULT 0",
  );
  await pool.query("DELETE FROM watchlist WHERE user_id=$1", [userId]);

  // Insert with explicit, staggered created_at so created_at order (newest
  // first: MSFT, GOOG, AAPL) is distinguishable from the drag order we save.
  const seed = [
    { symbol: "AAPL", createdAt: "2026-01-01T00:00:00Z" },
    { symbol: "GOOG", createdAt: "2026-01-02T00:00:00Z" },
    { symbol: "MSFT", createdAt: "2026-01-03T00:00:00Z" },
  ];
  for (const s of seed) {
    await pool.query(
      "INSERT INTO watchlist (user_id, symbol, created_at, sort_order) VALUES ($1,$2,$3,0)",
      [userId, s.symbol, s.createdAt],
    );
  }
});

after(async () => {
  await pool.query("DELETE FROM watchlist WHERE user_id=$1", [userId]);
  await pool.end();
});

test("reorder writes sort_order 0..n-1 matching the given symbol order", async () => {
  await reorderWatchlist(pool, userId, ["GOOG", "AAPL", "MSFT"]);
  const { rows } = await pool.query(
    "SELECT symbol, sort_order FROM watchlist WHERE user_id=$1 ORDER BY symbol",
    [userId],
  );
  const bySymbol = Object.fromEntries(rows.map((r: any) => [r.symbol, r.sort_order]));
  assert.deepEqual(bySymbol, { GOOG: 0, AAPL: 1, MSFT: 2 });
});

test("GET returns items in saved drag order, not created_at order", async () => {
  await reorderWatchlist(pool, userId, ["msft", "aapl", "goog"]); // lowercase → normalized
  const list = await getWatchlist(pool, userId);
  assert.deepEqual(list.map((i) => i.symbol), ["MSFT", "AAPL", "GOOG"]);
  assert.deepEqual(list.map((i) => i.sortOrder), [0, 1, 2]);
  // created_at order (newest first) would be MSFT, GOOG, AAPL — prove we
  // are NOT simply matching it by saving an order that differs from it.
  await reorderWatchlist(pool, userId, ["AAPL", "MSFT", "GOOG"]);
  const list2 = await getWatchlist(pool, userId);
  assert.deepEqual(list2.map((i) => i.symbol), ["AAPL", "MSFT", "GOOG"]);
});

test("saved order survives a restart (fresh connection pool)", async () => {
  await reorderWatchlist(pool, userId, ["GOOG", "MSFT", "AAPL"]);
  // A new Pool is what a restarted server (or next app launch) would use.
  const freshPool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    const list = await getWatchlist(freshPool, userId);
    assert.deepEqual(list.map((i) => i.symbol), ["GOOG", "MSFT", "AAPL"]);
  } finally {
    await freshPool.end();
  }
});

test("adding a new symbol puts it on top and shifts saved order down intact", async () => {
  await reorderWatchlist(pool, userId, ["GOOG", "MSFT", "AAPL"]);
  await addToWatchlist(pool, userId, "tsla");
  const list = await getWatchlist(pool, userId);
  assert.deepEqual(list.map((i) => i.symbol), ["TSLA", "GOOG", "MSFT", "AAPL"]);
  await removeFromWatchlist(pool, userId, "TSLA");
  const list2 = await getWatchlist(pool, userId);
  assert.deepEqual(list2.map((i) => i.symbol), ["GOOG", "MSFT", "AAPL"]);
});
