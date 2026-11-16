import assert from "node:assert/strict";
import test from "node:test";
import {
  processDueLightningRoundOrders,
  type LightningExecutionDatabase,
} from "./lightningRoundExecution.ts";

const eventId = "lr-2026-11-15";
const accountId = "paper-event:shared";
const installationId = "installation-test";
const startAt = Date.parse("2026-11-15T16:00:00.000Z");
const endAt = startAt + 24 * 60 * 60 * 1000;

type MemoryState = {
  events: any[];
  participants: any[];
  accounts: any[];
  orders: any[];
  positions: any[];
  lots: any[];
  transactions: any[];
};

function seedState(orders: any[] = []): MemoryState {
  return {
    events: [{
      event_id: eventId,
      event_start_at: new Date(startAt),
      event_end_at: new Date(endAt),
      event_type: "lightning-round",
    }],
    participants: [{
      event_id: eventId,
      installation_id: installationId,
      account_id: accountId,
      status: "queued",
      event_start_at: new Date(startAt),
      event_end_at: new Date(endAt),
    }],
    accounts: [{
      id: accountId,
      user_id: installationId,
      name: "Shared Event Arena",
      cash: 100_000,
      short_collateral: 0,
      short_collateral_ratio: 1.5,
      unsettled_items: [],
      created_at: new Date(startAt - 1000),
    }],
    orders: orders.map((order, index) => ({
      id: `order-${index + 1}`,
      user_id: installationId,
      account_id: accountId,
      lightning_round_event_id: eventId,
      symbol: "AAPL",
      company_name: "Apple",
      order_type: "market",
      side: "buy",
      shares: 2,
      status: "pending",
      placed_at: new Date(startAt - 60_000 + index),
      ...order,
    })),
    positions: [{
      id: "existing-position",
      user_id: installationId,
      account_id: accountId,
      symbol: "MSFT",
      company_name: "Microsoft",
      shares: 4,
      position_type: "long",
      avg_cost: 200,
      opened_at: new Date(startAt - 10_000),
      dividend_yield: 0,
      dividend_rate: 0,
      expense_ratio: 0,
      sector: "Technology",
    }],
    lots: [{
      id: "existing-lot",
      user_id: installationId,
      account_id: accountId,
      symbol: "MSFT",
      shares: 4,
      cost: 200,
      purchased_at: new Date(startAt - 10_000),
    }],
    transactions: [{
      id: "unrelated-transaction",
      user_id: installationId,
      account_id: accountId,
      symbol: "MSFT",
      action: "BUY",
      shares: 4,
      price: 200,
      total: 800,
      date: new Date(startAt - 10_000),
      lightning_round_event_id: null,
    }],
  };
}

class MemoryDatabase implements LightningExecutionDatabase {
  private lockTail: Promise<void> = Promise.resolve();
  readonly state: MemoryState;

  constructor(state: MemoryState) {
    this.state = state;
  }

  async query(sql: string, values: any[] = []) {
    return this.execute(sql, values);
  }

  async connect() {
    let releaseLock: (() => void) | undefined;
    return {
      query: async (sql: string, values: any[] = []) => {
        if (sql.includes("pg_advisory_xact_lock")) {
          const previous = this.lockTail;
          this.lockTail = new Promise<void>((resolve) => { releaseLock = resolve; });
          await previous;
          return { rows: [] };
        }
        if (sql === "COMMIT" || sql === "ROLLBACK") releaseLock?.();
        return this.execute(sql, values);
      },
      release: () => {},
    };
  }

