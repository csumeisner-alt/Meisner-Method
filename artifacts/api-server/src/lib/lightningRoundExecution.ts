import { randomUUID } from "node:crypto";
import {
  applyOrderSlippage,
  checkRisk,
  fillOrder,
} from "../../../mobile/lib/paperEngine.ts";
import type {
  PaperAccount,
  PaperLot,
  PaperOrder,
  PaperPosition,
  PaperTransaction,
} from "../../../mobile/lib/paperMath.ts";

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
    shares: Number(row.shares),
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
    ...(row.lightning_round_event_id
      ? { lightningRoundEventId: row.lightning_round_event_id }
      : {}),
  };
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
            OR (status='entered' AND EXISTS (
              SELECT 1 FROM paper_orders AS pending_order
              WHERE pending_order.user_id=event_arena_lightning_participants.installation_id
                AND pending_order.account_id=event_arena_lightning_participants.account_id
                AND pending_order.lightning_round_event_id=event_arena_lightning_participants.event_id
                AND pending_order.status='pending'
            ))
          )
       ORDER BY installation_id FOR UPDATE`,
      [event.event_id],
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
    `SELECT event_id,event_start_at,event_end_at
     FROM event_arena_events
     WHERE event_type='lightning-round'
       AND event_start_at <= TO_TIMESTAMP($1 / 1000.0)
       AND EXISTS (
         SELECT 1 FROM event_arena_lightning_participants AS participants
         WHERE participants.event_id=event_arena_events.event_id
            AND (
              participants.status='queued'
              OR (participants.status='entered' AND EXISTS (
                SELECT 1 FROM paper_orders AS pending_order
                WHERE pending_order.user_id=participants.installation_id
                  AND pending_order.account_id=participants.account_id
                  AND pending_order.lightning_round_event_id=participants.event_id
                  AND pending_order.status='pending'
              ))
            )
       )
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
