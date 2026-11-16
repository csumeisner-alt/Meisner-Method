import { createHash, randomBytes, randomUUID } from "node:crypto";
import { Router } from "express";

type QueryResult = { rows: any[] };
type PaperDatabase = {
  query(sql: string, values?: any[]): Promise<QueryResult>;
  connect?: () => Promise<{
    query(sql: string, values?: any[]): Promise<QueryResult>;
    release: () => void;
  }>;
};
type Middleware = (req: any, res: any, next: any) => void;

const PAIRING_CODE_TTL_MS = 10 * 60_000;
const MAX_HISTORY_ITEMS = 500;
const MAX_SNAPSHOT_BYTES = 2_000_000;
const EVENT_ACCOUNT_PREFIXES = ["paper-event:", "paper-lightning:"];

function isRecord(value: unknown): value is Record<string, any> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function stringValue(value: unknown, field: string, maxLength = 200): string {
  if (typeof value !== "string" || value.length === 0 || value.length > maxLength) {
    throw new Error(`${field} is invalid.`);
  }
  return value;
}

function finiteNumber(value: unknown, field: string, minimum = -Infinity): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < minimum) {
    throw new Error(`${field} is invalid.`);
  }
  return value;
}

function isoDate(value: unknown, field: string): string {
  const date = stringValue(value, field, 100);
  if (!Number.isFinite(Date.parse(date))) throw new Error(`${field} is invalid.`);
  return date;
}

function isEventAccountId(value: unknown): value is string {
  return typeof value === "string"
    && EVENT_ACCOUNT_PREFIXES.some((prefix) => value.startsWith(prefix));
}

function isValidSecret(value: unknown): value is string {
  return typeof value === "string"
    && value.length >= 32
    && value.length <= 128
    && /^[A-Za-z0-9_-]+$/.test(value);
}

