import {
  isMarketPulseResponse,
  type MarketPulseResponse,
} from "./marketPulse.ts";

interface QueryResult {
  rows: Array<Record<string, unknown>>;
}

type Query = (text: string, values?: unknown[]) => Promise<QueryResult>;

const CACHE_KEY = "market-pulse";

export function createMarketPulseStore(query: Query) {
  let schemaReady: Promise<void> | null = null;

  async function ensureSchema(): Promise<void> {
    if (!schemaReady) {
      schemaReady = query(`
        CREATE TABLE IF NOT EXISTS market_pulse_cache (
          cache_key TEXT PRIMARY KEY,
          change_percent DOUBLE PRECISION NOT NULL,
          price_timestamp BIGINT NOT NULL,
          updated_at BIGINT NOT NULL
        )
      `).then(() => undefined).catch((err: unknown) => {
        schemaReady = null;
        throw err;
      });
    }
    await schemaReady;
  }

  return {
    async read(): Promise<MarketPulseResponse | null> {
      await ensureSchema();
      const result = await query(
        `SELECT change_percent, price_timestamp, updated_at
         FROM market_pulse_cache WHERE cache_key = $1`,
        [CACHE_KEY],
      );
      const row = result.rows[0];
      if (!row) return null;

      const data: MarketPulseResponse = {
        changePercent: Number(row["change_percent"]),
        priceTimestamp: Number(row["price_timestamp"]),
        updatedAt: Number(row["updated_at"]),
      };
      return isMarketPulseResponse(data) ? data : null;
    },

    async write(data: MarketPulseResponse): Promise<void> {
      await ensureSchema();
      await query(
        `INSERT INTO market_pulse_cache
           (cache_key, change_percent, price_timestamp, updated_at)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (cache_key) DO UPDATE SET
           change_percent = EXCLUDED.change_percent,
           price_timestamp = EXCLUDED.price_timestamp,
           updated_at = EXCLUDED.updated_at
         WHERE market_pulse_cache.price_timestamp <= EXCLUDED.price_timestamp`,
        [CACHE_KEY, data.changePercent, data.priceTimestamp, data.updatedAt],
      );
    },
  };
}
