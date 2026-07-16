/**
 * Watchlist persistence logic, extracted from the route handlers so it can be
 * integration-tested directly against Postgres (see watchlistStore.test.ts).
 *
 * The routes in routes/user.ts call these functions; keeping the SQL here
 * guarantees the tests exercise the exact queries production uses.
 */

/** Minimal interface satisfied by both pg.Pool and pg.PoolClient. */
export interface Querier {
  query(text: string, values?: any[]): Promise<{ rows: any[] }>;
}

/** Interface for transactional work: pg.Pool. */
export interface PoolLike extends Querier {
  connect(): Promise<Querier & { release(): void }>;
}

export interface WatchlistRow {
  symbol: string;
  createdAt: string;
  sortOrder: number;
}

/**
 * Returns the user's watchlist ordered by the saved drag order (sort_order
 * ascending), falling back to newest-first for ties.
 */
export async function getWatchlist(db: Querier, userId: string): Promise<WatchlistRow[]> {
  const { rows } = await db.query(
    "SELECT symbol, created_at, sort_order FROM watchlist WHERE user_id=$1 ORDER BY sort_order ASC, created_at DESC",
    [userId],
  );
  return rows.map((r: any) => ({
    symbol: r.symbol,
    createdAt: r.created_at instanceof Date ? r.created_at.toISOString() : r.created_at,
    sortOrder: Number(r.sort_order ?? 0),
  }));
}

/**
 * Adds a symbol at the top of the list: existing rows shift down by one and
 * the new row gets sort_order 0. Idempotent on duplicate symbols.
 */
export async function addToWatchlist(db: Querier, userId: string, symbol: string): Promise<void> {
  const sym = symbol.toUpperCase().trim();
  await db.query(
    "UPDATE watchlist SET sort_order = sort_order + 1 WHERE user_id=$1",
    [userId],
  );
  await db.query(
    "INSERT INTO watchlist (user_id, symbol, sort_order) VALUES ($1,$2,0) ON CONFLICT (user_id, symbol) DO NOTHING",
    [userId, sym],
  );
}

/**
 * Persists a user-defined drag order: assigns sort_order 0,1,2,... to the
 * given symbols inside a single transaction. Symbols are normalized to
 * uppercase to match how they are stored.
 */
export async function reorderWatchlist(pool: PoolLike, userId: string, symbols: string[]): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    for (let i = 0; i < symbols.length; i++) {
      await client.query(
        "UPDATE watchlist SET sort_order=$1 WHERE user_id=$2 AND symbol=$3",
        [i, userId, symbols[i].toUpperCase().trim()],
      );
    }
    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}

export async function removeFromWatchlist(db: Querier, userId: string, symbol: string): Promise<void> {
  await db.query(
    "DELETE FROM watchlist WHERE user_id=$1 AND symbol=$2",
    [userId, symbol.toUpperCase()],
  );
}
