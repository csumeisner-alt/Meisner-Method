import { randomUUID } from "node:crypto";
import {
  applyOrderSlippage,
  checkRisk,
  evaluateOrder,
  fillOrder,
} from "../../../mobile/lib/paperEngine.ts";
import type {
  PaperAccount,
  PaperLot,
  PaperOrder,
  PaperPosition,
  PaperTransaction,
} from "../../../mobile/lib/paperMath.ts";
import {
  buildSavedTradingFingerprintObservation,
  type SavedTradingFingerprintObservation,
} from "../../../mobile/lib/eventArenaTradingFingerprintObservation.ts";
import { calculateLightningRoundScore } from "./lightningRoundScore.ts";

type QueryResult = { rows: any[] };
export interface LightningExecutionDatabase {
  query(sql: string, values?: any[]): Promise<QueryResult>;
  connect?: () => Promise<{
    query(sql: string, values?: any[]): Promise<QueryResult>;
    release: () => void;
  }>;
}

export type LightningExecutionOrderResult =
  | { orderId: string; status: "filled"; filledPrice: number }
  | { orderId: string; status: "rejected"; reason: string }
  | { orderId: string; status: "waiting"; reason: string };

export type LightningExecutionCycleResult = {
  events: number;
  participants: number;
  filled: number;
  rejected: number;
  waiting: number;
};

type ExecutionOptions = {
  now?: () => number;
  fetchPrice: (symbol: string) => Promise<number | null>;
  makeId?: () => string;
};

type LightningRoundFinalResult = {
  eventId: string;
  startEquity: number;
  equity: number;
  cashBalance: number;
  returnPercent: number;
  tradeCount: number;
  holdings: Array<{
    symbol: string;
    companyName: string;
    allocationPercent: number;
    side: "long";
  }>;
  finalPrices: Record<string, number>;
  finalPositions: Array<{
    symbol: string;
    companyName: string;
    shares: number;
    avgCost: number;
    marketPrice: number;
    marketValue: number;
    unrealizedPnL: number;
  }>;
  tradingFingerprintObservation: SavedTradingFingerprintObservation;
  completedAtMs: number;
  finalRank?: number | null;
};

const LIGHTNING_HISTORY_MIN_INTERVAL_MS = 5 * 60 * 1000;

