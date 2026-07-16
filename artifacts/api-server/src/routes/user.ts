/**
 * Authenticated user-data routes.
 * All routes require a valid Clerk session token (Authorization: Bearer <token>).
 * userId is extracted from the verified Clerk session via getAuth().
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

const execFileAsync = promisify(execFile);
const __watchlistDirname = dirname(fileURLToPath(import.meta.url));
// fetch_quote.py is copied to dist/ by build.mjs alongside this bundle
const QUOTE_SCRIPT_PATH = join(__watchlistDirname, "fetch_quote.py");

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
  await pool.query(
    "ALTER TABLE paper_positions ADD COLUMN IF NOT EXISTS expense_ratio DOUBLE PRECISION DEFAULT 0",
  );
  await pool.query(
    "ALTER TABLE paper_transactions ADD COLUMN IF NOT EXISTS fee DOUBLE PRECISION DEFAULT 0",
  );
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
router.get("/user/paper/accounts", requireAuth, async (req: any, res) => {
  try {
    const { rows } = await pool.query(
      "SELECT id, name, cash, created_at FROM paper_accounts WHERE user_id=$1 ORDER BY created_at ASC",
      [req.userId],
    );
    res.json(rows.map((r: any) => ({
      id: r.id,
      name: r.name,
      cash: Number(r.cash),
      createdAt: r.created_at instanceof Date ? r.created_at.toISOString() : r.created_at,
    })));
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
    await pool.query("DELETE FROM paper_accounts WHERE id=$1 AND user_id=$2", [req.params.id, req.userId]);
    // Cascade clean positions and transactions for this account
    await pool.query("DELETE FROM paper_positions WHERE account_id=$1 AND user_id=$2", [req.params.id, req.userId]);
    await pool.query("DELETE FROM paper_transactions WHERE account_id=$1 AND user_id=$2", [req.params.id, req.userId]);
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

  const accounts = accountsIn.map((a, i) => {
    requireObject(a, `accounts[${i}]`);
    return {
      id: reqString(a.id, `accounts[${i}].id`),
      name: reqString(a.name, `accounts[${i}].name`),
      cash: reqNumber(a.cash, `accounts[${i}].cash`),
      createdAt: reqString(a.createdAt, `accounts[${i}].createdAt`),
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

  let activeId: string | null = null;
  if (body.activeId != null) {
    activeId = reqString(body.activeId, "activeId");
  }

  return { accounts, positions, transactions, activeId };
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
  const { accounts, positions, transactions, activeId } = payload;

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Sync accounts
    await client.query("DELETE FROM paper_accounts WHERE user_id=$1", [req.userId]);
    for (const a of accounts) {
      await client.query(
        "INSERT INTO paper_accounts (id, user_id, name, cash, created_at) VALUES ($1,$2,$3,$4,$5)",
        [a.id, req.userId, a.name, a.cash, a.createdAt],
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
  try {
    const { stdout } = await execFileAsync(
      "python3", [QUOTE_SCRIPT_PATH, symbol],
      { timeout: 20_000 },
    );
    const data = JSON.parse(stdout.trim());
    if (data.error || !data.currentPrice) return null;
    return data.currentPrice as number;
  } catch {
    return null;
  }
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
      `SELECT a.id, a.user_id, a.symbol, a.direction, a.target_price, a.push_token
       FROM price_alerts a
       LEFT JOIN user_prefs p ON p.user_id = a.user_id
       WHERE a.fired_at IS NULL AND COALESCE(p.notifications_enabled, TRUE)`,
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

// Start worker after schema is ready. First run 30s after boot, then every 5 min.
void ensureSchema()
  .then(() => {
    setTimeout(() => {
      void runAlertCheck();
      setInterval(() => void runAlertCheck(), 5 * 60 * 1000);
    }, 30_000);
  })
  .catch(() => {});

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
