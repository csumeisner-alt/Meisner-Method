/**
 * Authenticated user-data routes.
 * All routes require a valid Clerk session token (Authorization: Bearer <token>).
 * userId is extracted from the verified Clerk session via getAuth().
 */
import { Router } from "express";
import { getAuth } from "@clerk/express";
import pg from "pg";

const { Pool } = pg;

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const router = Router();

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
router.get("/user/paper/positions", requireAuth, async (req: any, res) => {
  try {
    const { rows } = await pool.query(
      "SELECT id, account_id, symbol, company_name, shares, avg_cost, opened_at, dividend_yield, sector FROM paper_positions WHERE user_id=$1",
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
      sector: r.sector,
    })));
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.post("/user/paper/positions", requireAuth, async (req: any, res) => {
  const { id, accountId, symbol, companyName, shares, avgCost, openedAt, dividendYield, sector } = req.body;
  try {
    await pool.query(
      `INSERT INTO paper_positions (id, user_id, account_id, symbol, company_name, shares, avg_cost, opened_at, dividend_yield, sector)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       ON CONFLICT (id, user_id) DO UPDATE SET shares=$6, avg_cost=$7`,
      [id, req.userId, accountId, symbol, companyName, shares, avgCost, openedAt, dividendYield ?? 0, sector ?? ""],
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
router.get("/user/paper/transactions", requireAuth, async (req: any, res) => {
  try {
    const { rows } = await pool.query(
      "SELECT id, account_id, symbol, company_name, action, shares, price, total, date, realized_pnl FROM paper_transactions WHERE user_id=$1 ORDER BY date ASC",
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
    })));
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.post("/user/paper/transactions", requireAuth, async (req: any, res) => {
  const { id, accountId, symbol, companyName, action, shares, price, total, date, realizedPnL } = req.body;
  try {
    await pool.query(
      `INSERT INTO paper_transactions (id, user_id, account_id, symbol, company_name, action, shares, price, total, date, realized_pnl)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
       ON CONFLICT (id, user_id) DO NOTHING`,
      [id, req.userId, accountId, symbol, companyName, action, shares, price, total, date, realizedPnL ?? null],
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
router.post("/user/paper/sync", requireAuth, async (req: any, res) => {
  const { accounts, positions, transactions, activeId } = req.body;
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Sync accounts
    await client.query("DELETE FROM paper_accounts WHERE user_id=$1", [req.userId]);
    for (const a of (accounts ?? [])) {
      await client.query(
        "INSERT INTO paper_accounts (id, user_id, name, cash, created_at) VALUES ($1,$2,$3,$4,$5)",
        [a.id, req.userId, a.name, a.cash, a.createdAt],
      );
    }

    // Sync positions
    await client.query("DELETE FROM paper_positions WHERE user_id=$1", [req.userId]);
    for (const p of (positions ?? [])) {
      await client.query(
        "INSERT INTO paper_positions (id, user_id, account_id, symbol, company_name, shares, avg_cost, opened_at, dividend_yield, sector) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)",
        [p.id, req.userId, p.accountId, p.symbol, p.companyName, p.shares, p.avgCost, p.openedAt, p.dividendYield ?? 0, p.sector ?? ""],
      );
    }

    // Sync transactions
    await client.query("DELETE FROM paper_transactions WHERE user_id=$1", [req.userId]);
    for (const t of (transactions ?? [])) {
      await client.query(
        "INSERT INTO paper_transactions (id, user_id, account_id, symbol, company_name, action, shares, price, total, date, realized_pnl) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)",
        [t.id, req.userId, t.accountId, t.symbol, t.companyName, t.action, t.shares, t.price, t.total, t.date, t.realizedPnL ?? null],
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