function finalResultFromRow(value: unknown): LightningRoundFinalResult | null {
  let parsed = value;
  if (typeof parsed === "string") {
    try { parsed = JSON.parse(parsed); } catch { return null; }
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
  const result = parsed as LightningRoundFinalResult;
  return Number.isFinite(result.equity)
    && Number.isFinite(result.completedAtMs)
    && result.finalPrices && typeof result.finalPrices === "object"
    && Array.isArray(result.finalPositions)
    ? result
    : null;
}

function asIso(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  const timestamp = new Date(String(value)).getTime();
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : "";
}

function accountFromRow(row: any): PaperAccount {
  return {
    id: row.id,
    name: row.name,
    cash: Number(row.cash),
    shortCollateral: Number(row.short_collateral ?? 0),
    shortCollateralRatio: Number(row.short_collateral_ratio ?? 1.5),
    unsettledItems: Array.isArray(row.unsettled_items) ? row.unsettled_items : [],
    unsettledCash: Array.isArray(row.unsettled_items)
      ? row.unsettled_items.reduce((sum: number, item: any) => sum + Number(item.amount || 0), 0)
      : 0,
    createdAt: asIso(row.created_at),
  };
}

function positionFromRow(row: any): PaperPosition {
  return {
    id: row.id,
    accountId: row.account_id,
    symbol: row.symbol,
    companyName: row.company_name ?? "",
    shares: Number(row.shares),
    positionType: row.position_type === "short" ? "short" : "long",
    collateralPerShare: row.collateral_per_share == null ? undefined : Number(row.collateral_per_share),
    avgCost: Number(row.avg_cost),
    openedAt: asIso(row.opened_at),
    dividendYield: Number(row.dividend_yield ?? 0),
    dividendRate: Number(row.dividend_rate ?? 0),
    expenseRatio: Number(row.expense_ratio ?? 0),
    sector: row.sector ?? "",
  };
}

function lotFromRow(row: any): PaperLot {
  return {
    id: row.id,
    accountId: row.account_id,
    symbol: row.symbol,
    shares: Number(row.shares),
    cost: Number(row.cost),
    purchasedAt: asIso(row.purchased_at),
  };
}

function orderFromRow(row: any): PaperOrder {
  return {
    id: row.id,
    accountId: row.account_id,
    lightningRoundEventId: row.lightning_round_event_id ?? undefined,
    symbol: row.symbol,
    companyName: row.company_name ?? "",
    orderType: row.order_type,
    side: row.side,
    ...(row.intent ? { intent: row.intent } : {}),
    ...(row.short_collateral_ratio != null
      ? { shortCollateralRatio: Number(row.short_collateral_ratio) }
      : {}),
    shares: Number(row.shares),
    ...(row.limit_price != null ? { limitPrice: Number(row.limit_price) } : {}),
    ...(row.stop_price != null ? { stopPrice: Number(row.stop_price) } : {}),
    ...(row.trail_pct != null ? { trailPct: Number(row.trail_pct) } : {}),
    ...(row.trail_abs != null ? { trailAbs: Number(row.trail_abs) } : {}),
    ...(row.trail_ref != null ? { trailRef: Number(row.trail_ref) } : {}),
    status: row.status,
    placedAt: asIso(row.placed_at),
    ...(row.asset_type ? { assetType: row.asset_type } : {}),
    ...(row.dividend_yield != null ? { dividendYield: Number(row.dividend_yield) } : {}),
    ...(row.dividend_rate != null ? { dividendRate: Number(row.dividend_rate) } : {}),
    ...(row.expense_ratio != null ? { expenseRatio: Number(row.expense_ratio) } : {}),
    ...(row.sector != null ? { sector: row.sector } : {}),
    ...(row.filled_price != null ? { filledPrice: Number(row.filled_price) } : {}),
    ...(row.filled_at != null ? { filledAt: asIso(row.filled_at) } : {}),
    ...(row.rejection_reason ? { rejectionReason: row.rejection_reason } : {}),
  };
}

function transactionFromRow(row: any): PaperTransaction {
  return {
    id: row.id,
    accountId: row.account_id,
    symbol: row.symbol,
    companyName: row.company_name ?? "",
    action: row.action,
    shares: Number(row.shares),
    price: Number(row.price),
    total: Number(row.total),
    date: asIso(row.date),
    ...(row.fee != null ? { fee: Number(row.fee) } : {}),
    ...(row.realized_pnl != null ? { realizedPnL: Number(row.realized_pnl) } : {}),
    ...(row.cash_delta != null ? { cashDelta: Number(row.cash_delta) } : {}),
    ...(row.short_collateral_delta != null
      ? { shortCollateralDelta: Number(row.short_collateral_delta) }
      : {}),
    ...(row.lightning_round_event_id
      ? { lightningRoundEventId: row.lightning_round_event_id }
      : {}),
  };
}

async function scoreParticipantActivity(
  db: LightningExecutionDatabase,
  participant: any,
  eventId: string,
  startAtMs: number,
  activityEndAtMs: number,
  startingBalance: number,
  fetchPrice: (symbol: string) => Promise<number | null>,
): Promise<{
  activityRows: any[];
  score: NonNullable<ReturnType<typeof calculateLightningRoundScore>>;
} | null> {
  const { rows: activityRows } = await db.query(
    `SELECT id,symbol,company_name,action,shares,price,total,realized_pnl,fee,date,lightning_round_event_id
     FROM paper_transactions
     WHERE user_id=$1 AND account_id=$2 AND lightning_round_event_id=$3
       AND date >= TO_TIMESTAMP($4 / 1000.0) AND date <= TO_TIMESTAMP($5 / 1000.0)
     ORDER BY date ASC,id ASC`,
    [participant.installation_id, participant.account_id, eventId, startAtMs, activityEndAtMs],
  );
  if (activityRows.length === 0) return null;
  const activity = activityRows.map((row) => ({
    symbol: String(row.symbol),
    company_name: row.company_name,
    action: String(row.action),
    shares: Number(row.shares),
    price: Number(row.price),
    total: Number(row.total),
    fee: row.fee == null ? null : Number(row.fee),
    date: row.date instanceof Date ? row.date.toISOString() : row.date,
  }));
  const symbols = [...new Set(activity.map((item) => item.symbol))];
  const priceResults = await Promise.all(symbols.map(async (symbol) => {
    try {
      const price = await fetchPrice(symbol);
      return [symbol, Number.isFinite(price) && (price ?? 0) > 0 ? price : null] as const;
    } catch {
      return [symbol, null] as const;
    }
  }));
  const prices: Record<string, number> = {};
  for (const [symbol, price] of priceResults) {
    if (price != null) prices[symbol] = price;
  }
  const score = calculateLightningRoundScore(activity, prices, startingBalance);
  if (!score) return null;
  return { activityRows, score };
}

async function freezeParticipantResult(
  db: LightningExecutionDatabase,
  participant: any,
  eventId: string,
  startAtMs: number,
  endAtMs: number,
  startingBalance: number,
  fetchPrice: (symbol: string) => Promise<number | null>,
): Promise<LightningRoundFinalResult | null> {
  const scoredActivity = await scoreParticipantActivity(
    db,
    participant,
    eventId,
    startAtMs,
    endAtMs,
    startingBalance,
    fetchPrice,
  );
  if (!scoredActivity) return null;
  const { activityRows, score } = scoredActivity;
  const tradingFingerprintObservation = buildSavedTradingFingerprintObservation({
    participantId: String(participant.installation_id),
    accountId: String(participant.account_id),
    eventId,
    eventType: "lightning-round",
    eventStartAtMs: startAtMs,
    eventEndAtMs: endAtMs,
    startingEquity: startingBalance,
    transactions: activityRows.map((row) => ({
      id: String(row.id ?? ""),
      accountId: String(participant.account_id),
      symbol: String(row.symbol),
      companyName: String(row.company_name ?? ""),
      action: row.action,
      shares: Number(row.shares),
      price: Number(row.price),
      total: Number(row.total),
      date: asIso(row.date),
      ...(row.realized_pnl == null ? {} : { realizedPnL: Number(row.realized_pnl) }),
      fee: Number(row.fee ?? 0),
      ...(row.lightning_round_event_id
        ? { lightningRoundEventId: String(row.lightning_round_event_id) }
        : {}),
    })),
  });
  const result: LightningRoundFinalResult = {
    eventId,
    startEquity: score.startEquity,
    equity: score.equity,
    cashBalance: score.cashBalance,
    returnPercent: score.returnPercent,
    tradeCount: score.tradeCount,
    holdings: score.holdings,
    finalPrices: score.finalPrices,
    finalPositions: score.finalPositions,
    tradingFingerprintObservation,
    completedAtMs: endAtMs,
  };
  return result;
}

async function refreshActiveEventStandings(
  db: LightningExecutionDatabase,
  event: any,
  startAtMs: number,
  endAtMs: number,
  nowMs: number,
  fetchPrice: (symbol: string) => Promise<number | null>,
): Promise<void> {
  const { rows: participants } = await db.query(
    `SELECT event_id,installation_id,account_id,alias,status,leaderboard_opted_in
     FROM event_arena_lightning_participants
     WHERE event_id=$1 AND status='entered' AND leaderboard_opted_in=TRUE
     ORDER BY installation_id
     FOR UPDATE`,
    [event.event_id],
  );
  if (participants.length === 0) return;

  const scoredParticipants: Array<{ participant: any; score: NonNullable<ReturnType<typeof calculateLightningRoundScore>> }> = [];
  for (const participant of participants) {
    const scoredActivity = await scoreParticipantActivity(
      db,
      participant,
      event.event_id,
      startAtMs,
      Math.min(nowMs, endAtMs),
      Number(event.starting_balance),
      fetchPrice,
    );
    // Keep this participant's previous result untouched, but do not let one
    // malformed or currently unscorable history block other participants.
    if (!scoredActivity) continue;
    scoredParticipants.push({ participant, score: scoredActivity.score! });
  }
  if (scoredParticipants.length === 0) return;

  for (const { participant, score } of scoredParticipants) {
    await db.query(
      `INSERT INTO event_arena_leaderboard_entries
        (event_id,installation_id,alias,start_equity,equity,return_percent,trade_count,holdings,
         event_start_at,event_end_at,updated_at,cash_balance)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,TO_TIMESTAMP($9 / 1000.0),
         TO_TIMESTAMP($10 / 1000.0),TO_TIMESTAMP($11 / 1000.0),$12)
       ON CONFLICT (event_id,installation_id) DO UPDATE SET
         alias=EXCLUDED.alias,start_equity=EXCLUDED.start_equity,equity=EXCLUDED.equity,
         return_percent=EXCLUDED.return_percent,trade_count=EXCLUDED.trade_count,
         holdings=EXCLUDED.holdings,updated_at=EXCLUDED.updated_at,
         cash_balance=EXCLUDED.cash_balance,is_active=TRUE`,
      [
        event.event_id,
        participant.installation_id,
        participant.alias,
        score.startEquity,
        score.equity,
        score.returnPercent,
        score.tradeCount,
        JSON.stringify(score.holdings),
        startAtMs,
        endAtMs,
        nowMs,
        score.cashBalance,
      ],
    );
  }

  const { rows: rankedRows } = await db.query(
    `SELECT installation_id,participant_token,rank,return_percent
     FROM (
       SELECT entry.installation_id,entry.participant_token,entry.return_percent,
         ROW_NUMBER() OVER (
           ORDER BY entry.return_percent DESC,entry.installation_id ASC
         )::int AS rank
       FROM event_arena_leaderboard_entries AS entry
       JOIN event_arena_lightning_participants AS participant
         ON participant.event_id=entry.event_id
         AND participant.installation_id=entry.installation_id
       WHERE entry.event_id=$1 AND entry.installation_id=ANY($2::text[])
         AND entry.is_active=TRUE AND participant.status='entered'
         AND participant.leaderboard_opted_in=TRUE
     ) AS ranked
     ORDER BY rank`,
    [event.event_id, scoredParticipants.map(({ participant }) => participant.installation_id)],
  );
  if (rankedRows.length === 0) return;

  await db.query(
    `INSERT INTO event_arena_leaderboard_snapshots
       (event_id,participant_token,event_start_at,event_end_at,captured_at,rank,return_percent,is_final)
     SELECT $1,snapshot.participant_token,TO_TIMESTAMP($5 / 1000.0),
       TO_TIMESTAMP($6 / 1000.0),TO_TIMESTAMP($7 / 1000.0),snapshot.rank,
       snapshot.return_percent,FALSE
     FROM UNNEST($2::text[],$3::integer[],$4::double precision[])
       AS snapshot(participant_token,rank,return_percent)
     LEFT JOIN LATERAL (
       SELECT snapshot_id,rank,return_percent,captured_at
       FROM event_arena_leaderboard_snapshots
       WHERE event_id=$1 AND participant_token=snapshot.participant_token AND is_final=FALSE
       ORDER BY captured_at DESC,snapshot_id DESC
       LIMIT 1
     ) AS previous ON TRUE
     WHERE previous.snapshot_id IS NULL
       OR (
         (previous.rank IS DISTINCT FROM snapshot.rank
           OR previous.return_percent IS DISTINCT FROM snapshot.return_percent)
         AND previous.captured_at <= TO_TIMESTAMP($7 / 1000.0)
           - ($8 * INTERVAL '1 millisecond')
       )`,
    [
      event.event_id,
      rankedRows.map((row) => row.participant_token),
      rankedRows.map((row) => Number(row.rank)),
      rankedRows.map((row) => Number(row.return_percent)),
      startAtMs,
      endAtMs,
      nowMs,
      LIGHTNING_HISTORY_MIN_INTERVAL_MS,
    ],
  );
}

async function finalizeEventStandings(
  db: LightningExecutionDatabase,
  event: any,
  startAtMs: number,
  endAtMs: number,
  fetchPrice: (symbol: string) => Promise<number | null>,
): Promise<boolean> {
  const { rows: participants } = await db.query(
    `SELECT event_id,installation_id,account_id,alias,status,leaderboard_opted_in,final_result
     FROM event_arena_lightning_participants
     WHERE event_id=$1 AND status='entered'
     ORDER BY installation_id
     FOR UPDATE`,
    [event.event_id],
  );
  const finalResults = new Map<string, LightningRoundFinalResult>();
  for (const participant of participants) {
    const result = await freezeParticipantResult(
      db,
      participant,
      event.event_id,
      startAtMs,
      endAtMs,
      Number(event.starting_balance),
      fetchPrice,
    );
    if (!result) return false;
    finalResults.set(participant.installation_id, result);
  }

  for (const participant of participants) {
    if (participant.leaderboard_opted_in === false) continue;
    const result = finalResults.get(participant.installation_id)!;
    await db.query(
      `INSERT INTO event_arena_leaderboard_entries
        (event_id,installation_id,alias,start_equity,equity,return_percent,trade_count,holdings,
         event_start_at,event_end_at,updated_at,cash_balance)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,TO_TIMESTAMP($9 / 1000.0),
         TO_TIMESTAMP($10 / 1000.0),TO_TIMESTAMP($10 / 1000.0),$11)
       ON CONFLICT (event_id,installation_id) DO UPDATE SET
         alias=EXCLUDED.alias,start_equity=EXCLUDED.start_equity,equity=EXCLUDED.equity,
         return_percent=EXCLUDED.return_percent,trade_count=EXCLUDED.trade_count,
         holdings=EXCLUDED.holdings,updated_at=EXCLUDED.updated_at,cash_balance=EXCLUDED.cash_balance`,
      [
        event.event_id,
        participant.installation_id,
        participant.alias,
        result.startEquity,
        result.equity,
        result.returnPercent,
        result.tradeCount,
        JSON.stringify(result.holdings),
        startAtMs,
        endAtMs,
        result.cashBalance,
      ],
    );
  }

  const { rows: rankedRows } = await db.query(
    `SELECT installation_id,participant_token,rank,return_percent
     FROM (
       SELECT entry.installation_id,entry.participant_token,entry.return_percent,
         ROW_NUMBER() OVER (
           ORDER BY entry.return_percent DESC,entry.installation_id ASC
         )::int AS rank
       FROM event_arena_leaderboard_entries AS entry
       JOIN event_arena_lightning_participants AS participant
         ON participant.event_id=entry.event_id
         AND participant.installation_id=entry.installation_id
       WHERE entry.event_id=$1 AND entry.is_active=TRUE AND participant.status='entered'
         AND participant.leaderboard_opted_in=TRUE
     ) AS ranked
     ORDER BY rank`,
    [event.event_id],
  );
  if (rankedRows.length > 0) {
    await db.query(
      `INSERT INTO event_arena_leaderboard_snapshots
        (event_id,participant_token,event_start_at,event_end_at,captured_at,rank,return_percent,is_final)
       SELECT $1,snapshot.participant_token,TO_TIMESTAMP($4 / 1000.0),
         TO_TIMESTAMP($5 / 1000.0),TO_TIMESTAMP($5 / 1000.0),snapshot.rank,
         snapshot.return_percent,TRUE
       FROM UNNEST($2::text[],$3::integer[],$6::double precision[])
         AS snapshot(participant_token,rank,return_percent)
       ON CONFLICT (event_id,participant_token) WHERE is_final=TRUE DO NOTHING`,
      [
        event.event_id,
        rankedRows.map((row) => row.participant_token),
        rankedRows.map((row) => Number(row.rank)),
        startAtMs,
        endAtMs,
        rankedRows.map((row) => Number(row.return_percent)),
      ],
    );
  }
  const rankByInstallation = new Map(
    rankedRows.map((row) => [row.installation_id, Number(row.rank)] as const),
  );
  for (const participant of participants) {
    const result = finalResults.get(participant.installation_id)!;
    const finalRank = rankByInstallation.get(participant.installation_id) ?? null;
    await db.query(
      `UPDATE event_arena_lightning_participants
       SET final_result=$3::jsonb
       WHERE event_id=$1 AND installation_id=$2`,
      [
        event.event_id,
        participant.installation_id,
        JSON.stringify({ ...result, finalRank }),
      ],
    );
  }
  await db.query(
    `UPDATE event_arena_events SET finalized_at=TO_TIMESTAMP($2 / 1000.0)
     WHERE event_id=$1 AND finalized_at IS NULL`,
    [event.event_id, endAtMs],
  );
  return true;
}

function validQueuedOrder(order: PaperOrder, eventId: string): string | null {
  if (order.lightningRoundEventId !== eventId) return "Order is not assigned to this Lightning Round.";
  if (order.orderType !== "market" || order.side !== "buy") {
    return "Lightning Round opening orders must be market buys.";
  }
  if (order.intent) return "Lightning Round opening orders cannot be short or cover orders.";
  if (!/^[A-Z0-9.^=-]{1,15}$/.test(order.symbol)) return "The order ticker is invalid.";
  if (!Number.isFinite(order.shares) || order.shares <= 0) return "The order quantity must be greater than zero.";
  return null;
}

async function replacePositions(
  db: LightningExecutionDatabase,
  userId: string,
  accountId: string,
  positions: PaperPosition[],
) {
  await db.query("DELETE FROM paper_positions WHERE user_id=$1 AND account_id=$2", [userId, accountId]);
  for (const position of positions.filter((item) => item.accountId === accountId)) {
    await db.query(
      `INSERT INTO paper_positions
        (id,user_id,account_id,symbol,company_name,shares,avg_cost,position_type,collateral_per_share,opened_at,dividend_yield,dividend_rate,expense_ratio,sector)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
      [
        position.id, userId, accountId, position.symbol, position.companyName, position.shares,
        position.avgCost, position.positionType ?? "long", position.collateralPerShare ?? null,
        position.openedAt, position.dividendYield, position.dividendRate ?? 0,
        position.expenseRatio ?? 0, position.sector,
      ],
    );
  }
}

async function replaceLots(
  db: LightningExecutionDatabase,
  userId: string,
  accountId: string,
  lots: PaperLot[],
) {
  await db.query("DELETE FROM paper_lots WHERE user_id=$1 AND account_id=$2", [userId, accountId]);
  for (const lot of lots.filter((item) => item.accountId === accountId)) {
    await db.query(
      `INSERT INTO paper_lots (id,user_id,account_id,symbol,shares,cost,purchased_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [lot.id, userId, accountId, lot.symbol, lot.shares, lot.cost, lot.purchasedAt],
    );
  }
}

export type LightningRoundOrderResult =
  | {
      ok: true;
      account: PaperAccount;
      positions: PaperPosition[];
      lots: PaperLot[];
      transaction: PaperTransaction;
      order: PaperOrder;
      replayed?: boolean;
    }
  | { ok: false; status: 404 | 409 | 422; error: string };

export async function executeLightningRoundOrder(
  db: LightningExecutionDatabase,
  args: {
    eventId: string;
    installationId: string;
    order: PaperOrder;
    now?: () => number;
    fetchPrice: (symbol: string) => Promise<number | null>;
    makeId?: () => string;
  },
): Promise<LightningRoundOrderResult> {
  const now = args.now ?? Date.now;
  const client = db.connect ? await db.connect() : null;
  const connection: LightningExecutionDatabase = client ?? db;
  await connection.query("BEGIN");
  try {
    await connection.query("SELECT pg_advisory_xact_lock(hashtext($1))", [args.eventId]);
    const { rows: participantRows } = await connection.query(
      `SELECT event_id,installation_id,account_id,status,event_start_at,event_end_at
       FROM event_arena_lightning_participants
       WHERE event_id=$1 AND installation_id=$2 FOR UPDATE`,
      [args.eventId, args.installationId],
    );
    const participant = participantRows[0];
    if (!participant) {
      await connection.query("ROLLBACK");
      return { ok: false, status: 404, error: "Lightning Round participation was not found." };
    }
    if (participant.status !== "entered") {
      await connection.query("ROLLBACK");
      return {
        ok: false,
        status: 409,
        error: "Your Lightning Round opening order must fill before placing live trades.",
      };
    }

    const eventStartAtMs = new Date(participant.event_start_at).getTime();
    const eventEndAtMs = new Date(participant.event_end_at).getTime();
    const currentTime = now();
    if (currentTime < eventStartAtMs || currentTime >= eventEndAtMs) {
      await connection.query("ROLLBACK");
      return { ok: false, status: 409, error: "The Lightning Round is not currently accepting trades." };
    }

    const input = args.order;
    const symbol = typeof input.symbol === "string" ? input.symbol.trim().toUpperCase() : "";
    const validId = typeof input.id === "string"
      && input.id.length >= 8
      && input.id.length <= 128
      && /^[A-Za-z0-9_-]+$/.test(input.id);
    const validSideAndIntent = (input.side === "buy" && (!input.intent || input.intent === "cover"))
      || (input.side === "sell" && (!input.intent || input.intent === "short"));
    const validOrderType = ["market", "limit", "stop", "stop_limit", "trailing_stop"].includes(input.orderType);
    const validOrderTriggers =
      (!["limit", "stop_limit"].includes(input.orderType)
        || (Number.isFinite(input.limitPrice) && (input.limitPrice ?? 0) > 0))
      && (!["stop", "stop_limit"].includes(input.orderType)
        || (Number.isFinite(input.stopPrice) && (input.stopPrice ?? 0) > 0))
      && (input.orderType !== "trailing_stop"
        || (Number.isFinite(input.trailPct) && (input.trailPct ?? 0) > 0)
        || (Number.isFinite(input.trailAbs) && (input.trailAbs ?? 0) > 0));
    if (
      !validId
      || input.accountId !== participant.account_id
      || !validOrderType
      || !validOrderTriggers
      || !validSideAndIntent
      || !/^[A-Z0-9.^=-]{1,15}$/.test(symbol)
      || !Number.isFinite(input.shares)
      || input.shares <= 0
    ) {
      await connection.query("ROLLBACK");
      return { ok: false, status: 422, error: "The Lightning Round order is invalid." };
    }

    const { rows: priorRows } = await connection.query(
      `SELECT id,account_id,lightning_round_event_id,symbol,company_name,order_type,side,intent,
              short_collateral_ratio,shares,limit_price,stop_price,trail_pct,trail_abs,trail_ref,
              status,placed_at,filled_price,filled_at,rejection_reason,asset_type,dividend_yield,
              dividend_rate,expense_ratio,sector
       FROM paper_orders
       WHERE id=$1 AND user_id=$2 FOR UPDATE`,
      [input.id, args.installationId],
    );
    const priorOrderRow = priorRows[0];
    if (priorOrderRow) {
      if (
        priorOrderRow.account_id !== participant.account_id
        || priorOrderRow.lightning_round_event_id !== args.eventId
      ) {
        await connection.query("ROLLBACK");
        return { ok: false, status: 409, error: "That order ID is already in use." };
      }
      if (priorOrderRow.status !== "filled") {
        await connection.query("ROLLBACK");
        return { ok: false, status: 409, error: "That Lightning Round order has already been submitted." };
      }
      const [accountResult, positionResult, lotResult, transactionResult] = await Promise.all([
        connection.query(
          `SELECT id,name,cash,short_collateral,short_collateral_ratio,created_at,unsettled_items,last_dividend_credit
           FROM paper_accounts WHERE id=$1 AND user_id=$2`,
          [participant.account_id, args.installationId],
        ),
        connection.query(
          `SELECT id,account_id,symbol,company_name,shares,position_type,collateral_per_share,avg_cost,
                  opened_at,dividend_yield,dividend_rate,expense_ratio,sector
           FROM paper_positions WHERE account_id=$1 AND user_id=$2`,
          [participant.account_id, args.installationId],
        ),
        connection.query(
          `SELECT id,account_id,symbol,shares,cost,purchased_at
           FROM paper_lots WHERE account_id=$1 AND user_id=$2 ORDER BY purchased_at ASC`,
          [participant.account_id, args.installationId],
        ),
        connection.query(
          `SELECT id,account_id,symbol,company_name,action,shares,price,total,date,fee,realized_pnl,
                  cash_delta,short_collateral_delta,lightning_round_event_id
           FROM paper_transactions WHERE id=$1 AND user_id=$2 AND account_id=$3 AND lightning_round_event_id=$4`,
          [input.id, args.installationId, participant.account_id, args.eventId],
        ),
      ]);
      const accountRow = accountResult.rows[0];
      const transactionRow = transactionResult.rows[0];
      if (!accountRow || !transactionRow) {
        await connection.query("ROLLBACK");
        return { ok: false, status: 409, error: "The saved Lightning Round fill could not be recovered." };
      }
      const result: LightningRoundOrderResult = {
        ok: true,
        account: accountFromRow(accountRow),
        positions: positionResult.rows.map(positionFromRow),
        lots: lotResult.rows.map(lotFromRow),
        transaction: transactionFromRow(transactionRow),
        order: orderFromRow(priorOrderRow),
        replayed: true,
      };
      await connection.query("COMMIT");
      return result;
    }

    let marketPrice: number | null = null;
    try {
      marketPrice = await args.fetchPrice(symbol);
    } catch {
      marketPrice = null;
    }
    if (!Number.isFinite(marketPrice) || (marketPrice ?? 0) <= 0) {
      await connection.query("ROLLBACK");
      return { ok: false, status: 409, error: `A current market price for ${symbol} is unavailable; no trade was made.` };
    }

    const userId = args.installationId;
    const accountId = participant.account_id;
    const [accountResult, positionResult, lotResult, pendingOrderResult] = await Promise.all([
      connection.query(
        `SELECT id,name,cash,short_collateral,short_collateral_ratio,created_at,unsettled_items,last_dividend_credit
         FROM paper_accounts WHERE id=$1 AND user_id=$2 FOR UPDATE`,
        [accountId, userId],
      ),
      connection.query(
        `SELECT id,account_id,symbol,company_name,shares,position_type,collateral_per_share,avg_cost,
                opened_at,dividend_yield,dividend_rate,expense_ratio,sector
         FROM paper_positions WHERE account_id=$1 AND user_id=$2 FOR UPDATE`,
        [accountId, userId],
      ),
      connection.query(
        `SELECT id,account_id,symbol,shares,cost,purchased_at
         FROM paper_lots WHERE account_id=$1 AND user_id=$2 ORDER BY purchased_at ASC FOR UPDATE`,
        [accountId, userId],
      ),
      connection.query(
        `SELECT id,account_id,lightning_round_event_id,symbol,company_name,order_type,side,intent,
                short_collateral_ratio,shares,limit_price,stop_price,trail_pct,trail_abs,trail_ref,
                status,placed_at,filled_price,filled_at,rejection_reason,asset_type,dividend_yield,
                dividend_rate,expense_ratio,sector
         FROM paper_orders
         WHERE user_id=$1 AND account_id=$2 AND status='pending'
         ORDER BY placed_at ASC,id ASC FOR UPDATE`,
        [userId, accountId],
      ),
    ]);
    const accountRow = accountResult.rows[0];
    if (!accountRow) {
      await connection.query("ROLLBACK");
      return { ok: false, status: 409, error: "The Lightning Round account is unavailable; no trade was made." };
    }
    const account = accountFromRow(accountRow);
    const positions = positionResult.rows.map(positionFromRow);
    const lots = lotResult.rows.map(lotFromRow);
    const order: PaperOrder = {
      ...input,
      accountId,
      lightningRoundEventId: args.eventId,
      symbol,
      companyName: typeof input.companyName === "string" ? input.companyName.slice(0, 120) : symbol,
      status: "pending",
      placedAt: new Date(currentTime).toISOString(),
      filledAt: undefined,
      filledPrice: undefined,
      rejectionReason: undefined,
    };
    if (!evaluateOrder(order, marketPrice!).shouldFill) {
      await connection.query("ROLLBACK");
      return {
        ok: false,
        status: 409,
        error: "The current market price no longer meets this order's trigger; it remains pending.",
      };
    }
    const fillPrice = applyOrderSlippage(order, marketPrice!);
    const riskError = checkRisk({
      side: order.side,
      intent: order.intent,
      shares: order.shares,
      orderType: order.orderType,
      limitPrice: order.limitPrice,
      stopPrice: order.stopPrice,
      trailPct: order.trailPct,
      trailAbs: order.trailAbs,
      symbol,
      currentPrice: fillPrice,
      account,
      accountPositions: positions,
      quotes: { [symbol]: { price: marketPrice! } },
      pendingOrders: pendingOrderResult.rows.map(orderFromRow),
      excludeOrderId: order.id,
    });
    if (riskError) {
      await connection.query("ROLLBACK");
      return { ok: false, status: 422, error: riskError };
    }

    const filledAt = new Date(currentTime).toISOString();
    const fill = fillOrder({
      order,
      fillPrice,
      executionQuotePrice: marketPrice!,
      filledAt,
      account,
      positions,
      lots,
      uid: args.makeId ?? randomUUID,
    });
    if (!fill.ok) {
      await connection.query("ROLLBACK");
      return { ok: false, status: 422, error: fill.reason };
    }
    const transaction: PaperTransaction = {
      ...fill.newTransaction,
      id: order.id,
      lightningRoundEventId: args.eventId,
    };
    const filledOrder: PaperOrder = {
      ...order,
      status: "filled",
      filledPrice: fillPrice,
      filledAt,
    };
    await connection.query(
      `UPDATE paper_accounts
       SET cash=$3,short_collateral=$4,short_collateral_ratio=$5,unsettled_items=$6::jsonb
       WHERE id=$1 AND user_id=$2`,
      [
        accountId, userId, fill.updatedAccount.cash, fill.updatedAccount.shortCollateral ?? 0,
        fill.updatedAccount.shortCollateralRatio ?? 1.5,
        JSON.stringify(fill.updatedAccount.unsettledItems ?? []),
      ],
    );
    await replacePositions(connection, userId, accountId, fill.updatedPositions);
    await replaceLots(connection, userId, accountId, fill.updatedLots);
    await connection.query(
      `INSERT INTO paper_transactions
        (id,user_id,account_id,symbol,company_name,action,shares,price,total,date,fee,realized_pnl,
         cash_delta,short_collateral_delta,lightning_round_event_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
      [
        transaction.id, userId, accountId, transaction.symbol, transaction.companyName,
        transaction.action, transaction.shares, transaction.price, transaction.total, transaction.date,
        transaction.fee ?? 0, transaction.realizedPnL ?? null, transaction.cashDelta ?? null,
        transaction.shortCollateralDelta ?? null, args.eventId,
      ],
    );
    await connection.query(
      `INSERT INTO paper_orders
        (id,user_id,account_id,lightning_round_event_id,symbol,company_name,order_type,side,intent,
         short_collateral_ratio,shares,limit_price,stop_price,trail_pct,trail_abs,trail_ref,status,
         filled_price,filled_at,placed_at,rejection_reason,asset_type,dividend_yield,dividend_rate,
         expense_ratio,sector)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,'filled',$17,$18,$19,NULL,
               $20,$21,$22,$23,$24)`,
      [
        filledOrder.id, userId, accountId, args.eventId, filledOrder.symbol, filledOrder.companyName,
        filledOrder.orderType, filledOrder.side, filledOrder.intent ?? null,
        filledOrder.shortCollateralRatio ?? null, filledOrder.shares, filledOrder.limitPrice ?? null,
        filledOrder.stopPrice ?? null, filledOrder.trailPct ?? null, filledOrder.trailAbs ?? null,
        filledOrder.trailRef ?? null, filledOrder.filledPrice, filledOrder.filledAt, filledOrder.placedAt,
        filledOrder.assetType ?? null, filledOrder.dividendYield ?? 0, filledOrder.dividendRate ?? 0,
        filledOrder.expenseRatio ?? 0, filledOrder.sector ?? null,
      ],
    );
    await connection.query(
      `UPDATE event_arena_lightning_participants
       SET updated_at=NOW() WHERE event_id=$1 AND installation_id=$2`,
      [args.eventId, userId],
    );
    const result: LightningRoundOrderResult = {
      ok: true,
      account: fill.updatedAccount,
      positions: fill.updatedPositions.filter((item) => item.accountId === accountId),
      lots: fill.updatedLots.filter((item) => item.accountId === accountId),
      transaction,
      order: filledOrder,
    };
    await connection.query("COMMIT");
    return result;
  } catch (error) {
    await connection.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client?.release();
  }
}

async function finalizeParticipant(
  db: LightningExecutionDatabase,
  participant: any,
  eventId: string,
  eventEnded: boolean,
  fetchPrice: (symbol: string) => Promise<number | null>,
  makeId: () => string,
  now: () => number,
): Promise<LightningExecutionOrderResult[]> {
  const userId = participant.installation_id;
  const accountId = participant.account_id;
  const { rows: accountRows } = await db.query(
    `SELECT id,name,cash,short_collateral,short_collateral_ratio,created_at,unsettled_items
     FROM paper_accounts WHERE id=$1 AND user_id=$2 FOR UPDATE`,
    [accountId, userId],
  );
  const { rows: orderRows } = await db.query(
    `SELECT id,account_id,lightning_round_event_id,symbol,company_name,order_type,side,shares,status,
            placed_at,filled_price,filled_at,rejection_reason,asset_type,dividend_yield,dividend_rate,expense_ratio,sector
     FROM paper_orders
     WHERE user_id=$1 AND account_id=$2 AND lightning_round_event_id=$3 AND status='pending'
     ORDER BY placed_at ASC,id ASC FOR UPDATE`,
    [userId, accountId, eventId],
  );

  const orders = orderRows.map(orderFromRow);
  const results: LightningExecutionOrderResult[] = [];
  const accountRow = accountRows[0];
  if (!accountRow) {
    const reason = "The shared Event Arena account is unavailable; no order was executed.";
    for (const order of orders) {
      await db.query(
        `UPDATE paper_orders SET status='cancelled',rejection_reason=$4
         WHERE id=$1 AND user_id=$2 AND account_id=$3 AND status='pending'`,
        [order.id, userId, accountId, reason],
      );
      results.push({ orderId: order.id, status: "rejected", reason });
    }
    await db.query(
      `UPDATE event_arena_lightning_participants
       SET status='rejected',failure_reason=$3,updated_at=NOW()
       WHERE event_id=$1 AND installation_id=$2`,
      [eventId, userId, reason],
    );
    return results;
  }

  const account: PaperAccount = accountFromRow(accountRow);
  const { rows: positionRows } = await db.query(
    `SELECT id,account_id,symbol,company_name,shares,position_type,collateral_per_share,avg_cost,opened_at,
            dividend_yield,dividend_rate,expense_ratio,sector
     FROM paper_positions WHERE user_id=$1 AND account_id=$2 FOR UPDATE`,
    [userId, accountId],
  );
  let positions = positionRows.map(positionFromRow);
  const { rows: lotRows } = await db.query(
    `SELECT id,account_id,symbol,shares,cost,purchased_at
     FROM paper_lots WHERE user_id=$1 AND account_id=$2 FOR UPDATE`,
    [userId, accountId],
  );
  let lots = lotRows.map(lotFromRow);

  for (const order of orders) {
    const invalidReason = validQueuedOrder(order, eventId);
    if (invalidReason) {
      await db.query(
        `UPDATE paper_orders SET status='cancelled',rejection_reason=$4
         WHERE id=$1 AND user_id=$2 AND account_id=$3 AND status='pending'`,
        [order.id, userId, accountId, invalidReason],
      );
      results.push({ orderId: order.id, status: "rejected", reason: invalidReason });
      continue;
    }
    if (eventEnded) {
      const reason = order.rejectionReason
        ? `${order.rejectionReason} The order expired when the Lightning Round ended; no fill was made.`
        : "No opening fill was completed before the Lightning Round ended.";
      await db.query(
        `UPDATE paper_orders SET status='cancelled',rejection_reason=$4
         WHERE id=$1 AND user_id=$2 AND account_id=$3 AND status='pending'`,
        [order.id, userId, accountId, reason],
      );
      results.push({ orderId: order.id, status: "rejected", reason });
      continue;
    }

    let marketPrice: number | null = null;
    try {
      marketPrice = await fetchPrice(order.symbol);
    } catch {
      marketPrice = null;
    }
    if (!Number.isFinite(marketPrice) || (marketPrice ?? 0) <= 0) {
      const reason = `No valid market price was available for ${order.symbol}; the order will be retried.`;
      await db.query(
        `UPDATE paper_orders SET rejection_reason=$4
         WHERE id=$1 AND user_id=$2 AND account_id=$3 AND status='pending'`,
        [order.id, userId, accountId, reason],
      );
      results.push({ orderId: order.id, status: "waiting", reason });
      continue;
    }
    if (now() >= Number(participant.event_end_at_ms ?? Number.POSITIVE_INFINITY)) {
      const reason = "No opening fill was completed before the Lightning Round ended.";
      await db.query(
        `UPDATE paper_orders SET status='cancelled',rejection_reason=$4
         WHERE id=$1 AND user_id=$2 AND account_id=$3 AND status='pending'`,
        [order.id, userId, accountId, reason],
      );
      results.push({ orderId: order.id, status: "rejected", reason });
      continue;
    }

    const quote = marketPrice!;
    const fillPrice = applyOrderSlippage(order, quote);
    const riskError = checkRisk({
      side: "buy",
      shares: order.shares,
      orderType: "market",
      symbol: order.symbol,
      currentPrice: fillPrice,
      account,
      accountPositions: positions,
      quotes: { [order.symbol]: { price: quote } },
    });
    if (riskError) {
      await db.query(
        `UPDATE paper_orders SET status='cancelled',rejection_reason=$4
         WHERE id=$1 AND user_id=$2 AND account_id=$3 AND status='pending'`,
        [order.id, userId, accountId, riskError],
      );
      results.push({ orderId: order.id, status: "rejected", reason: riskError });
      continue;
    }

    const filledAt = new Date(Math.max(now(), Number(participant.event_start_at_ms ?? 0))).toISOString();
    const fill = fillOrder({
      order,
      fillPrice,
      executionQuotePrice: quote,
      filledAt,
      account,
      positions,
      lots,
      uid: makeId,
    });
    if (!fill.ok) {
      await db.query(
        `UPDATE paper_orders SET status='cancelled',rejection_reason=$4
         WHERE id=$1 AND user_id=$2 AND account_id=$3 AND status='pending'`,
        [order.id, userId, accountId, fill.reason],
      );
      results.push({ orderId: order.id, status: "rejected", reason: fill.reason });
      continue;
    }

    const transaction: PaperTransaction = {
      ...fill.newTransaction,
      lightningRoundEventId: eventId,
    };
    await db.query(
      `UPDATE paper_accounts SET cash=$3 WHERE id=$1 AND user_id=$2`,
      [accountId, userId, fill.updatedAccount.cash],
    );
    await replacePositions(db, userId, accountId, fill.updatedPositions);
    await replaceLots(db, userId, accountId, fill.updatedLots);
    await db.query(
      `INSERT INTO paper_transactions
        (id,user_id,account_id,symbol,company_name,action,shares,price,total,date,fee,realized_pnl,cash_delta,short_collateral_delta,lightning_round_event_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
       ON CONFLICT (id,user_id) DO NOTHING`,
      [
        transaction.id, userId, accountId, transaction.symbol, transaction.companyName,
        transaction.action, transaction.shares, transaction.price, transaction.total, transaction.date,
        transaction.fee ?? 0, transaction.realizedPnL ?? null, transaction.cashDelta ?? null,
        transaction.shortCollateralDelta ?? null, eventId,
      ],
    );
    await db.query(
      `UPDATE paper_orders
       SET status='filled',filled_price=$4,filled_at=$5,rejection_reason=NULL
       WHERE id=$1 AND user_id=$2 AND account_id=$3 AND status='pending'`,
      [order.id, userId, accountId, fillPrice, filledAt],
    );
    Object.assign(account, fill.updatedAccount);
    positions = fill.updatedPositions;
    lots = fill.updatedLots;
    results.push({ orderId: order.id, status: "filled", filledPrice: fillPrice });
  }

  const { rows: statusRows } = await db.query(
    `SELECT
       COUNT(*) FILTER (WHERE status='filled')::int AS filled_count,
       COUNT(*) FILTER (WHERE status='pending')::int AS pending_count,
       ARRAY_AGG(rejection_reason) FILTER (WHERE status='cancelled' AND rejection_reason IS NOT NULL) AS reasons
     FROM paper_orders
     WHERE user_id=$1 AND account_id=$2 AND lightning_round_event_id=$3`,
    [userId, accountId, eventId],
  );
  const status = statusRows[0] ?? {};
  const entered = Number(status.filled_count ?? 0) > 0;
  const allDone = Number(status.pending_count ?? 0) === 0;
  const failureReason = entered
    ? null
    : allDone
      ? [...new Set(Array.isArray(status.reasons) ? status.reasons : [])].join(" ")
        || "No valid opening order was filled."
      : null;
  await db.query(
    `UPDATE event_arena_lightning_participants
     SET status=$3,failure_reason=$4,updated_at=NOW()
     WHERE event_id=$1 AND installation_id=$2`,
    [eventId, userId, entered ? "entered" : allDone ? "rejected" : "queued", failureReason],
  );
  return results;
}

async function runEvent(
  db: LightningExecutionDatabase,
  event: any,
  options: ExecutionOptions,
): Promise<{ results: LightningExecutionOrderResult[]; participantCount: number }> {
  const now = options.now ?? Date.now;
  const client = db.connect ? await db.connect() : null;
  const connection: LightningExecutionDatabase = client ?? db;
  await connection.query("BEGIN");
  try {
    await connection.query("SELECT pg_advisory_xact_lock(hashtext($1))", [event.event_id]);
    const startAt = event.event_start_at instanceof Date
      ? event.event_start_at.getTime()
      : new Date(event.event_start_at).getTime();
    const endAt = event.event_end_at instanceof Date
      ? event.event_end_at.getTime()
      : new Date(event.event_end_at).getTime();
    if (!Number.isFinite(startAt) || now() < startAt) {
      await connection.query("COMMIT");
      return { results: [], participantCount: 0 };
    }
    const { rows: participants } = await connection.query(
      `SELECT event_id,installation_id,account_id,event_start_at,event_end_at
       FROM event_arena_lightning_participants
        WHERE event_id=$1
          AND (
            status='queued'
            OR (status='entered' AND (
              event_end_at <= TO_TIMESTAMP($2 / 1000.0)
              OR EXISTS (
                SELECT 1 FROM paper_orders AS pending_order
                WHERE pending_order.user_id=event_arena_lightning_participants.installation_id
                  AND pending_order.account_id=event_arena_lightning_participants.account_id
                  AND pending_order.lightning_round_event_id=event_arena_lightning_participants.event_id
                  AND pending_order.status='pending'
              )
            ))
          )
       ORDER BY installation_id FOR UPDATE`,
      [event.event_id, now()],
    );
    const allResults: LightningExecutionOrderResult[] = [];
    for (const participant of participants) {
      const copy = { ...participant, event_start_at_ms: startAt, event_end_at_ms: endAt };
      allResults.push(...await finalizeParticipant(
        connection,
        copy,
        event.event_id,
        now() >= endAt,
        options.fetchPrice,
        options.makeId ?? randomUUID,
        now,
      ));
    }
    if (now() < endAt) {
      await refreshActiveEventStandings(
        connection,
        event,
        startAt,
        endAt,
        now(),
        options.fetchPrice,
      );
    }
    if (now() >= endAt) {
      await finalizeEventStandings(
        connection,
        event,
        startAt,
        endAt,
        options.fetchPrice,
      );
    }
    await connection.query("COMMIT");
    return { results: allResults, participantCount: participants.length };
  } catch (error) {
    await connection.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client?.release();
  }
}

export async function processDueLightningRoundOrders(
  db: LightningExecutionDatabase,
  options: ExecutionOptions,
): Promise<LightningExecutionCycleResult> {
  const now = options.now ?? Date.now;
  const { rows: events } = await db.query(
    `SELECT event_id,event_start_at,event_end_at,starting_balance,ranking_direction
     FROM event_arena_events
     WHERE event_type='lightning-round' AND finalized_at IS NULL
       AND event_start_at <= TO_TIMESTAMP($1 / 1000.0)
     ORDER BY event_start_at ASC`,
    [now()],
  );
  const summary: LightningExecutionCycleResult = {
    events: events.length,
    participants: 0,
    filled: 0,
    rejected: 0,
    waiting: 0,
  };
  for (const event of events) {
    const { results, participantCount } = await runEvent(db, event, options);
    summary.participants += participantCount;
    summary.filled += results.filter((result) => result.status === "filled").length;
    summary.rejected += results.filter((result) => result.status === "rejected").length;
    summary.waiting += results.filter((result) => result.status === "waiting").length;
  }
  return summary;
}