  private async execute(sql: string, values: any[]) {
    const { state } = this;
    if (["BEGIN", "COMMIT", "ROLLBACK"].includes(sql)) return { rows: [] };
    if (sql.includes("FROM event_arena_events")) {
      const now = Number(values[0]);
      return {
        rows: state.events.filter((event) =>
          event.event_type === "lightning-round"
          && event.event_start_at.getTime() <= now
          && state.participants.some((participant) =>
            participant.event_id === event.event_id
            && (participant.status === "queued"
              || (participant.status === "entered" && state.orders.some((order) =>
                order.user_id === participant.installation_id
                && order.account_id === participant.account_id
                && order.lightning_round_event_id === event.event_id
                && order.status === "pending",
              ))),
          ),
        ),
      };
    }
    if (sql.includes("FROM event_arena_lightning_participants")
      && sql.includes("ORDER BY installation_id FOR UPDATE")) {
      return {
        rows: state.participants.filter((participant) =>
          participant.event_id === values[0]
          && (participant.status === "queued"
            || (participant.status === "entered" && state.orders.some((order) =>
              order.user_id === participant.installation_id
              && order.account_id === participant.account_id
              && order.lightning_round_event_id === participant.event_id
              && order.status === "pending",
            ))),
        ),
      };
    }
    if (sql.includes("FROM paper_accounts")) {
      return {
        rows: state.accounts.filter((account) =>
          account.id === values[0] && account.user_id === values[1],
        ),
      };
    }
    if (sql.includes("FROM paper_orders")
      && sql.includes("status='pending'")
      && !sql.includes("COUNT(*) FILTER")) {
      return {
        rows: state.orders.filter((order) =>
          order.user_id === values[0]
          && order.account_id === values[1]
          && order.lightning_round_event_id === values[2]
          && order.status === "pending",
        ),
      };
    }
    if (sql.includes("FROM paper_positions")) {
      return {
        rows: state.positions.filter((position) =>
          position.user_id === values[0] && position.account_id === values[1],
        ),
      };
    }
    if (sql.includes("FROM paper_lots")) {
      return {
        rows: state.lots.filter((lot) => lot.user_id === values[0] && lot.account_id === values[1]),
      };
    }
    if (sql.includes("COUNT(*) FILTER")) {
      const orders = state.orders.filter((order) =>
        order.user_id === values[0]
        && order.account_id === values[1]
        && order.lightning_round_event_id === values[2],
      );
      return {
        rows: [{
          filled_count: orders.filter((order) => order.status === "filled").length,
          pending_count: orders.filter((order) => order.status === "pending").length,
          reasons: orders.filter((order) => order.status === "cancelled" && order.rejection_reason)
            .map((order) => order.rejection_reason),
        }],
      };
    }
    if (sql.startsWith("UPDATE paper_accounts")) {
      const account = state.accounts.find((row) => row.id === values[0] && row.user_id === values[1]);
      if (account) account.cash = Number(values[2]);
      return { rows: [] };
    }
    if (sql.startsWith("DELETE FROM paper_positions")) {
      state.positions = state.positions.filter((row) => row.user_id !== values[0] || row.account_id !== values[1]);
      return { rows: [] };
    }
    if (sql.startsWith("DELETE FROM paper_lots")) {
      state.lots = state.lots.filter((row) => row.user_id !== values[0] || row.account_id !== values[1]);
      return { rows: [] };
    }
    if (sql.startsWith("INSERT INTO paper_positions")) {
      state.positions.push({
        id: values[0], user_id: values[1], account_id: values[2], symbol: values[3],
        company_name: values[4], shares: values[5], avg_cost: values[6], position_type: values[7],
        collateral_per_share: values[8], opened_at: values[9], dividend_yield: values[10],
        dividend_rate: values[11], expense_ratio: values[12], sector: values[13],
      });
      return { rows: [] };
    }
    if (sql.startsWith("INSERT INTO paper_lots")) {
      state.lots.push({
        id: values[0], user_id: values[1], account_id: values[2], symbol: values[3],
        shares: values[4], cost: values[5], purchased_at: values[6],
      });
      return { rows: [] };
    }
    if (sql.startsWith("INSERT INTO paper_transactions")) {
      state.transactions.push({
        id: values[0], user_id: values[1], account_id: values[2], symbol: values[3],
        company_name: values[4], action: values[5], shares: values[6], price: values[7],
        total: values[8], date: values[9], fee: values[10], realized_pnl: values[11],
        cash_delta: values[12], short_collateral_delta: values[13],
        lightning_round_event_id: values[14],
      });
      return { rows: [] };
    }
    if (sql.startsWith("UPDATE paper_orders")) {
      const order = state.orders.find((row) =>
        row.id === values[0] && row.user_id === values[1] && row.account_id === values[2],
      );
      if (!order || order.status !== "pending") return { rows: [] };
      if (sql.includes("SET status='filled'")) {
        Object.assign(order, { status: "filled", filled_price: values[3], filled_at: values[4] });
      } else if (sql.includes("SET status='cancelled'")) {
        Object.assign(order, { status: "cancelled", rejection_reason: values[3] });
      } else {
        order.rejection_reason = values[3];
      }
      return { rows: [] };
    }
    if (sql.startsWith("UPDATE event_arena_lightning_participants")) {
      const participant = state.participants.find((row) =>
        row.event_id === values[0] && row.installation_id === values[1],
      );
      if (participant) Object.assign(participant, { status: values[2], failure_reason: values[3] });
      return { rows: [] };
    }
    throw new Error(`Unexpected test SQL: ${sql}`);
  }
}

const fixedNow = () => startAt + 5_000;
const fixedId = (() => {
  let id = 0;
  return () => `generated-${++id}`;
})();

function process(db: MemoryDatabase, fetchPrice: (symbol: string) => Promise<number | null>, now = fixedNow) {
  return processDueLightningRoundOrders(db, { fetchPrice, now, makeId: fixedId });
}

test("Lightning Round worker cannot execute before the official start", async () => {
  const state = seedState([{}]);
  const db = new MemoryDatabase(state);
  let quoteCalls = 0;
  const result = await process(db, async () => { quoteCalls += 1; return 150; }, () => startAt - 1);
  assert.equal(result.events, 0);
  assert.equal(quoteCalls, 0);
  assert.equal(state.orders[0].status, "pending");
  assert.equal(state.accounts[0].cash, 100_000);
  assert.equal(state.transactions.length, 1);
});

