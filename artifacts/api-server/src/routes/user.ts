/**
 * User-data routes plus anonymous device notification routes.
 * Account-dependent routes require Clerk. Notification routes use a random
 * installation ID so guests can receive alerts without creating an account.
 */
import { Router } from "express";
import { getAuth } from "@clerk/express";
import pg from "pg";
import { logger } from "../lib/logger.js";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { join, dirname } from "node:path";
import { randomUUID } from "node:crypto";
import {
  processPendingAlerts,
  classifyExpoPushResponse,
  type PendingAlert,
} from "../lib/alertLogic.js";
import {
  getWatchlist,
  addToWatchlist,
  reorderWatchlist,
  removeFromWatchlist,
} from "../lib/watchlistStore.js";

const { Pool } = pg;

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
pool.on("error", (err) => {
  // pg emits idle-client errors on the pool. Without a listener Node treats
  // a database restart/connection termination as an uncaught exception and
  // takes down the entire API process, including database-independent routes.
  logger.error({ err }, "PostgreSQL pool connection error");
});

const execFileAsync = promisify(execFile);
const __watchlistDirname = dirname(fileURLToPath(import.meta.url));
// fetch_price.py is copied to dist/ by build.mjs alongside this bundle.
// The alert worker only needs a current price; using the richer quote script
// also loads ticker.info for metadata and can exceed the worker timeout.
const PRICE_SCRIPT_PATH = join(__watchlistDirname, "fetch_price.py");

// Idempotent schema migrations for columns added after the tables were first
// created. Safe to run on every boot; existing rows get the DEFAULT.
//
// These migrations MUST complete before any endpoint that references the added
// columns (expense_ratio, fee) serves traffic — otherwise a request that lands
// during boot, or after a silent ALTER failure, would query a half-migrated
// schema and error. We gate those endpoints on `ensureSchema()` (see
// `requireSchema` below), and surface a migration failure loudly instead of
// swallowing it: the failed promise is cleared so the next request retries,
// and callers get a 503 in the meantime rather than a confusing 500.
let schemaReady: Promise<void> | null = null;

async function runSchemaMigrations(): Promise<void> {
  // ── Paper trading tables ───────────────────────────────────────────────────
  // Create the base tables with composite keys if they don't exist, then add
  // any columns that may be missing from older deployments.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS paper_accounts (
      id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      name TEXT NOT NULL,
      cash DOUBLE PRECISION NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (id, user_id)
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS paper_positions (
      id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      account_id TEXT NOT NULL,
      symbol TEXT NOT NULL,
      company_name TEXT,
      shares DOUBLE PRECISION NOT NULL DEFAULT 0,
      avg_cost DOUBLE PRECISION NOT NULL DEFAULT 0,
      opened_at TIMESTAMPTZ,
      dividend_yield DOUBLE PRECISION DEFAULT 0,
      dividend_rate DOUBLE PRECISION DEFAULT 0,
      expense_ratio DOUBLE PRECISION DEFAULT 0,
      sector TEXT,
      PRIMARY KEY (id, user_id)
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS paper_transactions (
      id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      account_id TEXT NOT NULL,
      symbol TEXT NOT NULL,
      company_name TEXT,
      action TEXT NOT NULL,
      shares DOUBLE PRECISION NOT NULL DEFAULT 0,
      price DOUBLE PRECISION NOT NULL DEFAULT 0,
      total DOUBLE PRECISION NOT NULL DEFAULT 0,
      date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      realized_pnl DOUBLE PRECISION,
      fee DOUBLE PRECISION DEFAULT 0,
      PRIMARY KEY (id, user_id)
    )
  `);

  // Pending orders (limit, stop, trailing stop, etc.)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS paper_orders (
      id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      account_id TEXT NOT NULL,
      symbol TEXT NOT NULL,
      company_name TEXT,
      order_type TEXT NOT NULL DEFAULT 'market',
      side TEXT NOT NULL DEFAULT 'buy',
      shares DOUBLE PRECISION NOT NULL DEFAULT 0,
      limit_price DOUBLE PRECISION,
      stop_price DOUBLE PRECISION,
      trail_pct DOUBLE PRECISION,
      trail_abs DOUBLE PRECISION,
      trail_ref DOUBLE PRECISION,
      status TEXT NOT NULL DEFAULT 'pending',
      filled_price DOUBLE PRECISION,
      placed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      filled_at TIMESTAMPTZ,
      PRIMARY KEY (id, user_id)
    )
  `);

  // FIFO cost-basis lots for tracking realised P&L per lot
  await pool.query(`
    CREATE TABLE IF NOT EXISTS paper_lots (
      id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      account_id TEXT NOT NULL,
      symbol TEXT NOT NULL,
      shares DOUBLE PRECISION NOT NULL DEFAULT 0,
      cost DOUBLE PRECISION NOT NULL DEFAULT 0,
      purchased_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (id, user_id)
    )
  `);

  // Backfill missing columns for existing paper tables (idempotent).
  const paperColumns = [
    ["paper_accounts", "name", "TEXT"],
    ["paper_accounts", "cash", "DOUBLE PRECISION"],
    ["paper_accounts", "created_at", "TIMESTAMPTZ"],
    // T+2 settlement + dividend credit tracking
    ["paper_accounts", "unsettled_items", "JSONB DEFAULT '[]'::jsonb"],
    ["paper_accounts", "last_dividend_credit", "TIMESTAMPTZ"],
    ["paper_positions", "account_id", "TEXT"],
    ["paper_positions", "symbol", "TEXT"],
    ["paper_positions", "company_name", "TEXT"],
    ["paper_positions", "shares", "DOUBLE PRECISION"],
    ["paper_positions", "avg_cost", "DOUBLE PRECISION"],
    ["paper_positions", "opened_at", "TIMESTAMPTZ"],
    ["paper_positions", "dividend_yield", "DOUBLE PRECISION"],
    ["paper_positions", "dividend_rate", "DOUBLE PRECISION"],
    ["paper_positions", "expense_ratio", "DOUBLE PRECISION DEFAULT 0"],
    ["paper_positions", "sector", "TEXT"],
    ["paper_transactions", "account_id", "TEXT"],
    ["paper_transactions", "symbol", "TEXT"],
    ["paper_transactions", "company_name", "TEXT"],
    ["paper_transactions", "action", "TEXT"],
    ["paper_transactions", "shares", "DOUBLE PRECISION"],
    ["paper_transactions", "price", "DOUBLE PRECISION"],
    ["paper_transactions", "total", "DOUBLE PRECISION"],
    ["paper_transactions", "date", "TIMESTAMPTZ"],
    ["paper_transactions", "realized_pnl", "DOUBLE PRECISION"],
    ["paper_transactions", "fee", "DOUBLE PRECISION DEFAULT 0"],
  ] as const;
  for (const [table, column, type] of paperColumns) {
    await pool.query(`ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS ${column} ${type}`);
  }

  // Watchlist and price alerts tables (safe to run on every boot)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS watchlist (
      user_id TEXT NOT NULL,
      symbol TEXT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      PRIMARY KEY (user_id, symbol)
    )
  `);
  // Add sort_order column for user-defined drag ordering (added after initial creation)
  await pool.query(
    "ALTER TABLE watchlist ADD COLUMN IF NOT EXISTS sort_order INTEGER DEFAULT 0",
  );
  // Enable pgcrypto as a safety net for any deployments that may still rely on
  // gen_random_uuid() elsewhere. IDs for price_alerts are now generated in
  // application code (randomUUID) so this extension is not strictly required.
  await pool.query(`CREATE EXTENSION IF NOT EXISTS pgcrypto`).catch(() => {
    // Non-fatal: extension may be unavailable on managed Postgres (e.g. Neon).
    // Application-level UUID generation ensures price_alerts still works.
  });
  // Per-user notification preferences (global on/off toggle)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS user_prefs (
      user_id TEXT PRIMARY KEY,
      notifications_enabled BOOLEAN NOT NULL DEFAULT TRUE
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS price_alerts (
      id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      symbol TEXT NOT NULL,
      direction TEXT NOT NULL CHECK (direction IN ('above','below')),
      target_price DOUBLE PRECISION NOT NULL,
      push_token TEXT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      fired_at TIMESTAMPTZ,
      PRIMARY KEY (id)
    )
  `);
  // Guest notifications are associated with an anonymous app installation,
  // not a Clerk account. Keep the legacy user_id/push_token columns for older
  // authenticated alerts and migrate them to nullable compatibility fields.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS push_devices (
      installation_id TEXT PRIMARY KEY,
      expo_push_token TEXT NOT NULL,
      platform TEXT NOT NULL DEFAULT 'android',
      enabled BOOLEAN NOT NULL DEFAULT TRUE,
      last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query("ALTER TABLE price_alerts ADD COLUMN IF NOT EXISTS installation_id TEXT");
  await pool.query("ALTER TABLE price_alerts ALTER COLUMN user_id DROP NOT NULL");
  await pool.query("ALTER TABLE price_alerts ALTER COLUMN push_token DROP NOT NULL");
  await pool.query("CREATE INDEX IF NOT EXISTS price_alerts_installation_idx ON price_alerts (installation_id, fired_at)");
}