function hashSecret(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function optionalNumber(value: unknown, field: string): number | null {
  return value == null ? null : finiteNumber(value, field);
}

function optionalString(value: unknown, field: string, maxLength = 200): string | null {
  return value == null ? null : stringValue(value, field, maxLength);
}

function assertUniqueIds(items: Array<{ id: string }>, label: string) {
  const ids = new Set<string>();
  for (const item of items) {
    if (ids.has(item.id)) throw new Error(`${label} contains a duplicate ID.`);
    ids.add(item.id);
  }
}

function validateSnapshot(value: unknown) {
  if (!isRecord(value)) throw new Error("The Event Arena snapshot is invalid.");
  const sourceInstallationId = stringValue(value.sourceInstallationId, "sourceInstallationId", 128);
  if (sourceInstallationId.length < 12) throw new Error("The source device ID is invalid.");

  const readArray = (key: string, max: number): any[] => {
    const array = value[key];
    if (!Array.isArray(array) || array.length > max) throw new Error(`${key} is invalid.`);
    return array;
  };
  const accountsIn = readArray("accounts", 100);
  const positionsIn = readArray("positions", 5_000);
  const transactionsIn = readArray("transactions", 20_000);
  const ordersIn = readArray("orders", 5_000);
  const lotsIn = readArray("lots", 20_000);

  const accounts = accountsIn.map((account, index) => {
    if (!isRecord(account) || !isEventAccountId(account.id)) {
      throw new Error(`accounts[${index}] is not an Event Arena account.`);
    }
    const unsettledItems = Array.isArray(account.unsettledItems)
      ? account.unsettledItems.map((item: any, itemIndex: number) => {
          if (!isRecord(item)) throw new Error(`accounts[${index}].unsettledItems[${itemIndex}] is invalid.`);
          return {
            amount: finiteNumber(item.amount, `accounts[${index}].unsettledItems[${itemIndex}].amount`),
            settlesAt: isoDate(item.settlesAt, `accounts[${index}].unsettledItems[${itemIndex}].settlesAt`),
          };
        })
      : [];
    return {
      id: account.id,
      name: stringValue(account.name, `accounts[${index}].name`, 120),
      cash: finiteNumber(account.cash, `accounts[${index}].cash`, 0),
      shortCollateral: optionalNumber(account.shortCollateral, `accounts[${index}].shortCollateral`) ?? 0,
      shortCollateralRatio: optionalNumber(account.shortCollateralRatio, `accounts[${index}].shortCollateralRatio`) ?? 1.5,
      createdAt: isoDate(account.createdAt, `accounts[${index}].createdAt`),
      unsettledItems,
      lastDividendCredit: account.lastDividendCredit == null
        ? null
        : isoDate(account.lastDividendCredit, `accounts[${index}].lastDividendCredit`),
    };
  });
  if (accounts.length === 0) throw new Error("The snapshot has no Event Arena accounts.");
  assertUniqueIds(accounts, "accounts");
  const accountIds = new Set(accounts.map((account) => account.id));
  const accountId = (item: any, field: string) => {
    const id = stringValue(item.accountId, field, 200);
    if (!accountIds.has(id)) throw new Error(`${field} does not match a snapshot account.`);
    return id;
  };

  const positions = positionsIn.map((position, index) => {
    if (!isRecord(position)) throw new Error(`positions[${index}] is invalid.`);
    return {
      id: stringValue(position.id, `positions[${index}].id`),
      accountId: accountId(position, `positions[${index}].accountId`),
      symbol: stringValue(position.symbol, `positions[${index}].symbol`, 40),
      companyName: optionalString(position.companyName, `positions[${index}].companyName`, 240) ?? "",
      shares: finiteNumber(position.shares, `positions[${index}].shares`, 0),
      avgCost: finiteNumber(position.avgCost, `positions[${index}].avgCost`, 0),
      positionType: position.positionType === "short" ? "short" : "long",
      collateralPerShare: optionalNumber(position.collateralPerShare, `positions[${index}].collateralPerShare`),
      openedAt: isoDate(position.openedAt, `positions[${index}].openedAt`),
      dividendYield: optionalNumber(position.dividendYield, `positions[${index}].dividendYield`) ?? 0,
      dividendRate: optionalNumber(position.dividendRate, `positions[${index}].dividendRate`) ?? 0,
      expenseRatio: optionalNumber(position.expenseRatio, `positions[${index}].expenseRatio`) ?? 0,
      sector: optionalString(position.sector, `positions[${index}].sector`, 120) ?? "",
    };
  });
  const transactions = transactionsIn.map((transaction, index) => {
    if (!isRecord(transaction)) throw new Error(`transactions[${index}] is invalid.`);
    const eventId = optionalString(transaction.lightningRoundEventId, `transactions[${index}].lightningRoundEventId`, 100);
    return {
      id: stringValue(transaction.id, `transactions[${index}].id`),
      accountId: accountId(transaction, `transactions[${index}].accountId`),
      symbol: stringValue(transaction.symbol, `transactions[${index}].symbol`, 40),
      companyName: optionalString(transaction.companyName, `transactions[${index}].companyName`, 240) ?? "",
      action: stringValue(transaction.action, `transactions[${index}].action`, 30),
      shares: finiteNumber(transaction.shares, `transactions[${index}].shares`, 0),
      price: finiteNumber(transaction.price, `transactions[${index}].price`, 0),
      total: finiteNumber(transaction.total, `transactions[${index}].total`, 0),
      date: isoDate(transaction.date, `transactions[${index}].date`),
      realizedPnL: optionalNumber(transaction.realizedPnL, `transactions[${index}].realizedPnL`),
      fee: optionalNumber(transaction.fee, `transactions[${index}].fee`) ?? 0,
      cashDelta: optionalNumber(transaction.cashDelta, `transactions[${index}].cashDelta`),
      shortCollateralDelta: optionalNumber(transaction.shortCollateralDelta, `transactions[${index}].shortCollateralDelta`),
      lightningRoundEventId: eventId,
    };
  });
  const orders = ordersIn.map((order, index) => {
    if (!isRecord(order)) throw new Error(`orders[${index}] is invalid.`);
    const status = stringValue(order.status, `orders[${index}].status`, 20);
    if (!["pending", "filled", "cancelled"].includes(status)) throw new Error(`orders[${index}].status is invalid.`);
    const side = stringValue(order.side, `orders[${index}].side`, 10);
    if (side !== "buy" && side !== "sell") throw new Error(`orders[${index}].side is invalid.`);
    return {
      id: stringValue(order.id, `orders[${index}].id`),
      accountId: accountId(order, `orders[${index}].accountId`),
      symbol: stringValue(order.symbol, `orders[${index}].symbol`, 40),
      companyName: optionalString(order.companyName, `orders[${index}].companyName`, 240) ?? "",
      orderType: stringValue(order.orderType, `orders[${index}].orderType`, 20),
      side,
      intent: order.intent === "short" || order.intent === "cover" ? order.intent : null,
      shortCollateralRatio: optionalNumber(order.shortCollateralRatio, `orders[${index}].shortCollateralRatio`),
      shares: finiteNumber(order.shares, `orders[${index}].shares`, 0),
      limitPrice: optionalNumber(order.limitPrice, `orders[${index}].limitPrice`),
      stopPrice: optionalNumber(order.stopPrice, `orders[${index}].stopPrice`),
      trailPct: optionalNumber(order.trailPct, `orders[${index}].trailPct`),
      trailAbs: optionalNumber(order.trailAbs, `orders[${index}].trailAbs`),
      trailRef: optionalNumber(order.trailRef, `orders[${index}].trailRef`),
      status,
      filledPrice: optionalNumber(order.filledPrice, `orders[${index}].filledPrice`),
      filledAt: order.filledAt == null ? null : isoDate(order.filledAt, `orders[${index}].filledAt`),
      placedAt: isoDate(order.placedAt, `orders[${index}].placedAt`),
      lightningRoundEventId: optionalString(order.lightningRoundEventId, `orders[${index}].lightningRoundEventId`, 100),
      rejectionReason: optionalString(order.rejectionReason, `orders[${index}].rejectionReason`, 500),
      assetType: optionalString(order.assetType, `orders[${index}].assetType`, 20),
      dividendYield: optionalNumber(order.dividendYield, `orders[${index}].dividendYield`),
      dividendRate: optionalNumber(order.dividendRate, `orders[${index}].dividendRate`),
      expenseRatio: optionalNumber(order.expenseRatio, `orders[${index}].expenseRatio`),
      sector: optionalString(order.sector, `orders[${index}].sector`, 120),
    };
  });
  const lots = lotsIn.map((lot, index) => {
    if (!isRecord(lot)) throw new Error(`lots[${index}] is invalid.`);
    return {
      id: stringValue(lot.id, `lots[${index}].id`),
      accountId: accountId(lot, `lots[${index}].accountId`),
      symbol: stringValue(lot.symbol, `lots[${index}].symbol`, 40),
      shares: finiteNumber(lot.shares, `lots[${index}].shares`, 0),
      cost: finiteNumber(lot.cost, `lots[${index}].cost`, 0),
      purchasedAt: isoDate(lot.purchasedAt, `lots[${index}].purchasedAt`),
    };
  });
  assertUniqueIds(positions, "positions");
  assertUniqueIds(transactions, "transactions");
  assertUniqueIds(orders, "orders");
  assertUniqueIds(lots, "lots");

  const challengeStore = value.challengeStore;
  if (
    !isRecord(challengeStore)
    || (challengeStore.enrollment != null && !isRecord(challengeStore.enrollment))
    || (challengeStore.lightningEnrollment != null && !isRecord(challengeStore.lightningEnrollment))
    || !Array.isArray(challengeStore.history)
    || challengeStore.history.length > MAX_HISTORY_ITEMS
  ) throw new Error("The Event Arena enrollment history is invalid.");
  const serializedChallengeStore = JSON.stringify(challengeStore);
  if (!serializedChallengeStore || serializedChallengeStore.length > MAX_SNAPSHOT_BYTES) {
    throw new Error("The Event Arena history is too large.");
  }
  const activeEnrollments = [challengeStore.enrollment, challengeStore.lightningEnrollment].filter(Boolean);
  if (activeEnrollments.some((enrollment: any) =>
    !isEventAccountId(enrollment.accountId) || !accountIds.has(enrollment.accountId),
  )) throw new Error("An enrollment does not match a snapshot account.");

  const serializedBytes = JSON.stringify(value).length;
  if (serializedBytes > MAX_SNAPSHOT_BYTES) throw new Error("The Event Arena snapshot is too large.");
  return {
    sourceInstallationId,
    accounts,
    positions,
    transactions,
    orders,
    lots,
    challengeStore,
  };
}

async function withTransaction<T>(db: PaperDatabase, run: (client: PaperDatabase) => Promise<T>): Promise<T> {
  const client = db.connect ? await db.connect() : null;
  const connection: PaperDatabase = client ?? db;
  await connection.query("BEGIN");
  try {
    const result = await run(connection);
    await connection.query("COMMIT");
    return result;
  } catch (error) {
    await connection.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client?.release();
  }
}

async function replacePaperSnapshot(db: PaperDatabase, syncId: string, snapshot: ReturnType<typeof validateSnapshot>) {
  await db.query("DELETE FROM paper_accounts WHERE user_id=$1", [syncId]);
  for (const account of snapshot.accounts) {
    await db.query(
      `INSERT INTO paper_accounts
        (id,user_id,name,cash,short_collateral,short_collateral_ratio,created_at,unsettled_items,last_dividend_credit)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9)`,
      [
        account.id, syncId, account.name, account.cash, account.shortCollateral,
        account.shortCollateralRatio, account.createdAt, JSON.stringify(account.unsettledItems),
        account.lastDividendCredit,
      ],
    );
  }
  await db.query("DELETE FROM paper_positions WHERE user_id=$1", [syncId]);
  for (const position of snapshot.positions) {
    await db.query(
      `INSERT INTO paper_positions
        (id,user_id,account_id,symbol,company_name,shares,avg_cost,position_type,collateral_per_share,
         opened_at,dividend_yield,dividend_rate,expense_ratio,sector)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
      [
        position.id, syncId, position.accountId, position.symbol, position.companyName,
        position.shares, position.avgCost, position.positionType, position.collateralPerShare,
        position.openedAt, position.dividendYield, position.dividendRate, position.expenseRatio,
        position.sector,
      ],
    );
  }
  await db.query("DELETE FROM paper_transactions WHERE user_id=$1", [syncId]);
  for (const transaction of snapshot.transactions) {
    await db.query(
      `INSERT INTO paper_transactions
        (id,user_id,account_id,symbol,company_name,action,shares,price,total,date,realized_pnl,fee,
         cash_delta,short_collateral_delta,lightning_round_event_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
      [
        transaction.id, syncId, transaction.accountId, transaction.symbol, transaction.companyName,
        transaction.action, transaction.shares, transaction.price, transaction.total, transaction.date,
        transaction.realizedPnL, transaction.fee, transaction.cashDelta,
        transaction.shortCollateralDelta, transaction.lightningRoundEventId,
      ],
    );
  }
  await db.query("DELETE FROM paper_orders WHERE user_id=$1", [syncId]);
  for (const order of snapshot.orders) {
    await db.query(
      `INSERT INTO paper_orders
        (id,user_id,account_id,symbol,company_name,order_type,side,intent,short_collateral_ratio,
         shares,limit_price,stop_price,trail_pct,trail_abs,trail_ref,status,filled_price,filled_at,
         placed_at,lightning_round_event_id,rejection_reason,asset_type,dividend_yield,dividend_rate,
         expense_ratio,sector)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26)`,
      [
        order.id, syncId, order.accountId, order.symbol, order.companyName, order.orderType,
        order.side, order.intent, order.shortCollateralRatio, order.shares, order.limitPrice,
        order.stopPrice, order.trailPct, order.trailAbs, order.trailRef, order.status,
        order.filledPrice, order.filledAt, order.placedAt, order.lightningRoundEventId,
        order.rejectionReason, order.assetType, order.dividendYield, order.dividendRate,
        order.expenseRatio, order.sector,
      ],
    );
  }
  await db.query("DELETE FROM paper_lots WHERE user_id=$1", [syncId]);
  for (const lot of snapshot.lots) {
    await db.query(
      `INSERT INTO paper_lots (id,user_id,account_id,symbol,shares,cost,purchased_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [lot.id, syncId, lot.accountId, lot.symbol, lot.shares, lot.cost, lot.purchasedAt],
    );
  }
}

async function loadPaperSnapshot(db: PaperDatabase, syncId: string, metadata: any) {
  const [accounts, positions, transactions, orders, lots] = await Promise.all([
    db.query(
      `SELECT id,name,cash,short_collateral,short_collateral_ratio,created_at,unsettled_items,last_dividend_credit
       FROM paper_accounts WHERE user_id=$1 ORDER BY created_at ASC`,
      [syncId],
    ),
    db.query(
      `SELECT id,account_id,symbol,company_name,shares,avg_cost,position_type,collateral_per_share,
              opened_at,dividend_yield,dividend_rate,expense_ratio,sector
       FROM paper_positions WHERE user_id=$1`,
      [syncId],
    ),
    db.query(
      `SELECT id,account_id,symbol,company_name,action,shares,price,total,date,realized_pnl,fee,
              cash_delta,short_collateral_delta,lightning_round_event_id
       FROM paper_transactions WHERE user_id=$1 ORDER BY date ASC`,
      [syncId],
    ),
    db.query(
      `SELECT id,account_id,symbol,company_name,order_type,side,intent,short_collateral_ratio,shares,
              limit_price,stop_price,trail_pct,trail_abs,trail_ref,status,filled_price,filled_at,placed_at,
              lightning_round_event_id,rejection_reason,asset_type,dividend_yield,dividend_rate,expense_ratio,sector
       FROM paper_orders WHERE user_id=$1 ORDER BY placed_at ASC`,
      [syncId],
    ),
    db.query(
      "SELECT id,account_id,symbol,shares,cost,purchased_at FROM paper_lots WHERE user_id=$1 ORDER BY purchased_at ASC",
      [syncId],
    ),
  ]);
  const iso = (value: any) => value instanceof Date ? value.toISOString() : value;
  return {
    revision: Number(metadata.revision),
    snapshot: {
      sourceInstallationId: metadata.source_installation_id,
      accounts: accounts.rows.map((row: any) => ({
        id: row.id, name: row.name, cash: Number(row.cash),
        shortCollateral: Number(row.short_collateral ?? 0),
        shortCollateralRatio: Number(row.short_collateral_ratio ?? 1.5),
        createdAt: iso(row.created_at),
        unsettledItems: Array.isArray(row.unsettled_items) ? row.unsettled_items : [],
        lastDividendCredit: iso(row.last_dividend_credit),
      })),
      positions: positions.rows.map((row: any) => ({
        id: row.id, accountId: row.account_id, symbol: row.symbol,
        companyName: row.company_name ?? "", shares: Number(row.shares),
        avgCost: Number(row.avg_cost), positionType: row.position_type,
        collateralPerShare: row.collateral_per_share == null ? undefined : Number(row.collateral_per_share),
        openedAt: iso(row.opened_at), dividendYield: Number(row.dividend_yield ?? 0),
        dividendRate: Number(row.dividend_rate ?? 0), expenseRatio: Number(row.expense_ratio ?? 0),
        sector: row.sector ?? "",
      })),
      transactions: transactions.rows.map((row: any) => ({
        id: row.id, accountId: row.account_id, symbol: row.symbol,
        companyName: row.company_name ?? "", action: row.action, shares: Number(row.shares),
        price: Number(row.price), total: Number(row.total), date: iso(row.date),
        realizedPnL: row.realized_pnl == null ? undefined : Number(row.realized_pnl),
        fee: Number(row.fee ?? 0), cashDelta: row.cash_delta == null ? undefined : Number(row.cash_delta),
        shortCollateralDelta: row.short_collateral_delta == null ? undefined : Number(row.short_collateral_delta),
        lightningRoundEventId: row.lightning_round_event_id ?? undefined,
      })),
      orders: orders.rows.map((row: any) => ({
        id: row.id, accountId: row.account_id, symbol: row.symbol,
        companyName: row.company_name ?? "", orderType: row.order_type, side: row.side,
        ...(row.intent ? { intent: row.intent } : {}),
        shortCollateralRatio: row.short_collateral_ratio == null ? undefined : Number(row.short_collateral_ratio),
        shares: Number(row.shares), limitPrice: row.limit_price == null ? undefined : Number(row.limit_price),
        stopPrice: row.stop_price == null ? undefined : Number(row.stop_price),
        trailPct: row.trail_pct == null ? undefined : Number(row.trail_pct),
        trailAbs: row.trail_abs == null ? undefined : Number(row.trail_abs),
        trailRef: row.trail_ref == null ? undefined : Number(row.trail_ref),
        status: row.status, filledPrice: row.filled_price == null ? undefined : Number(row.filled_price),
        filledAt: row.filled_at == null ? undefined : iso(row.filled_at), placedAt: iso(row.placed_at),
        lightningRoundEventId: row.lightning_round_event_id ?? undefined,
        rejectionReason: row.rejection_reason ?? undefined, assetType: row.asset_type ?? undefined,
        dividendYield: row.dividend_yield == null ? undefined : Number(row.dividend_yield),
        dividendRate: row.dividend_rate == null ? undefined : Number(row.dividend_rate),
        expenseRatio: row.expense_ratio == null ? undefined : Number(row.expense_ratio),
        sector: row.sector ?? undefined,
      })),
      lots: lots.rows.map((row: any) => ({
        id: row.id, accountId: row.account_id, symbol: row.symbol, shares: Number(row.shares),
        cost: Number(row.cost), purchasedAt: iso(row.purchased_at),
      })),
      challengeStore: metadata.challenge_store ?? { enrollment: null, lightningEnrollment: null, history: [] },
    },
  };
}

export function createPaperRouter(db: PaperDatabase, requireSchema: Middleware) {
  const router = Router();

  router.post("/event-arena/device-pairing", requireSchema, async (req: any, res: any) => {
    const token = req.get("x-event-arena-device-token");
    if (!isValidSecret(token)) {
      res.status(400).json({ error: "A valid device token is required." });
      return;
    }
    let snapshot: ReturnType<typeof validateSnapshot>;
    try {
      snapshot = validateSnapshot(req.body?.snapshot);
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : "The snapshot is invalid." });
      return;
    }
    const tokenHash = hashSecret(token);
    const baseRevisionHeader = req.get("x-event-arena-revision");
    const code = randomBytes(24).toString("base64url");
    const codeHash = hashSecret(code);
    const expiresAt = new Date(Date.now() + PAIRING_CODE_TTL_MS);
    try {
      let revision = 1;
      await withTransaction(db, async (client) => {
        await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [tokenHash]);
        const existing = await client.query(
          "SELECT sync_id FROM event_arena_device_sync_tokens WHERE token_hash=$1 FOR UPDATE",
          [tokenHash],
        );
        let syncId = existing.rows[0]?.sync_id as string | undefined;
        if (!syncId) {
          syncId = randomUUID();
          await client.query(
            `INSERT INTO event_arena_device_sync (sync_id,source_installation_id,revision,challenge_store)
             VALUES ($1,$2,0,$3::jsonb)`,
            [syncId, snapshot.sourceInstallationId, JSON.stringify(snapshot.challengeStore)],
          );
          await client.query(
            "INSERT INTO event_arena_device_sync_tokens (token_hash,sync_id) VALUES ($1,$2)",
            [tokenHash, syncId],
          );
        }
        const metadata = await client.query(
          "SELECT source_installation_id,revision FROM event_arena_device_sync WHERE sync_id=$1 FOR UPDATE",
          [syncId],
        );
        const row = metadata.rows[0];
        if (!row || row.source_installation_id !== snapshot.sourceInstallationId) {
          throw new Error("This device token belongs to another Event Arena account.");
        }
        const currentRevision = Number(row.revision);
        if (existing.rows[0] && Number(baseRevisionHeader) !== currentRevision) {
          throw Object.assign(new Error("The Event Arena account changed on another device."), { status: 409 });
        }
        await replacePaperSnapshot(client, syncId, snapshot);
        revision = currentRevision + 1;
        await client.query(
          `UPDATE event_arena_device_sync
           SET revision=$2,challenge_store=$3::jsonb,updated_at=NOW() WHERE sync_id=$1`,
          [syncId, revision, JSON.stringify(snapshot.challengeStore)],
        );
        await client.query(
          "DELETE FROM event_arena_device_pairing_codes WHERE expires_at < NOW() - INTERVAL '1 day'",
        );
        await client.query(
          "INSERT INTO event_arena_device_pairing_codes (code_hash,sync_id,expires_at) VALUES ($1,$2,$3)",
          [codeHash, syncId, expiresAt.toISOString()],
        );
      });
      res.json({ code, expiresAt: expiresAt.toISOString(), revision });
    } catch (error: any) {
      res.status(error?.status === 409 ? 409 : 500).json({
        error: error?.message === "The Event Arena account changed on another device."
          ? error.message
          : "Could not prepare the Event Arena transfer code.",
      });
    }
  });

  router.post("/event-arena/device-pairing/redeem", requireSchema, async (req: any, res: any) => {
    const code = req.body?.code;
    const token = req.body?.deviceToken;
    if (typeof code !== "string" || code.length < 32 || code.length > 64 || !isValidSecret(token)) {
      res.status(400).json({ error: "The transfer code or device token is invalid." });
      return;
    }
    const codeHash = hashSecret(code);
    const tokenHash = hashSecret(token);
    try {
      const restored = await withTransaction(db, async (client) => {
        const result = await client.query(
          `SELECT sync_id,expires_at,consumed_at,redeemed_token_hash
           FROM event_arena_device_pairing_codes WHERE code_hash=$1 FOR UPDATE`,
          [codeHash],
        );
        const pairing = result.rows[0];
        if (!pairing) throw Object.assign(new Error("Transfer code not found."), { status: 404 });
        if (pairing.consumed_at) {
          if (pairing.redeemed_token_hash !== tokenHash) {
            throw Object.assign(new Error("Transfer code has already been used."), { status: 409 });
          }
        } else {
          const expiresAtMs = pairing.expires_at instanceof Date
            ? pairing.expires_at.getTime()
            : Date.parse(pairing.expires_at);
          if (!Number.isFinite(expiresAtMs) || expiresAtMs < Date.now()) {
            throw Object.assign(new Error("Transfer code expired."), { status: 410 });
          }
          const existingToken = await client.query(
            "SELECT sync_id FROM event_arena_device_sync_tokens WHERE token_hash=$1 FOR UPDATE",
            [tokenHash],
          );
          if (existingToken.rows[0] && existingToken.rows[0].sync_id !== pairing.sync_id) {
            throw Object.assign(new Error("This device is already paired with another Event Arena account."), { status: 409 });
          }
          if (!existingToken.rows[0]) {
            await client.query(
              "INSERT INTO event_arena_device_sync_tokens (token_hash,sync_id) VALUES ($1,$2)",
              [tokenHash, pairing.sync_id],
            );
          }
          await client.query(
            "UPDATE event_arena_device_pairing_codes SET consumed_at=NOW(),redeemed_token_hash=$2 WHERE code_hash=$1",
            [codeHash, tokenHash],
          );
        }
        const metadata = await client.query(
          "SELECT source_installation_id,revision,challenge_store FROM event_arena_device_sync WHERE sync_id=$1",
          [pairing.sync_id],
        );
        if (!metadata.rows[0]) throw new Error("The shared Event Arena account is missing.");
        return await loadPaperSnapshot(client, pairing.sync_id, metadata.rows[0]);
      });
      res.json(restored);
    } catch (error: any) {
      const status = [404, 409, 410].includes(error?.status) ? error.status : 500;
      res.status(status).json({
        error: status === 404 ? "Transfer code not found."
          : status === 409 ? "Transfer code cannot be used on this device."
            : status === 410 ? "Transfer code expired."
              : "Could not restore the Event Arena account.",
      });
    }
  });

  router.get("/event-arena/device-sync", requireSchema, async (req: any, res: any) => {
    const token = req.get("x-event-arena-device-token");
    if (!isValidSecret(token)) {
      res.status(401).json({ error: "This device is not paired with an Event Arena account." });
      return;
    }
    try {
      const { rows: tokens } = await db.query(
        "SELECT sync_id FROM event_arena_device_sync_tokens WHERE token_hash=$1",
        [hashSecret(token)],
      );
      if (!tokens[0]) {
        res.status(401).json({ error: "This device is not paired with an Event Arena account." });
        return;
      }
      const { rows: metadata } = await db.query(
        "SELECT source_installation_id,revision,challenge_store FROM event_arena_device_sync WHERE sync_id=$1",
        [tokens[0].sync_id],
      );
      if (!metadata[0]) {
        res.status(404).json({ error: "The shared Event Arena account is unavailable." });
        return;
      }
      res.json(await loadPaperSnapshot(db, tokens[0].sync_id, metadata[0]));
    } catch {
      res.status(500).json({ error: "Could not load the shared Event Arena account." });
    }
  });

  router.put("/event-arena/device-sync", requireSchema, async (req: any, res: any) => {
    const token = req.get("x-event-arena-device-token");
    const expectedRevision = Number(req.get("x-event-arena-revision"));
    if (!isValidSecret(token)) {
      res.status(401).json({ error: "This device is not paired with an Event Arena account." });
      return;
    }
    if (!Number.isInteger(expectedRevision) || expectedRevision < 1) {
      res.status(400).json({ error: "The Event Arena sync revision is invalid." });
      return;
    }
    let snapshot: ReturnType<typeof validateSnapshot>;
    try {
      snapshot = validateSnapshot(req.body?.snapshot);
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : "The snapshot is invalid." });
      return;
    }
    try {
      const nextRevision = await withTransaction(db, async (client) => {
        const { rows: tokens } = await client.query(
          "SELECT sync_id FROM event_arena_device_sync_tokens WHERE token_hash=$1 FOR UPDATE",
          [hashSecret(token)],
        );
        if (!tokens[0]) throw Object.assign(new Error("Device token is invalid."), { status: 401 });
        const syncId = tokens[0].sync_id;
        const { rows } = await client.query(
          "SELECT source_installation_id,revision FROM event_arena_device_sync WHERE sync_id=$1 FOR UPDATE",
          [syncId],
        );
        const metadata = rows[0];
        if (!metadata) throw Object.assign(new Error("Shared account is missing."), { status: 404 });
        if (Number(metadata.revision) !== expectedRevision) {
          throw Object.assign(new Error("The Event Arena account changed on another device."), { status: 409 });
        }
        if (metadata.source_installation_id !== snapshot.sourceInstallationId) {
          throw Object.assign(new Error("The snapshot belongs to another source device."), { status: 400 });
        }
        await replacePaperSnapshot(client, syncId, snapshot);
        const revision = expectedRevision + 1;
        await client.query(
          `UPDATE event_arena_device_sync
           SET revision=$2,challenge_store=$3::jsonb,updated_at=NOW() WHERE sync_id=$1`,
          [syncId, revision, JSON.stringify(snapshot.challengeStore)],
        );
        return revision;
      });
      res.json({ revision: nextRevision });
    } catch (error: any) {
      const status = [400, 401, 404, 409].includes(error?.status) ? error.status : 500;
      res.status(status).json({
        error: status === 409 ? "The Event Arena account changed on another device."
          : status === 401 ? "This device is not paired with an Event Arena account."
            : status === 400 ? "The Event Arena snapshot is invalid."
              : "Could not sync the shared Event Arena account.",
      });
    }
  });

  return router;
}