test("successful fills update the shared account and retain event identity, then retry idempotently", async () => {
  const state = seedState([{}]);
  const db = new MemoryDatabase(state);
  const first = await process(db, async () => 150);
  assert.equal(first.filled, 1);
  assert.equal(first.participants, 1);
  assert.equal(state.orders[0].status, "filled");
  assert.equal(state.orders[0].filled_price, state.transactions[1].price);
  assert.equal(state.orders[0].filled_at, state.transactions[1].date);
  assert.equal(state.transactions[1].lightning_round_event_id, eventId);
  assert.equal(state.transactions[1].shares, 2);
  assert.equal(state.participants[0].status, "entered");
  assert.ok(state.accounts[0].cash < 100_000);
  assert.equal(state.positions.find((position) => position.symbol === "AAPL")?.shares, 2);
  assert.equal(state.positions.find((position) => position.symbol === "MSFT")?.shares, 4);
  assert.equal(state.lots.filter((lot) => lot.symbol === "AAPL").length, 1);

  const second = await process(db, async () => 150);
  assert.equal(second.filled, 0);
  assert.equal(state.transactions.length, 2);
  assert.equal(state.accounts[0].cash, 100_000 - Number(state.transactions[1].total));
  assert.equal(state.positions.filter((position) => position.symbol === "AAPL").length, 1);
});

test("unavailable quote leaves an order retryable and a later valid quote fills it", async () => {
  const state = seedState([{}]);
  const db = new MemoryDatabase(state);
  const waiting = await process(db, async () => null);
  assert.equal(waiting.waiting, 1);
  assert.equal(state.orders[0].status, "pending");
  assert.match(state.orders[0].rejection_reason, /No valid market price/);
  assert.equal(state.accounts[0].cash, 100_000);
  assert.equal(state.participants[0].status, "queued");

  const recovered = await process(db, async () => 125);
  assert.equal(recovered.filled, 1);
  assert.equal(state.participants[0].status, "entered");
});

test("only successful opening fills enter; invalid and unaffordable orders preserve reasons", async () => {
  const state = seedState([
    { symbol: "INVALID TICKER" },
    { shares: 1_000_000 },
    { symbol: "AAPL", shares: 2 },
  ]);
  const db = new MemoryDatabase(state);
  const result = await process(db, async () => 150);
  assert.equal(result.filled, 1);
  assert.equal(result.rejected, 2);
  assert.equal(state.participants[0].status, "entered");
  assert.equal(state.orders[0].status, "cancelled");
  assert.match(state.orders[0].rejection_reason, /ticker is invalid/);
  assert.equal(state.orders[1].status, "cancelled");
  assert.match(state.orders[1].rejection_reason, /buying power/i);

  const failedState = seedState([{ symbol: "INVALID TICKER" }]);
  const failedDb = new MemoryDatabase(failedState);
  const failed = await process(failedDb, async () => 150);
  assert.equal(failed.filled, 0);
  assert.equal(failedState.participants[0].status, "rejected");
  assert.match(failedState.participants[0].failure_reason, /ticker is invalid/);
  assert.equal(failedState.accounts[0].cash, 100_000);
  assert.equal(failedState.transactions.length, 1);
});

test("concurrent worker runs serialize by event and create one fill", async () => {
  const state = seedState([{}]);
  const db = new MemoryDatabase(state);
  const [first, second] = await Promise.all([
    process(db, async () => 150),
    process(db, async () => 150),
  ]);
  assert.equal(first.filled + second.filled, 1);
  assert.equal(state.transactions.length, 2);
  assert.equal(state.orders[0].status, "filled");
  assert.equal(state.participants[0].status, "entered");
});

test("Lightning Round scoring is derived only from event-tagged transactions", async () => {
  const { calculateLightningRoundScore } = await import("./lightningRoundScore.ts");
  const score = calculateLightningRoundScore(
    [
      { symbol: "AAPL", action: "BUY", shares: 2, price: 100, total: 200 },
    ],
    { AAPL: 110 },
    1_000,
  );
  assert.ok(score);
  assert.equal(score.equity, 1_020);
  assert.equal(score.tradeCount, 1);
  assert.deepEqual(score.holdings.map((position) => position.symbol), ["AAPL"]);
  assert.equal(
    calculateLightningRoundScore(
      [{ symbol: "AAPL", action: "BUY", shares: 2, price: 100, total: 200 }],
      {},
      1_000,
    ),
    null,
  );
});

test("database interface remains compatible with a standalone worker connection", async () => {
  const state = seedState([{}]);
  const db = new MemoryDatabase(state);
  assert.equal(typeof (db as LightningExecutionDatabase).connect, "function");
  assert.equal((await process(db, async () => 150)).filled, 1);
});