function ensureSchema(): Promise<void> {
  if (!schemaReady) {
    schemaReady = runSchemaMigrations().catch((e: any) => {
      // Surface loudly and clear the cached promise so a later request retries
      // the migration instead of permanently wedging the paper endpoints.
      logger.error({ err: e }, "[user] schema migration failed");
      schemaReady = null;
      throw e;
    });
  }
  return schemaReady;
}

// Kick off at boot so a healthy schema is ready before the first request.
// A boot-time failure is logged by ensureSchema(); requests retry via the gate.
void ensureSchema().catch(() => {});

const router = Router();

// Gate endpoints that reference the migrated columns (expense_ratio, fee) so
// they never run against a half-migrated schema. Blocks until the migration
// resolves; returns 503 (retryable) if it is still failing.
async function requireSchema(_req: any, res: any, next: any) {
  try {
    await ensureSchema();
    next();
  } catch {
    res.status(503).json({ error: "Database schema is not ready. Please retry shortly." });
  }
}

// ── Auth middleware ────────────────────────────────────────────────────────
function requireAuth(req: any, res: any, next: any) {
  const auth = getAuth(req);
  const userId = auth?.sessionClaims?.userId || auth?.userId;
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  req.userId = userId;
  next();
}

// ── Trades ────────────────────────────────────────────────────────────────
router.get("/user/trades", requireAuth, async (req: any, res) => {
  try {
    const { rows } = await pool.query(
      "SELECT id, symbol, type, shares, price_per_share, date FROM trades WHERE user_id=$1 ORDER BY date ASC",
      [req.userId],
    );
    res.json(rows.map((r: any) => ({
      id: r.id,
      symbol: r.symbol,
      type: r.type,
      shares: Number(r.shares),
      pricePerShare: Number(r.price_per_share),
      date: r.date instanceof Date ? r.date.toISOString() : r.date,
    })));
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.post("/user/trades", requireAuth, async (req: any, res) => {
  const { id, symbol, type, shares, pricePerShare, date } = req.body;
  if (!id || !symbol || !type || !shares || !pricePerShare || !date) {
    res.status(400).json({ error: "Missing fields" });
    return;
  }
  try {
    await pool.query(
      "INSERT INTO trades (id, user_id, symbol, type, shares, price_per_share, date) VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT (id, user_id) DO UPDATE SET symbol=$3, type=$4, shares=$5, price_per_share=$6, date=$7",
      [id, req.userId, symbol, type, shares, pricePerShare, date],
    );
    res.json({ ok: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.delete("/user/trades/:id", requireAuth, async (req: any, res) => {
  try {
    await pool.query("DELETE FROM trades WHERE id=$1 AND user_id=$2", [req.params.id, req.userId]);
    res.json({ ok: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ── Paper Accounts ────────────────────────────────────────────────────────
router.get("/user/paper/accounts", requireAuth, requireSchema, async (req: any, res) => {
  try {
    const { rows } = await pool.query(
      "SELECT id, name, cash, created_at, unsettled_items, last_dividend_credit FROM paper_accounts WHERE user_id=$1 ORDER BY created_at ASC",
      [req.userId],
    );
    res.json(rows.map((r: any) => {
      const items: { amount: number; settlesAt: string }[] = Array.isArray(r.unsettled_items)
        ? r.unsettled_items
        : [];
      return {
        id: r.id,
        name: r.name,
        cash: Number(r.cash),
        unsettledItems: items,
        unsettledCash: items.reduce((s: number, i: any) => s + Number(i.amount), 0),
        lastDividendCredit: r.last_dividend_credit instanceof Date
          ? r.last_dividend_credit.toISOString()
          : (r.last_dividend_credit ?? null),
        createdAt: r.created_at instanceof Date ? r.created_at.toISOString() : r.created_at,
      };
    }));
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.post("/user/paper/accounts", requireAuth, async (req: any, res) => {
  const { id, name, cash, createdAt } = req.body;
  if (!id || !name || cash == null || !createdAt) {
    res.status(400).json({ error: "Missing fields" });
    return;
  }
  try {
    await pool.query(
      "INSERT INTO paper_accounts (id, user_id, name, cash, created_at) VALUES ($1,$2,$3,$4,$5) ON CONFLICT (id, user_id) DO UPDATE SET name=$3, cash=$4",
      [id, req.userId, name, cash, createdAt],
    );
    res.json({ ok: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.put("/user/paper/accounts/:id", requireAuth, async (req: any, res) => {
  const { name, cash } = req.body;
  try {
    await pool.query(
      "UPDATE paper_accounts SET name=COALESCE($3,name), cash=COALESCE($4,cash) WHERE id=$1 AND user_id=$2",
      [req.params.id, req.userId, name ?? null, cash ?? null],
    );
    res.json({ ok: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.delete("/user/paper/accounts/:id", requireAuth, async (req: any, res) => {
  try {
    // Remove dependent paper records first. These tables intentionally use
    // explicit cleanup so deleting an account cannot leave pending orders or
    // FIFO lots that reappear on a later sync.
    await pool.query("DELETE FROM paper_orders WHERE account_id=$1 AND user_id=$2", [req.params.id, req.userId]);
    await pool.query("DELETE FROM paper_lots WHERE account_id=$1 AND user_id=$2", [req.params.id, req.userId]);
    await pool.query("DELETE FROM paper_positions WHERE account_id=$1 AND user_id=$2", [req.params.id, req.userId]);
    await pool.query("DELETE FROM paper_transactions WHERE account_id=$1 AND user_id=$2", [req.params.id, req.userId]);
    await pool.query("DELETE FROM paper_accounts WHERE id=$1 AND user_id=$2", [req.params.id, req.userId]);
    res.json({ ok: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ── Paper Positions ───────────────────────────────────────────────────────
router.get("/user/paper/positions", requireAuth, requireSchema, async (req: any, res) => {
  try {
    const { rows } = await pool.query(
      "SELECT id, account_id, symbol, company_name, shares, avg_cost, opened_at, dividend_yield, dividend_rate, expense_ratio, sector FROM paper_positions WHERE user_id=$1",
      [req.userId],
    );
    res.json(rows.map((r: any) => ({
      id: r.id,
      accountId: r.account_id,
      symbol: r.symbol,
      companyName: r.company_name,
      shares: Number(r.shares),
      avgCost: Number(r.avg_cost),
      openedAt: r.opened_at instanceof Date ? r.opened_at.toISOString() : r.opened_at,
      dividendYield: Number(r.dividend_yield),
      dividendRate: Number(r.dividend_rate),
      expenseRatio: r.expense_ratio != null ? Number(r.expense_ratio) : 0,
      sector: r.sector,
    })));
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.post("/user/paper/positions", requireAuth, requireSchema, async (req: any, res) => {
  const { id, accountId, symbol, companyName, shares, avgCost, openedAt, dividendYield, dividendRate, expenseRatio, sector } = req.body;
  try {
    await pool.query(
      `INSERT INTO paper_positions (id, user_id, account_id, symbol, company_name, shares, avg_cost, opened_at, dividend_yield, dividend_rate, expense_ratio, sector)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
       ON CONFLICT (id, user_id) DO UPDATE SET shares=$6, avg_cost=$7, dividend_rate=$10, expense_ratio=$11`,
      [id, req.userId, accountId, symbol, companyName, shares, avgCost, openedAt, dividendYield ?? 0, dividendRate ?? 0, expenseRatio ?? 0, sector ?? ""],
    );
    res.json({ ok: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.delete("/user/paper/positions/:id", requireAuth, async (req: any, res) => {
  try {
    await pool.query("DELETE FROM paper_positions WHERE id=$1 AND user_id=$2", [req.params.id, req.userId]);
    res.json({ ok: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ── Paper Transactions ────────────────────────────────────────────────────
router.get("/user/paper/transactions", requireAuth, requireSchema, async (req: any, res) => {
  try {
    const { rows } = await pool.query(
      "SELECT id, account_id, symbol, company_name, action, shares, price, total, date, realized_pnl, fee FROM paper_transactions WHERE user_id=$1 ORDER BY date ASC",
      [req.userId],
    );
    res.json(rows.map((r: any) => ({
      id: r.id,
      accountId: r.account_id,
      symbol: r.symbol,
      companyName: r.company_name,
      action: r.action,
      shares: Number(r.shares),
      price: Number(r.price),
      total: Number(r.total),
      date: r.date instanceof Date ? r.date.toISOString() : r.date,
      realizedPnL: r.realized_pnl != null ? Number(r.realized_pnl) : undefined,
      fee: r.fee != null ? Number(r.fee) : undefined,
    })));
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.post("/user/paper/transactions", requireAuth, requireSchema, async (req: any, res) => {
  const { id, accountId, symbol, companyName, action, shares, price, total, date, realizedPnL, fee } = req.body;
  try {
    await pool.query(
      `INSERT INTO paper_transactions (id, user_id, account_id, symbol, company_name, action, shares, price, total, date, realized_pnl, fee)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
       ON CONFLICT (id, user_id) DO NOTHING`,
      [id, req.userId, accountId, symbol, companyName, action, shares, price, total, date, realizedPnL ?? null, fee ?? 0],
    );
    res.json({ ok: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.delete("/user/paper/transactions/:id", requireAuth, async (req: any, res) => {
  try {
    await pool.query("DELETE FROM paper_transactions WHERE id=$1 AND user_id=$2", [req.params.id, req.userId]);
    res.json({ ok: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ── Recent Searches ───────────────────────────────────────────────────────
router.get("/user/recent", requireAuth, async (req: any, res) => {
  try {
    const { rows } = await pool.query(
      "SELECT tickers FROM recent_searches WHERE user_id=$1",
      [req.userId],
    );
    res.json(rows[0]?.tickers ?? []);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.put("/user/recent", requireAuth, async (req: any, res) => {
  const { tickers } = req.body;
  if (!Array.isArray(tickers)) {
    res.status(400).json({ error: "tickers must be an array" });
    return;
  }
  try {
    await pool.query(
      `INSERT INTO recent_searches (user_id, tickers, updated_at) VALUES ($1,$2,NOW())
       ON CONFLICT (user_id) DO UPDATE SET tickers=$2, updated_at=NOW()`,
      [req.userId, JSON.stringify(tickers)],
    );
    res.json({ ok: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ── Bulk sync (paper): replace all user's data for accounts/positions/transactions ──
// Called after local state changes to keep server fully in sync.
//
// This endpoint does full-replacement writes (delete + re-insert) inside a
// transaction, so a malformed payload could otherwise wipe or corrupt good
// data. We validate and normalize the entire body BEFORE opening the
// transaction; on any bad input we return 400 and never touch the DB.

// ── Sync payload validation ────────────────────────────────────────────────
class ValidationError extends Error {}

function reqString(value: any, field: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new ValidationError(`${field} must be a non-empty string`);
  }
  return value;
}

function optString(value: any, field: string, fallback: string): string {
  if (value == null) return fallback;
  if (typeof value !== "string") {
    throw new ValidationError(`${field} must be a string`);
  }
  return value;
}

function reqNumber(value: any, field: string): number {
  const n = typeof value === "string" && value.trim() !== "" ? Number(value) : value;
  if (typeof n !== "number" || !Number.isFinite(n)) {
    throw new ValidationError(`${field} must be a finite number`);
  }
  return n;
}

function optNumber(value: any, field: string, fallback: number): number {
  if (value == null) return fallback;
  return reqNumber(value, field);
}

function requireArray(value: any, field: string): any[] {
  if (!Array.isArray(value)) {
    throw new ValidationError(`${field} must be an array`);
  }
  return value;
}

function requireObject(value: any, field: string): any {
  if (value == null || typeof value !== "object" || Array.isArray(value)) {
    throw new ValidationError(`${field} must be an object`);
  }
  return value;
}

function validateSyncPayload(body: any) {
  requireObject(body, "request body");
  const accountsIn = requireArray(body.accounts, "accounts");
  const positionsIn = requireArray(body.positions, "positions");
  const transactionsIn = requireArray(body.transactions, "transactions");
  const ordersIn = body.orders != null ? requireArray(body.orders, "orders") : [];
  const lotsIn = body.lots != null ? requireArray(body.lots, "lots") : [];

  const accounts = accountsIn.map((a, i) => {
    requireObject(a, `accounts[${i}]`);
    // unsettledItems is an optional JSON array; validate lightly
    const unsettledItems = Array.isArray(a.unsettledItems) ? a.unsettledItems : [];
    return {
      id: reqString(a.id, `accounts[${i}].id`),
      name: reqString(a.name, `accounts[${i}].name`),
      cash: reqNumber(a.cash, `accounts[${i}].cash`),
      createdAt: reqString(a.createdAt, `accounts[${i}].createdAt`),
      unsettledItems,
      lastDividendCredit: a.lastDividendCredit != null
        ? optString(a.lastDividendCredit, `accounts[${i}].lastDividendCredit`, "")
        : null,
    };
  });

  const positions = positionsIn.map((p, i) => {
    requireObject(p, `positions[${i}]`);
    return {
      id: reqString(p.id, `positions[${i}].id`),
      accountId: reqString(p.accountId, `positions[${i}].accountId`),
      symbol: reqString(p.symbol, `positions[${i}].symbol`),
      companyName: optString(p.companyName, `positions[${i}].companyName`, ""),
      shares: reqNumber(p.shares, `positions[${i}].shares`),
      avgCost: reqNumber(p.avgCost, `positions[${i}].avgCost`),
      openedAt: reqString(p.openedAt, `positions[${i}].openedAt`),
      dividendYield: optNumber(p.dividendYield, `positions[${i}].dividendYield`, 0),
      dividendRate: optNumber(p.dividendRate, `positions[${i}].dividendRate`, 0),
      expenseRatio: optNumber(p.expenseRatio, `positions[${i}].expenseRatio`, 0),
      sector: optString(p.sector, `positions[${i}].sector`, ""),
    };
  });

  const transactions = transactionsIn.map((t, i) => {
    requireObject(t, `transactions[${i}]`);
    return {
      id: reqString(t.id, `transactions[${i}].id`),
      accountId: reqString(t.accountId, `transactions[${i}].accountId`),
      symbol: reqString(t.symbol, `transactions[${i}].symbol`),
      companyName: optString(t.companyName, `transactions[${i}].companyName`, ""),
      action: reqString(t.action, `transactions[${i}].action`),
      shares: reqNumber(t.shares, `transactions[${i}].shares`),
      price: reqNumber(t.price, `transactions[${i}].price`),
      total: reqNumber(t.total, `transactions[${i}].total`),
      date: reqString(t.date, `transactions[${i}].date`),
      realizedPnL: t.realizedPnL == null ? null : reqNumber(t.realizedPnL, `transactions[${i}].realizedPnL`),
      fee: optNumber(t.fee, `transactions[${i}].fee`, 0),
    };
  });

  const orders = ordersIn.map((o: any, i: number) => {
    requireObject(o, `orders[${i}]`);
    return {
      id: reqString(o.id, `orders[${i}].id`),
      accountId: reqString(o.accountId, `orders[${i}].accountId`),
      symbol: reqString(o.symbol, `orders[${i}].symbol`),
      companyName: optString(o.companyName, `orders[${i}].companyName`, ""),
      orderType: reqString(o.orderType, `orders[${i}].orderType`),
      side: reqString(o.side, `orders[${i}].side`),
      shares: reqNumber(o.shares, `orders[${i}].shares`),
      limitPrice: o.limitPrice != null ? reqNumber(o.limitPrice, `orders[${i}].limitPrice`) : null,
      stopPrice: o.stopPrice != null ? reqNumber(o.stopPrice, `orders[${i}].stopPrice`) : null,
      trailPct: o.trailPct != null ? reqNumber(o.trailPct, `orders[${i}].trailPct`) : null,
      trailAbs: o.trailAbs != null ? reqNumber(o.trailAbs, `orders[${i}].trailAbs`) : null,
      trailRef: o.trailRef != null ? reqNumber(o.trailRef, `orders[${i}].trailRef`) : null,
      status: reqString(o.status, `orders[${i}].status`),
      filledPrice: o.filledPrice != null ? reqNumber(o.filledPrice, `orders[${i}].filledPrice`) : null,
      placedAt: reqString(o.placedAt, `orders[${i}].placedAt`),
      filledAt: o.filledAt != null ? reqString(o.filledAt, `orders[${i}].filledAt`) : null,
    };
  });

  const lots = lotsIn.map((l: any, i: number) => {
    requireObject(l, `lots[${i}]`);
    return {
      id: reqString(l.id, `lots[${i}].id`),
      accountId: reqString(l.accountId, `lots[${i}].accountId`),
      symbol: reqString(l.symbol, `lots[${i}].symbol`),
      shares: reqNumber(l.shares, `lots[${i}].shares`),
      cost: reqNumber(l.cost, `lots[${i}].cost`),
      purchasedAt: reqString(l.purchasedAt, `lots[${i}].purchasedAt`),
    };
  });

  let activeId: string | null = null;
  if (body.activeId != null) {
    activeId = reqString(body.activeId, "activeId");
  }

  return { accounts, positions, transactions, orders, lots, activeId };
}

router.post("/user/paper/sync", requireAuth, requireSchema, async (req: any, res) => {
  // Validate + normalize the full payload before touching the DB. Any bad
  // input aborts here with a 400, so a malformed body can never partially
  // wipe or corrupt the user's stored paper-trading data.
  let payload;
  try {
    payload = validateSyncPayload(req.body);
  } catch (e: any) {
    if (e instanceof ValidationError) {
      res.status(400).json({ error: e.message });
      return;
    }
    res.status(400).json({ error: "Invalid request body" });
    return;
  }
  const { accounts, positions, transactions, orders, lots, activeId } = payload;

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Sync accounts (now includes unsettled_items + last_dividend_credit)
    await client.query("DELETE FROM paper_accounts WHERE user_id=$1", [req.userId]);
    for (const a of accounts) {
      await client.query(
        `INSERT INTO paper_accounts (id, user_id, name, cash, created_at, unsettled_items, last_dividend_credit)
         VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [
          a.id, req.userId, a.name, a.cash, a.createdAt,
          JSON.stringify(a.unsettledItems ?? []),
          a.lastDividendCredit ?? null,
        ],
      );
    }

    // Sync positions
    await client.query("DELETE FROM paper_positions WHERE user_id=$1", [req.userId]);
    for (const p of positions) {
      await client.query(
        "INSERT INTO paper_positions (id, user_id, account_id, symbol, company_name, shares, avg_cost, opened_at, dividend_yield, dividend_rate, expense_ratio, sector) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)",
        [p.id, req.userId, p.accountId, p.symbol, p.companyName, p.shares, p.avgCost, p.openedAt, p.dividendYield, p.dividendRate, p.expenseRatio, p.sector],
      );
    }

    // Sync transactions
    await client.query("DELETE FROM paper_transactions WHERE user_id=$1", [req.userId]);
    for (const t of transactions) {
      await client.query(
        "INSERT INTO paper_transactions (id, user_id, account_id, symbol, company_name, action, shares, price, total, date, realized_pnl, fee) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)",
        [t.id, req.userId, t.accountId, t.symbol, t.companyName, t.action, t.shares, t.price, t.total, t.date, t.realizedPnL, t.fee],
      );
    }

    // Sync orders
    await client.query("DELETE FROM paper_orders WHERE user_id=$1", [req.userId]);
    for (const o of orders) {
      await client.query(
        `INSERT INTO paper_orders
           (id, user_id, account_id, symbol, company_name, order_type, side, shares,
            limit_price, stop_price, trail_pct, trail_abs, trail_ref,
            status, filled_price, placed_at, filled_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)`,
        [
          o.id, req.userId, o.accountId, o.symbol, o.companyName,
          o.orderType, o.side, o.shares,
          o.limitPrice ?? null, o.stopPrice ?? null,
          o.trailPct ?? null, o.trailAbs ?? null, o.trailRef ?? null,
          o.status, o.filledPrice ?? null,
          o.placedAt, o.filledAt ?? null,
        ],
      );
    }

    // Sync lots
    await client.query("DELETE FROM paper_lots WHERE user_id=$1", [req.userId]);
    for (const l of lots) {
      await client.query(
        "INSERT INTO paper_lots (id, user_id, account_id, symbol, shares, cost, purchased_at) VALUES ($1,$2,$3,$4,$5,$6,$7)",
        [l.id, req.userId, l.accountId, l.symbol, l.shares, l.cost, l.purchasedAt],
      );
    }

    // Save active account id in recent_searches table (reusing as simple kv for active id)
    if (activeId) {
      await client.query(
        `INSERT INTO recent_searches (user_id, tickers, updated_at) VALUES ($1,$2,NOW())
         ON CONFLICT (user_id) DO UPDATE SET tickers=$2, updated_at=NOW()`,
        [req.userId + "_active", JSON.stringify([activeId])],
      );
    }

    await client.query("COMMIT");
    res.json({ ok: true });
  } catch (e: any) {
    await client.query("ROLLBACK");
    res.status(500).json({ error: e.message });
  } finally {
    client.release();
  }
});

// ── Paper Orders ──────────────────────────────────────────────────────────
router.get("/user/paper/orders", requireAuth, requireSchema, async (req: any, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, account_id, symbol, company_name, order_type, side, shares,
              limit_price, stop_price, trail_pct, trail_abs, trail_ref,
              status, filled_price, placed_at, filled_at
       FROM paper_orders WHERE user_id=$1 ORDER BY placed_at DESC`,
      [req.userId],
    );
    res.json(rows.map((r: any) => ({
      id: r.id,
      accountId: r.account_id,
      symbol: r.symbol,
      companyName: r.company_name,
      orderType: r.order_type,
      side: r.side,
      shares: Number(r.shares),
      limitPrice: r.limit_price != null ? Number(r.limit_price) : undefined,
      stopPrice: r.stop_price != null ? Number(r.stop_price) : undefined,
      trailPct: r.trail_pct != null ? Number(r.trail_pct) : undefined,
      trailAbs: r.trail_abs != null ? Number(r.trail_abs) : undefined,
      trailRef: r.trail_ref != null ? Number(r.trail_ref) : undefined,
      status: r.status,
      filledPrice: r.filled_price != null ? Number(r.filled_price) : undefined,
      placedAt: r.placed_at instanceof Date ? r.placed_at.toISOString() : r.placed_at,
      filledAt: r.filled_at instanceof Date ? r.filled_at.toISOString() : (r.filled_at ?? undefined),
    })));
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ── Paper Lots ────────────────────────────────────────────────────────────
router.get("/user/paper/lots", requireAuth, requireSchema, async (req: any, res) => {
  try {
    const { rows } = await pool.query(
      "SELECT id, account_id, symbol, shares, cost, purchased_at FROM paper_lots WHERE user_id=$1 ORDER BY purchased_at ASC",
      [req.userId],
    );
    res.json(rows.map((r: any) => ({
      id: r.id,
      accountId: r.account_id,
      symbol: r.symbol,
      shares: Number(r.shares),
      cost: Number(r.cost),
      purchasedAt: r.purchased_at instanceof Date ? r.purchased_at.toISOString() : r.purchased_at,
    })));
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ── Watchlist ─────────────────────────────────────────────────────────────
router.get("/user/watchlist", requireAuth, requireSchema, async (req: any, res) => {
  try {
    res.json(await getWatchlist(pool, req.userId));
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.post("/user/watchlist", requireAuth, requireSchema, async (req: any, res) => {
  const { symbol } = req.body;
  if (!symbol || typeof symbol !== "string") {
    res.status(400).json({ error: "symbol required" });
    return;
  }
  try {
    // New items get sort_order = 0 so they appear at the top (lowest value = first)
    // existing items have higher sort_order values; we shift them down by 1 to make room
    await addToWatchlist(pool, req.userId, symbol);
    res.json({ ok: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// Persist a user-defined drag order. Body: { symbols: string[] } in the
// desired order. Assigns sort_order 0,1,2,... to each symbol.
router.put("/user/watchlist/reorder", requireAuth, requireSchema, async (req: any, res) => {
  const { symbols } = req.body;
  if (!Array.isArray(symbols) || symbols.some((s: any) => typeof s !== "string")) {
    res.status(400).json({ error: "symbols must be a string array" });
    return;
  }
  try {
    await reorderWatchlist(pool, req.userId, symbols);
    res.json({ ok: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.delete("/user/watchlist/:symbol", requireAuth, requireSchema, async (req: any, res) => {
  try {
    await removeFromWatchlist(pool, req.userId, req.params.symbol);
    res.json({ ok: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ── Price Alerts ───────────────────────────────────────────────────────────
router.get("/user/alerts", requireAuth, requireSchema, async (req: any, res) => {
  try {
    const { rows } = await pool.query(
      "SELECT id, symbol, direction, target_price, created_at, fired_at FROM price_alerts WHERE user_id=$1 ORDER BY created_at DESC",
      [req.userId],
    );
    res.json(rows.map((r: any) => ({
      id: r.id,
      symbol: r.symbol,
      direction: r.direction,
      targetPrice: Number(r.target_price),
      createdAt: r.created_at instanceof Date ? r.created_at.toISOString() : r.created_at,
      firedAt: r.fired_at instanceof Date ? r.fired_at.toISOString() : r.fired_at ?? null,
    })));
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.post("/user/alerts", requireAuth, requireSchema, async (req: any, res) => {
  const { symbol, direction, targetPrice, pushToken } = req.body;
  if (!symbol || !direction || targetPrice == null || !pushToken) {
    res.status(400).json({ error: "symbol, direction, targetPrice, pushToken required" });
    return;
  }
  if (direction !== "above" && direction !== "below") {
    res.status(400).json({ error: "direction must be 'above' or 'below'" });
    return;
  }
  try {
    const id = randomUUID();
    await pool.query(
      `INSERT INTO price_alerts (id, user_id, symbol, direction, target_price, push_token)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [id, req.userId, symbol.toUpperCase().trim(), direction, targetPrice, pushToken],
    );
    res.json({ id });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.delete("/user/alerts/:id", requireAuth, requireSchema, async (req: any, res) => {
  try {
    await pool.query(
      "DELETE FROM price_alerts WHERE id=$1 AND user_id=$2",
      [req.params.id, req.userId],
    );
    res.json({ ok: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ── Anonymous device notifications ─────────────────────────────────────────
// These routes intentionally do not use Clerk. The installation ID is
// generated and persisted by the mobile app and is only a routing handle for
// that phone's push token.
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
  };
}

router.post("/notifications/device", requireSchema, async (req: any, res) => {
  const { installationId, expoPushToken, platform } = req.body ?? {};
  if (!validInstallationId(installationId) || !validExpoPushToken(expoPushToken)) {
    res.status(400).json({ error: "valid installationId and Expo push token required" });
    return;
  }
  const normalizedPlatform = platform === "ios" ? "ios" : "android";
  try {
    await pool.query(
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

router.get("/notifications/alerts", requireSchema, async (req: any, res) => {
  const installationId = req.query.installationId;
  if (!validInstallationId(installationId)) {
    res.status(400).json({ error: "valid installationId required" });
    return;
  }
  try {
    const { rows } = await pool.query(
      `SELECT id, symbol, direction, target_price, created_at, fired_at
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

router.post("/notifications/alerts", requireSchema, async (req: any, res) => {
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
    await pool.query(
      `INSERT INTO push_devices (installation_id, expo_push_token, platform, enabled, last_seen_at, updated_at)
       VALUES ($1,$2,'android',TRUE,NOW(),NOW())
       ON CONFLICT (installation_id) DO UPDATE SET
         expo_push_token = EXCLUDED.expo_push_token,
         enabled = TRUE,
         last_seen_at = NOW(),
         updated_at = NOW()`,
      [installationId, pushToken],
    );
    const existing = await pool.query(
      `UPDATE price_alerts
       SET direction=$3, target_price=$4, push_token=$5, fired_at=NULL, created_at=NOW()
       WHERE installation_id=$1 AND symbol=$2 AND fired_at IS NULL
       RETURNING id, symbol, direction, target_price, created_at, fired_at`,
      [installationId, normalizedSymbol, direction, numericTarget, pushToken],
    );
    if (existing.rows[0]) {
      res.json(normalizeAlertRow(existing.rows[0]));
      return;
    }
    const id = randomUUID();
    const inserted = await pool.query(
      `INSERT INTO price_alerts (id, user_id, installation_id, symbol, direction, target_price, push_token)
       VALUES ($1,NULL,$2,$3,$4,$5,$6)
       RETURNING id, symbol, direction, target_price, created_at, fired_at`,
      [id, installationId, normalizedSymbol, direction, numericTarget, pushToken],
    );
    res.json(normalizeAlertRow(inserted.rows[0]));
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.delete("/notifications/alerts/:id", requireSchema, async (req: any, res) => {
  const installationId = req.query.installationId;
  if (!validInstallationId(installationId)) {
    res.status(400).json({ error: "valid installationId required" });
    return;
  }
  try {
    await pool.query(
      "DELETE FROM price_alerts WHERE id=$1 AND installation_id=$2",
      [req.params.id, installationId],
    );
    res.json({ ok: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ── Push Token ─────────────────────────────────────────────────────────────
router.post("/user/push-token", requireAuth, async (req: any, res) => {
  // No-op endpoint — the token is stored per-alert, not globally, because
  // Expo push tokens can change. We accept and 200 so the client stays happy.
  const { token } = req.body;
  if (!token || typeof token !== "string") {
    res.status(400).json({ error: "token required" });
    return;
  }
  res.json({ ok: true });
});

// ── Notification settings (global on/off toggle) ──────────────────────────
router.get("/user/notification-settings", requireAuth, requireSchema, async (req: any, res) => {
  try {
    const { rows } = await pool.query(
      "SELECT notifications_enabled FROM user_prefs WHERE user_id=$1",
      [req.userId],
    );
    res.json({ enabled: rows[0]?.notifications_enabled ?? true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.put("/user/notification-settings", requireAuth, requireSchema, async (req: any, res) => {
  const { enabled } = req.body;
  if (typeof enabled !== "boolean") {
    res.status(400).json({ error: "enabled must be a boolean" });
    return;
  }
  try {
    await pool.query(
      `INSERT INTO user_prefs (user_id, notifications_enabled) VALUES ($1, $2)
       ON CONFLICT (user_id) DO UPDATE SET notifications_enabled = EXCLUDED.notifications_enabled`,
      [req.userId, enabled],
    );
    res.json({ enabled });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ── Price Alert Worker ─────────────────────────────────────────────────────
// Runs every 5 minutes; fetches live prices and fires pending alerts.
async function fetchCurrentPrice(symbol: string): Promise<number | null> {
  const normalizedSymbol = symbol.toUpperCase().trim();
  let lastError: unknown = null;

  // Yahoo/yfinance can transiently reject a burst of concurrent requests.
  // Retry the individual quote rather than turning a temporary provider
  // response into a permanently skipped alert cycle.
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const { stdout } = await execFileAsync(
        "python3", [PRICE_SCRIPT_PATH, normalizedSymbol],
        { timeout: 20_000, maxBuffer: 1024 * 1024 },
      );
      const data = JSON.parse(stdout.trim());
      const price = Number(data.currentPrice);
      if (!data.error && Number.isFinite(price) && price > 0) return price;
      lastError = new Error(data.error || `No usable price returned for ${normalizedSymbol}`);
    } catch (error) {
      lastError = error;
    }

    if (attempt < 2) {
      await new Promise((resolve) => setTimeout(resolve, 1_500));
    }
  }

  logger.warn(
    { symbol: normalizedSymbol, err: lastError },
    "[alert-worker] quote unavailable after retry",
  );
  return null;
}

async function sendExpoPush(alert: PendingAlert, price: number) {
  const pushRes = await fetch("https://exp.host/--/api/v2/push/send", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Accept": "application/json" },
    body: JSON.stringify({
      to: alert.pushToken,
      title: `${alert.symbol} Price Alert`,
      body: `${alert.symbol} hit ${price.toFixed(2)} — your target was ${alert.targetPrice.toFixed(2)}`,
      sound: "default",
      channelId: "price-alerts",
      data: { symbol: alert.symbol },
    }),
  });
  const body = await pushRes.json().catch(() => null);
  const result = classifyExpoPushResponse(pushRes.ok, body);
  if (!result.accepted) {
    logger.warn(
      { symbol: alert.symbol, status: pushRes.status, body, permanent: result.permanentFailure },
      "[alert-worker] push not accepted",
    );
  }
  return result;
}

// Prevent overlapping check cycles (scheduled interval + dev trigger) from
// reading the same pending alerts and double-sending before fired_at is set.
let alertCheckRunning = false;

async function runAlertCheck() {
  if (alertCheckRunning) {
    logger.info("[alert-worker] check already running — skipping overlapping cycle");
    return null;
  }
  alertCheckRunning = true;
  try {
    // Skip alerts for users who turned notifications off in Settings.
    // Their alerts stay pending and resume when the toggle is re-enabled.
    const { rows } = await pool.query(
      `SELECT a.id, a.user_id, a.installation_id, a.symbol, a.direction, a.target_price,
              COALESCE(d.expo_push_token, a.push_token) AS push_token
       FROM price_alerts a
       LEFT JOIN user_prefs p ON p.user_id = a.user_id
       LEFT JOIN push_devices d ON d.installation_id = a.installation_id
       WHERE a.fired_at IS NULL
         AND COALESCE(p.notifications_enabled, TRUE)
         AND COALESCE(d.enabled, TRUE)
         AND COALESCE(d.expo_push_token, a.push_token) IS NOT NULL`,
    );
    const pending: PendingAlert[] = rows.map((r: any) => ({
      id: r.id,
      userId: r.user_id,
      symbol: r.symbol,
      direction: r.direction,
      targetPrice: Number(r.target_price),
      pushToken: r.push_token,
    }));

    const stats = await processPendingAlerts(pending, {
      fetchPrice: fetchCurrentPrice,
      sendPush: sendExpoPush,
      markFired: async (id) => {
        await pool.query("UPDATE price_alerts SET fired_at=NOW() WHERE id=$1", [id]);
      },
    });
    if (stats.checked > 0) logger.info({ ...stats }, "[alert-worker] check cycle complete");
    return stats;
  } catch (e: any) {
    logger.error({ err: e }, "[alert-worker] price check failed");
    return null;
  } finally {
    alertCheckRunning = false;
  }
}

// Dev-only: trigger an alert check cycle on demand so the pipeline can be
// verified without waiting for the 5-minute interval. Never mounted in prod.
if (process.env.NODE_ENV !== "production") {
  router.post("/user/dev/run-alert-check", requireAuth, requireSchema, async (_req, res) => {
    const stats = await runAlertCheck();
    if (!stats) { res.status(500).json({ error: "alert check failed" }); return; }
    res.json(stats);
  });
}

// Alert checks are handled by the standalone alert-worker process
// (src/alert-worker.ts → dist/alert-worker.mjs). The in-process timer has
// been removed so checks continue even when the autoscaling API is idle.

// Store active account id separately
router.get("/user/paper/active", requireAuth, async (req: any, res) => {
  try {
    const { rows } = await pool.query(
      "SELECT tickers FROM recent_searches WHERE user_id=$1",
      [req.userId + "_active"],
    );
    res.json({ activeId: rows[0]?.tickers?.[0] ?? null });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

export default router;
