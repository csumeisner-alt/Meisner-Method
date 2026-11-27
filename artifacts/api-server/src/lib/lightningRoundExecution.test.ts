import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { once } from "node:events";
import { env } from "node:process";
import test from "node:test";
import express from "express";
import pg from "pg";
import {
  createEventArenaRouter,
  expectedEventArenaConfiguration,
  getLightningRoundScheduleIds,
} from "../routes/eventArenaRoutes.ts";
import {
  executeLightningRoundOrder,
  processDueLightningRoundOrders,
  type LightningExecutionDatabase,
} from "./lightningRoundExecution.ts";

const { Pool } = pg;
const databaseUrl = env["TEST_DATABASE_URL"] ?? env["DATABASE_URL"];
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
  leaderboardEntries: any[];
  snapshots: any[];
};

function seedState(orders: any[] = []): MemoryState {
  return {
    events: [{
      event_id: eventId,
      event_start_at: new Date(startAt),
      event_end_at: new Date(endAt),
      event_type: "lightning-round",
      starting_balance: 100_000,
      ranking_direction: "highest-return",
      finalized_at: null,
    }],
    participants: [{
      event_id: eventId,
      installation_id: installationId,
      account_id: accountId,
      alias: "MarketFox",
      status: "queued",
      leaderboard_opted_in: true,
      final_result: null,
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
    leaderboardEntries: [],
    snapshots: [],
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
          && event.finalized_at == null
          && event.event_start_at.getTime() <= now,
        ),
      };
    }
    if (sql.includes("SELECT event_id,installation_id,account_id,alias,status,leaderboard_opted_in")
      && !sql.includes("final_result")) {
      const filtersOptedOut = sql.includes("leaderboard_opted_in=TRUE");
      return {
        rows: state.participants.filter((participant) =>
          participant.event_id === values[0]
          && participant.status === "entered"
          && (!filtersOptedOut || participant.leaderboard_opted_in !== false),
        ),
      };
    }
    if (sql.includes("SELECT event_id,installation_id,account_id,alias,status,leaderboard_opted_in,final_result")) {
      return {
        rows: state.participants.filter((participant) =>
          participant.event_id === values[0] && participant.status === "entered",
        ),
      };
    }
    if (sql.includes("FROM event_arena_lightning_participants")
      && sql.includes("ORDER BY installation_id FOR UPDATE")) {
      return {
        rows: state.participants.filter((participant) =>
          participant.event_id === values[0]
          && (participant.status === "queued"
            || (participant.status === "entered" && (
              participant.event_end_at.getTime() <= Number(values[1])
              || state.orders.some((order) =>
                order.user_id === participant.installation_id
                && order.account_id === participant.account_id
                && order.lightning_round_event_id === participant.event_id
                && order.status === "pending",
              )
            ))),
        ),
      };
    }
    if (
      sql.includes("FROM event_arena_lightning_participants")
      && sql.includes("WHERE event_id=$1 AND installation_id=$2 FOR UPDATE")
    ) {
      return {
        rows: state.participants.filter((participant) =>
          participant.event_id === values[0] && participant.installation_id === values[1],
        ),
      };
    }
    if (sql.includes("FROM paper_orders") && sql.includes("WHERE id=$1 AND user_id=$2 FOR UPDATE")) {
      return {
        rows: state.orders.filter((order) =>
          order.id === values[0] && order.user_id === values[1],
        ),
      };
    }
    if (sql.includes("FROM paper_transactions") && sql.includes("WHERE id=$1 AND user_id=$2")) {
      return {
        rows: state.transactions.filter((transaction) =>
          transaction.id === values[0]
          && transaction.user_id === values[1]
          && transaction.account_id === values[2]
          && transaction.lightning_round_event_id === values[3],
        ),
      };
    }
    if (sql.includes("FROM paper_transactions")
      && sql.includes("lightning_round_event_id=$3")) {
      return {
        rows: state.transactions.filter((transaction) =>
          transaction.user_id === values[0]
          && transaction.account_id === values[1]
          && transaction.lightning_round_event_id === values[2]
          && new Date(transaction.date).getTime() >= Number(values[3])
          && new Date(transaction.date).getTime() <= Number(values[4]),
        ),
      };
    }
    if (sql.startsWith("UPDATE event_arena_lightning_participants")
      && sql.includes("SET final_result=$3::jsonb,updated_at=NOW()")) {
      const participant = state.participants.find((row) =>
        row.event_id === values[0] && row.installation_id === values[1],
      );
      if (participant) {
        participant.final_result = JSON.parse(values[2]);
        return { rows: [{ final_result: participant.final_result }] };
      }
      return { rows: [] };
    }
    if (sql.startsWith("INSERT INTO event_arena_leaderboard_entries")
      && sql.includes("TO_TIMESTAMP($11 / 1000.0)")) {
      const [eventId, installation, alias, startEquity, equity, returnPercent, tradeCount,
        holdings, eventStart, eventEnd, updatedAt, cashBalance] = values;
      let entry = state.leaderboardEntries.find((row) =>
        row.event_id === eventId && row.installation_id === installation,
      );
      if (!entry) {
        entry = {
          event_id: eventId,
          installation_id: installation,
          participant_token: `token-${installation}`,
          is_active: true,
        };
        state.leaderboardEntries.push(entry);
      }
      Object.assign(entry, {
        alias,
        start_equity: startEquity,
        equity,
        return_percent: returnPercent,
        trade_count: tradeCount,
        holdings: JSON.parse(holdings),
        event_start_at: new Date(Number(eventStart)),
        event_end_at: new Date(Number(eventEnd)),
        updated_at: new Date(Number(updatedAt)),
        cash_balance: cashBalance,
        is_active: true,
      });
      return { rows: [] };
    }
    if (sql.startsWith("INSERT INTO event_arena_leaderboard_entries")) {
      let entry = state.leaderboardEntries.find((row) =>
        row.event_id === values[0] && row.installation_id === values[1],
      );
      if (!entry) {
        entry = {
          event_id: values[0],
          installation_id: values[1],
          participant_token: `token-${values[1]}`,
          alias: values[2],
          start_equity: values[3],
          equity: values[4],
          return_percent: values[5],
          trade_count: values[6],
          holdings: JSON.parse(values[7]),
          event_start_at: new Date(Number(values[8])),
          event_end_at: new Date(Number(values[9])),
          updated_at: new Date(Number(values[9])),
          cash_balance: values[10],
          is_active: true,
        };
        state.leaderboardEntries.push(entry);
      } else {
        Object.assign(entry, {
          alias: values[2],
          start_equity: values[3],
          equity: values[4],
          return_percent: values[5],
          trade_count: values[6],
          holdings: JSON.parse(values[7]),
          updated_at: new Date(Number(values[9])),
          cash_balance: values[10],
        });
      }
      return { rows: [] };
    }
    if (sql.includes("SELECT installation_id,participant_token,rank,return_percent")) {
      const rows = state.leaderboardEntries
        .filter((entry) => {
          if (entry.event_id !== values[0] || !entry.is_active) return false;
          const participant = state.participants.find((row) =>
            row.event_id === entry.event_id && row.installation_id === entry.installation_id,
          );
          return participant?.status === "entered"
            && (!sql.includes("participant.leaderboard_opted_in=TRUE")
              || participant.leaderboard_opted_in !== false);
        })
        .sort((a, b) =>
          Number(b.return_percent) - Number(a.return_percent)
          || String(a.installation_id).localeCompare(String(b.installation_id)),
        );
      return {
        rows: rows.map((entry, index) => ({
          installation_id: entry.installation_id,
          participant_token: entry.participant_token,
          rank: index + 1,
          return_percent: entry.return_percent,
        })),
      };
    }
    if (sql.startsWith("INSERT INTO event_arena_leaderboard_snapshots")) {
      if (sql.includes("FALSE")) {
        const [event, tokens, ranks, returns, start, end, capturedAt, minInterval] = values;
        for (let index = 0; index < tokens.length; index += 1) {
          const previous = state.snapshots
            .filter((row) => row.event_id === event
              && row.participant_token === tokens[index]
              && row.is_final === false)
            .sort((a, b) => b.captured_at.getTime() - a.captured_at.getTime())[0];
          const rank = Number(ranks[index]);
          const returnPercent = Number(returns[index]);
          const timestamp = Number(capturedAt);
          const changed = !previous
            || previous.rank !== rank
            || previous.return_percent !== returnPercent;
          if (previous && (!changed
            || timestamp - previous.captured_at.getTime() < Number(minInterval))) continue;
          state.snapshots.push({
            event_id: event,
            participant_token: tokens[index],
            rank,
            return_percent: returnPercent,
            event_start_at: new Date(Number(start)),
            event_end_at: new Date(Number(end)),
            captured_at: new Date(timestamp),
            is_final: false,
          });
        }
        return { rows: [] };
      }
      const [event, tokens, ranks, start, end, returns] = values;
      for (let index = 0; index < tokens.length; index += 1) {
        if (state.snapshots.some((row) => row.event_id === event
          && row.participant_token === tokens[index]
          && row.is_final === true)) continue;
        state.snapshots.push({
          event_id: event,
          participant_token: tokens[index],
          rank: ranks[index],
          return_percent: returns[index],
          event_start_at: new Date(Number(start)),
          event_end_at: new Date(Number(end)),
          captured_at: new Date(Number(end)),
          is_final: true,
        });
      }
      return { rows: [] };
    }
    if (sql.startsWith("UPDATE event_arena_lightning_participants")
      && sql.includes("SET final_result=$3::jsonb")) {
      const participant = state.participants.find((row) =>
        row.event_id === values[0] && row.installation_id === values[1],
      );
      if (participant) participant.final_result = JSON.parse(values[2]);
      return { rows: [] };
    }
    if (sql.startsWith("UPDATE event_arena_events SET finalized_at")) {
      const event = state.events.find((row) => row.event_id === values[0]);
      if (event && event.finalized_at == null) event.finalized_at = new Date(Number(values[1]));
      return { rows: [] };
    }
    if (sql.includes("FROM paper_accounts")) {
      return {
        rows: state.accounts.filter((account) =>
          account.id === values[0] && account.user_id === values[1],
        ),
      };
    }
    if (sql.includes("FROM paper_orders")
      && sql.includes("WHERE user_id=$1 AND account_id=$2 AND status='pending'")) {
      return {
        rows: state.orders.filter((order) =>
          order.user_id === values[0]
          && order.account_id === values[1]
          && order.status === "pending",
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
    if (sql.includes("FROM paper_positions") && sql.includes("WHERE account_id=$1 AND user_id=$2")) {
      return {
        rows: state.positions.filter((position) =>
          position.account_id === values[0] && position.user_id === values[1],
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
    if (sql.includes("FROM paper_lots") && sql.includes("WHERE account_id=$1 AND user_id=$2")) {
      return {
        rows: state.lots.filter((lot) => lot.account_id === values[0] && lot.user_id === values[1]),
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
      if (account) {
        account.cash = Number(values[2]);
        if (values.length > 3) {
          account.short_collateral = Number(values[3]);
          account.short_collateral_ratio = Number(values[4]);
          account.unsettled_items = JSON.parse(String(values[5]));
        }
      }
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
    if (sql.startsWith("INSERT INTO paper_orders")) {
      state.orders.push({
        id: values[0], user_id: values[1], account_id: values[2],
        lightning_round_event_id: values[3], symbol: values[4], company_name: values[5],
        order_type: values[6], side: values[7], intent: values[8],
        short_collateral_ratio: values[9], shares: values[10], limit_price: values[11],
        stop_price: values[12], trail_pct: values[13], trail_abs: values[14],
        trail_ref: values[15], status: "filled", filled_price: values[16],
        filled_at: new Date(values[17]), placed_at: new Date(values[18]),
        rejection_reason: null, asset_type: values[19], dividend_yield: values[20],
        dividend_rate: values[21], expense_ratio: values[22], sector: values[23],
      });
      return { rows: [] };
    }
    if (
      sql.startsWith("UPDATE event_arena_lightning_participants")
      && sql.includes("SET updated_at=NOW()")
    ) {
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

function seedEnteredState(): MemoryState {
  const state = seedState([{ status: "filled", filled_price: 100, filled_at: new Date(startAt + 1000) }]);
  state.participants[0]!.status = "entered";
  state.transactions.push({
    id: "lightning-buy",
    user_id: installationId,
    account_id: accountId,
    symbol: "AAPL",
    company_name: "Apple",
    action: "BUY",
    shares: 2,
    price: 100,
    total: 200,
    fee: 0,
    date: new Date(startAt + 1000),
    lightning_round_event_id: eventId,
  });
  return state;
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

test("Lightning Round market orders fill at the official event start", async () => {
  const state = seedState([{}]);
  const db = new MemoryDatabase(state);
  const result = await process(db, async () => 150, () => startAt);
  assert.equal(result.filled, 1);
  assert.equal(new Date(state.orders[0].filled_at).getTime(), startAt);
  assert.equal(new Date(state.transactions[1].date).getTime(), startAt);
  assert.equal(state.participants[0].status, "entered");
});

test("active Lightning history resumes from persisted snapshots after a worker restart", async () => {
  const state = seedEnteredState();
  const firstAt = startAt + 5 * 60_000;

  await process(new MemoryDatabase(state), async () => 110, () => firstAt);
  assert.equal(state.leaderboardEntries[0]?.equity, 100_020);
  assert.equal(state.snapshots.length, 1);
  assert.equal(state.snapshots[0]?.return_percent, 0.02);
  assert.equal(state.snapshots[0]?.is_final, false);

  // A new database wrapper represents a worker reconnecting with no process-local
  // history cache. The saved snapshot still controls meaningful-change timing.
  await process(new MemoryDatabase(state), async () => 120, () => firstAt + 1 * 60_000);
  assert.equal(state.leaderboardEntries[0]?.equity, 100_040);
  assert.equal(state.snapshots.length, 1, "a changed score inside the five-minute window is deferred");

  await process(new MemoryDatabase(state), async () => 120, () => firstAt + 6 * 60_000);
  assert.equal(state.snapshots.length, 2);
  assert.equal(state.snapshots[1]?.return_percent, 0.04);

  await process(new MemoryDatabase(state), async () => 120, () => firstAt + 7 * 60_000);
  assert.equal(state.snapshots.length, 2, "unchanged scores do not create extra history points");

  await process(new MemoryDatabase(state), async () => 130, () => endAt + 1000);
  const finalSnapshot = state.snapshots.find((snapshot) => snapshot.is_final);
  assert.equal(state.snapshots.length, 3);
  assert.equal(finalSnapshot?.return_percent, 0.06);
  const frozenSnapshot = structuredClone(finalSnapshot);
  const frozenResult = structuredClone(state.participants[0]?.final_result);

  await process(new MemoryDatabase(state), async () => 999, () => endAt + 60_000);
  assert.deepEqual(state.snapshots.find((snapshot) => snapshot.is_final), frozenSnapshot);
  assert.deepEqual(state.participants[0]?.final_result, frozenResult);
});

test("active Lightning history records participants passing after a worker restart", async () => {
  const state = seedEnteredState();
  const secondInstallationId = "installation-second";
  const secondAccountId = "paper-event:second";
  state.participants.push({
    ...state.participants[0],
    installation_id: secondInstallationId,
    account_id: secondAccountId,
    alias: "SteadyOwl",
  });
  state.accounts.push({
    ...state.accounts[0],
    id: secondAccountId,
    user_id: secondInstallationId,
  });
  state.transactions.push({
    id: "second-lightning-buy",
    user_id: secondInstallationId,
    account_id: secondAccountId,
    symbol: "GOOG",
    company_name: "Alphabet",
    action: "BUY",
    shares: 2,
    price: 100,
    total: 200,
    fee: 0,
    date: new Date(startAt + 1000),
    lightning_round_event_id: eventId,
  });

  const firstAt = startAt + 5 * 60_000;
  const prices = { AAPL: 110, GOOG: 100 };
  const fetchPrice = async (symbol: string) => prices[symbol as keyof typeof prices] ?? null;
  const firstCycle = await process(new MemoryDatabase(state), fetchPrice, () => firstAt);

  assert.equal(firstCycle.events, 1);
  assert.equal(state.leaderboardEntries.length, 2);
  assert.deepEqual(
    state.snapshots.map(({ participant_token, rank }) => ({ participant_token, rank })),
    [
      { participant_token: `token-${installationId}`, rank: 1 },
      { participant_token: `token-${secondInstallationId}`, rank: 2 },
    ],
  );

  // The second connection must compare with the persisted ranks, not worker-local state.
  prices.AAPL = 90;
  await process(new MemoryDatabase(state), fetchPrice, () => firstAt + 6 * 60_000);
  assert.deepEqual(
    state.snapshots.map(({ participant_token, rank }) => ({ participant_token, rank })),
    [
      { participant_token: `token-${installationId}`, rank: 1 },
      { participant_token: `token-${secondInstallationId}`, rank: 2 },
      { participant_token: `token-${secondInstallationId}`, rank: 1 },
      { participant_token: `token-${installationId}`, rank: 2 },
    ],
  );

  await process(new MemoryDatabase(state), fetchPrice, () => firstAt + 7 * 60_000);
  assert.equal(state.snapshots.length, 4, "unchanged ranks do not create duplicate history points");
});

test("active Lightning standings exclude opted-out entries after a worker reconnect", async () => {
  const state = seedEnteredState();
  const optedOutInstallationId = "installation-opted-out";
  const optedOutAccountId = "paper-event:opted-out";
  state.participants.push({
    ...state.participants[0],
    installation_id: optedOutInstallationId,
    account_id: optedOutAccountId,
    alias: "QuietFox",
    leaderboard_opted_in: false,
  });
  state.accounts.push({
    ...state.accounts[0],
    id: optedOutAccountId,
    user_id: optedOutInstallationId,
  });
  state.transactions.push({
    id: "opted-out-lightning-buy",
    user_id: optedOutInstallationId,
    account_id: optedOutAccountId,
    symbol: "GOOG",
    company_name: "Alphabet",
    action: "BUY",
    shares: 1,
    price: 100,
    total: 100,
    fee: 0,
    date: new Date(startAt + 1000),
    lightning_round_event_id: eventId,
  });
  state.leaderboardEntries.push({
    event_id: eventId,
    installation_id: optedOutInstallationId,
    participant_token: `token-${optedOutInstallationId}`,
    alias: "QuietFox",
    start_equity: 100_000,
    equity: 150_000,
    return_percent: 0.5,
    trade_count: 1,
    holdings: [],
    is_active: true,
  });

  const firstAt = startAt + 5 * 60_000;
  const fetchPrice = async (symbol: string) => (symbol === "AAPL" ? 110 : 300);
  await process(new MemoryDatabase(state), fetchPrice, () => firstAt);

  assert.equal(state.leaderboardEntries.find(
    (entry) => entry.installation_id === optedOutInstallationId,
  )?.return_percent, 0.5, "an opted-out entry is not refreshed");
  assert.deepEqual(
    state.snapshots.map(({ participant_token, rank }) => ({ participant_token, rank })),
    [{ participant_token: `token-${installationId}`, rank: 1 }],
  );

  // A fresh database wrapper models a worker reconnecting without local rank state.
  await process(new MemoryDatabase(state), fetchPrice, () => firstAt + 6 * 60_000);
  assert.deepEqual(
    state.snapshots.map(({ participant_token, rank }) => ({ participant_token, rank })),
    [{ participant_token: `token-${installationId}`, rank: 1 }],
    "reconnects do not create history for the opted-out participant or let its stale score affect ranks",
  );
});

test("active Lightning tie ranks stay stable across worker connections", async () => {
  const state = seedEnteredState();
  const secondInstallationId = "installation-second";
  const secondAccountId = "paper-event:second";
  state.participants[0]!.alias = "Alpha";
  state.participants.push({
    ...state.participants[0],
    installation_id: secondInstallationId,
    account_id: secondAccountId,
    alias: "Zulu",
  });
  state.accounts.push({
    ...state.accounts[0],
    id: secondAccountId,
    user_id: secondInstallationId,
  });
  state.transactions.push({
    id: "second-lightning-buy",
    user_id: secondInstallationId,
    account_id: secondAccountId,
    symbol: "GOOG",
    company_name: "Alphabet",
    action: "BUY",
    shares: 2,
    price: 100,
    total: 200,
    fee: 0,
    date: new Date(startAt + 1000),
    lightning_round_event_id: eventId,
  });

  const firstAt = startAt + 5 * 60_000;
  const prices = { AAPL: 110, GOOG: 110 };
  const fetchPrice = async (symbol: string) => prices[symbol as keyof typeof prices] ?? null;
  await process(new MemoryDatabase(state), fetchPrice, () => firstAt);

  assert.deepEqual(
    state.snapshots.map(({ participant_token, rank }) => ({ participant_token, rank })),
    [
      { participant_token: `token-${secondInstallationId}`, rank: 1 },
      { participant_token: `token-${installationId}`, rank: 2 },
    ],
  );

  // Aliases can change, but the persisted tie-breaker is the stable participant ID.
  state.participants[0]!.alias = "Zulu";
  state.participants[1]!.alias = "Alpha";
  await process(new MemoryDatabase(state), fetchPrice, () => firstAt + 6 * 60_000);
  assert.equal(state.snapshots.length, 2, "unchanged tied scores must not add history snapshots");
  assert.deepEqual(
    state.snapshots.map(({ participant_token, rank }) => ({ participant_token, rank })),
    [
      { participant_token: `token-${secondInstallationId}`, rank: 1 },
      { participant_token: `token-${installationId}`, rank: 2 },
    ],
  );
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

test("active Lightning market fills are server-recorded and safe to retry", async () => {
  const state = seedEnteredState();
  const db = new MemoryDatabase(state);
  const order = {
    id: "mobile-order-0001",
    accountId,
    symbol: "AAPL",
    companyName: "Apple",
    orderType: "market" as const,
    side: "buy" as const,
    shares: 2,
    status: "pending" as const,
    placedAt: new Date(startAt + 60_000).toISOString(),
  };
  const execute = (orderToExecute = order) => executeLightningRoundOrder(db, {
    eventId,
    installationId,
    order: orderToExecute,
    now: () => startAt + 60_000,
    fetchPrice: async () => 100,
    makeId: fixedId,
  });

  const first = await execute();
  assert.equal(first.ok, true);
  if (!first.ok) return;
  assert.equal(first.transaction.id, order.id);
  assert.equal(first.transaction.lightningRoundEventId, eventId);
  assert.equal(first.order.status, "filled");
  assert.ok(first.account.cash < 100_000);
  assert.equal(first.positions.find((position) => position.symbol === "AAPL")?.shares, 2);
  assert.equal(state.transactions.find((transaction) => transaction.id === order.id)?.lightning_round_event_id, eventId);
  assert.equal(state.orders.find((saved) => saved.id === order.id)?.status, "filled");

  const cashAfterFirstFill = state.accounts[0]!.cash;
  const retry = await execute();
  assert.equal(retry.ok, true);
  if (!retry.ok) return;
  assert.equal(retry.replayed, true);
  assert.equal(retry.transaction.id, order.id);
  assert.equal(state.transactions.filter((transaction) => transaction.id === order.id).length, 1);
  assert.equal(state.accounts[0]!.cash, cashAfterFirstFill);

  const limitOrder = {
    ...order,
    id: "mobile-limit-0001",
    orderType: "limit" as const,
    limitPrice: 100,
    shares: 1,
  };
  const limitFill = await execute(limitOrder);
  assert.equal(limitFill.ok, true);
  if (!limitFill.ok) return;
  assert.equal(limitFill.order.orderType, "limit");
  assert.ok((limitFill.order.filledPrice ?? Infinity) <= 100);
  assert.equal(limitFill.transaction.lightningRoundEventId, eventId);

  const untriggeredLimit = {
    ...limitOrder,
    id: "mobile-limit-0002",
    limitPrice: 90,
  };
  const skippedLimit = await execute(untriggeredLimit);
  assert.equal(skippedLimit.ok, false);
  if (!skippedLimit.ok) assert.equal(skippedLimit.status, 409);
  assert.equal(state.orders.some((saved) => saved.id === untriggeredLimit.id), false);
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
  assert.deepEqual(score.finalPrices, { AAPL: 110 });
  assert.equal(score.finalPositions[0]?.marketPrice, 110);
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

test("event-end standings freeze tagged trades, final prices, and ranks once across retries", async () => {
  const state = seedEnteredState();
  const db = new MemoryDatabase(state);
  let quoteCalls = 0;

  const waiting = await process(
    db,
    async () => { quoteCalls += 1; return null; },
    () => endAt + 1000,
  );
  assert.equal(waiting.events, 1);
  assert.equal(state.participants[0]?.final_result, null);
  assert.equal(state.events[0]?.finalized_at, null);
  assert.equal(state.snapshots.length, 0);

  const completed = await process(
    db,
    async (symbol) => {
      quoteCalls += 1;
      assert.equal(symbol, "AAPL");
      return 110;
    },
    () => endAt + 2000,
  );
  assert.equal(completed.events, 1);
  assert.equal(state.participants[0]?.final_result.equity, 100_020);
  assert.deepEqual(state.participants[0]?.final_result.finalPrices, { AAPL: 110 });
  assert.equal(state.participants[0]?.final_result.finalRank, 1);
  assert.equal(state.leaderboardEntries.length, 1);
  assert.equal(state.leaderboardEntries[0]?.equity, 100_020);
  assert.equal(state.snapshots.length, 1);
  assert.equal(state.snapshots[0]?.rank, 1);
  assert.equal(state.snapshots[0]?.return_percent, 0.02);
  assert.equal(state.snapshots[0]?.is_final, true);
  assert.equal(state.events[0]?.finalized_at.getTime(), endAt);
  assert.equal(quoteCalls, 2);

  const savedResult = structuredClone(state.participants[0]?.final_result);
  const retry = await process(
    db,
    async () => { quoteCalls += 1; return 999; },
    () => endAt + 60_000,
  );
  assert.equal(retry.events, 0);
  assert.deepEqual(state.participants[0]?.final_result, savedResult);
  assert.equal(state.snapshots.length, 1);
  assert.equal(state.leaderboardEntries[0]?.equity, 100_020);
  assert.equal(quoteCalls, 2);
});

test("Lightning Round fingerprint uses only this participant's tagged fills inside the round", async () => {
  const state = seedEnteredState();
  state.transactions.push(
    ...[
      { id: "event-sell-1", symbol: "AAA", hour: 1, shares: 0.5, price: 110, realized_pnl: 5 },
      { id: "event-sell-2", symbol: "BBB", hour: 2, shares: 0.5, price: 120, realized_pnl: 10 },
      { id: "event-sell-3", symbol: "CCC", hour: 3, shares: 1, price: 130, realized_pnl: 30 },
    ].map((item) => ({
      id: item.id,
      user_id: installationId,
      account_id: accountId,
      symbol: item.symbol,
      company_name: "Apple",
      action: "SELL",
      shares: item.shares,
      price: item.price,
      total: item.shares * item.price,
      realized_pnl: item.realized_pnl,
      fee: 0,
      date: new Date(startAt + item.hour * 60 * 60 * 1000),
      lightning_round_event_id: eventId,
    })),
    {
      id: "regular-account-transaction",
      user_id: installationId,
      account_id: accountId,
      symbol: "MSFT",
      action: "SELL",
      shares: 1,
      price: 10,
      total: 10,
      realized_pnl: 90_000,
      fee: 0,
      date: new Date(startAt + 2 * 60 * 60 * 1000),
      lightning_round_event_id: null,
    },
    {
      id: "other-round-transaction",
      user_id: installationId,
      account_id: accountId,
      symbol: "NVDA",
      action: "SELL",
      shares: 1,
      price: 10,
      total: 10,
      realized_pnl: 80_000,
      fee: 0,
      date: new Date(startAt + 2 * 60 * 60 * 1000),
      lightning_round_event_id: "lightning-another",
    },
    {
      id: "other-participant-transaction",
      user_id: "other-installation",
      account_id: accountId,
      symbol: "GOOG",
      action: "SELL",
      shares: 1,
      price: 10,
      total: 10,
      realized_pnl: 70_000,
      fee: 0,
      date: new Date(startAt + 2 * 60 * 60 * 1000),
      lightning_round_event_id: eventId,
    },
    {
      id: "outside-round-transaction",
      user_id: installationId,
      account_id: accountId,
      symbol: "META",
      action: "SELL",
      shares: 1,
      price: 10,
      total: 10,
      realized_pnl: 60_000,
      fee: 0,
      date: new Date(endAt + 1),
      lightning_round_event_id: eventId,
    },
  );

  await process(new MemoryDatabase(state), async () => 110, () => endAt + 1000);

  const saved = state.participants[0]?.final_result;
  assert.equal(saved?.tradeCount, 4);
  assert.equal(saved?.tradingFingerprintObservation?.observationId, "positive-trade-consistency");
  assert.equal(saved?.tradingFingerprintObservation?.evidence.positiveTradeCount, 3);
  assert.equal(saved?.tradingFingerprintObservation?.evidence.realizedTradeCount, 3);
  assert.match(saved?.tradingFingerprintObservation?.supportingSentence ?? "", /3 of 3 trades/);
});

test("server finalizes an entered participant's personal result without publishing an opted-out score", async () => {
  const state = seedEnteredState();
  state.participants[0]!.leaderboard_opted_in = false;
  const db = new MemoryDatabase(state);

  await process(db, async () => 110, () => endAt + 1000);

  assert.equal(state.events[0]?.finalized_at.getTime(), endAt);
  assert.equal(state.participants[0]?.final_result.equity, 100_020);
  assert.equal(state.participants[0]?.final_result.finalRank, null);
  assert.equal(state.leaderboardEntries.length, 0);
  assert.equal(state.snapshots.length, 0);
});

test("database interface remains compatible with a standalone worker connection", async () => {
  const state = seedState([{}]);
  const db = new MemoryDatabase(state);
  assert.equal(typeof (db as LightningExecutionDatabase).connect, "function");
  assert.equal((await process(db, async () => 150)).filled, 1);
});

test(
  "PostgreSQL serializes Lightning Round workers and preserves tied final ranks",
  { skip: !databaseUrl && "TEST_DATABASE_URL or DATABASE_URL is not configured" },
  async (t) => {
    assert.ok(databaseUrl);
    const schema = `lightning_round_test_${randomUUID().replaceAll("-", "")}`;
    const adminPool = new Pool({ connectionString: databaseUrl, max: 2 });
    let firstPool: InstanceType<typeof Pool> | undefined;
    let secondPool: InstanceType<typeof Pool> | undefined;
    let recoveryPool: InstanceType<typeof Pool> | undefined;
    let schemaCreated = false;

    try {
      try {
        await adminPool.query("SELECT 1");
      } catch {
        t.skip("The configured PostgreSQL test database is unavailable");
        return;
      }

      await adminPool.query(`CREATE SCHEMA "${schema}"`);
      schemaCreated = true;
      const poolOptions = {
        connectionString: databaseUrl,
        max: 1,
        options: `-c search_path=${schema}`,
      };
      firstPool = new Pool(poolOptions);
      secondPool = new Pool(poolOptions);

      await firstPool.query(`
        CREATE TABLE paper_accounts (
          id TEXT NOT NULL, user_id TEXT NOT NULL, name TEXT NOT NULL,
          cash DOUBLE PRECISION NOT NULL, short_collateral DOUBLE PRECISION NOT NULL DEFAULT 0,
          short_collateral_ratio DOUBLE PRECISION NOT NULL DEFAULT 1.5,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), unsettled_items JSONB NOT NULL DEFAULT '[]',
          last_dividend_credit TIMESTAMPTZ,
          PRIMARY KEY (id,user_id)
        );
        CREATE TABLE paper_positions (
          id TEXT NOT NULL, user_id TEXT NOT NULL, account_id TEXT NOT NULL, symbol TEXT NOT NULL,
          company_name TEXT, shares DOUBLE PRECISION NOT NULL, position_type TEXT NOT NULL DEFAULT 'long',
          collateral_per_share DOUBLE PRECISION, avg_cost DOUBLE PRECISION NOT NULL,
          opened_at TIMESTAMPTZ, dividend_yield DOUBLE PRECISION DEFAULT 0,
          dividend_rate DOUBLE PRECISION DEFAULT 0, expense_ratio DOUBLE PRECISION DEFAULT 0,
          sector TEXT, PRIMARY KEY (id,user_id)
        );
        CREATE TABLE paper_lots (
          id TEXT NOT NULL, user_id TEXT NOT NULL, account_id TEXT NOT NULL, symbol TEXT NOT NULL,
          shares DOUBLE PRECISION NOT NULL, cost DOUBLE PRECISION NOT NULL,
          purchased_at TIMESTAMPTZ NOT NULL, PRIMARY KEY (id,user_id)
        );
        CREATE TABLE paper_transactions (
          id TEXT NOT NULL, user_id TEXT NOT NULL, account_id TEXT NOT NULL, symbol TEXT NOT NULL,
          company_name TEXT, action TEXT NOT NULL, shares DOUBLE PRECISION NOT NULL,
          price DOUBLE PRECISION NOT NULL, total DOUBLE PRECISION NOT NULL,
          date TIMESTAMPTZ NOT NULL, fee DOUBLE PRECISION DEFAULT 0, realized_pnl DOUBLE PRECISION,
          cash_delta DOUBLE PRECISION, short_collateral_delta DOUBLE PRECISION,
          lightning_round_event_id TEXT, PRIMARY KEY (id,user_id)
        );
        CREATE TABLE paper_orders (
          id TEXT NOT NULL, user_id TEXT NOT NULL, account_id TEXT NOT NULL, symbol TEXT NOT NULL,
          company_name TEXT, order_type TEXT NOT NULL, side TEXT NOT NULL, intent TEXT,
          short_collateral_ratio DOUBLE PRECISION,
          shares DOUBLE PRECISION NOT NULL, status TEXT NOT NULL, placed_at TIMESTAMPTZ NOT NULL,
          limit_price DOUBLE PRECISION, stop_price DOUBLE PRECISION, trail_pct DOUBLE PRECISION,
          trail_abs DOUBLE PRECISION, trail_ref DOUBLE PRECISION,
          filled_price DOUBLE PRECISION, filled_at TIMESTAMPTZ,
          lightning_round_event_id TEXT, rejection_reason TEXT, asset_type TEXT,
          dividend_yield DOUBLE PRECISION, dividend_rate DOUBLE PRECISION,
          expense_ratio DOUBLE PRECISION, sector TEXT, PRIMARY KEY (id,user_id)
        );
        CREATE TABLE event_arena_events (
          event_id TEXT PRIMARY KEY, event_type TEXT NOT NULL, artwork_id TEXT NOT NULL,
          starting_balance DOUBLE PRECISION NOT NULL, ranking_direction TEXT NOT NULL,
          event_start_at TIMESTAMPTZ NOT NULL, event_end_at TIMESTAMPTZ NOT NULL,
          finalized_at TIMESTAMPTZ
        );
        CREATE TABLE event_arena_lightning_participants (
          event_id TEXT NOT NULL, installation_id TEXT NOT NULL, account_id TEXT NOT NULL,
          alias TEXT NOT NULL, status TEXT NOT NULL, leaderboard_opted_in BOOLEAN NOT NULL DEFAULT TRUE,
          failure_reason TEXT, final_result JSONB, event_start_at TIMESTAMPTZ NOT NULL,
          event_end_at TIMESTAMPTZ NOT NULL, updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          PRIMARY KEY (event_id,installation_id)
        );
        CREATE TABLE event_arena_leaderboard_entries (
          event_id TEXT NOT NULL, installation_id TEXT NOT NULL,
          participant_token TEXT NOT NULL DEFAULT gen_random_uuid()::text,
          alias TEXT NOT NULL, start_equity DOUBLE PRECISION NOT NULL, equity DOUBLE PRECISION NOT NULL,
          return_percent DOUBLE PRECISION NOT NULL, trade_count INTEGER, holdings JSONB NOT NULL,
          event_start_at TIMESTAMPTZ NOT NULL, event_end_at TIMESTAMPTZ NOT NULL,
          updated_at TIMESTAMPTZ NOT NULL, cash_balance DOUBLE PRECISION NOT NULL,
          is_active BOOLEAN NOT NULL DEFAULT TRUE, PRIMARY KEY (event_id,installation_id)
        );
        CREATE TABLE event_arena_leaderboard_snapshots (
          snapshot_id BIGSERIAL PRIMARY KEY, event_id TEXT NOT NULL,
          participant_token TEXT NOT NULL, event_start_at TIMESTAMPTZ NOT NULL,
          event_end_at TIMESTAMPTZ NOT NULL, captured_at TIMESTAMPTZ NOT NULL,
          rank INTEGER NOT NULL, return_percent DOUBLE PRECISION NOT NULL,
          is_final BOOLEAN NOT NULL DEFAULT FALSE
        );
        CREATE UNIQUE INDEX event_arena_final_snapshot_idx
          ON event_arena_leaderboard_snapshots (event_id,participant_token)
          WHERE is_final=TRUE;
      `);

      const executionDatabase = (
        pool: InstanceType<typeof Pool>,
        throwAfterFilledOrder = false,
      ): LightningExecutionDatabase => ({
        query: (sql, values = []) => pool.query(sql, values),
        connect: async () => {
          const client = await pool.connect();
          return {
            query: async (sql, values = []) => {
              const result = await client.query(sql, values);
              if (throwAfterFilledOrder && sql.includes("SET status='filled'")) {
                throwAfterFilledOrder = false;
                throw new Error("Simulated worker interruption after fill writes");
              }
              return result;
            },
            release: () => client.release(),
          };
        },
      });

      const now = Date.parse("2033-05-18T16:05:00.000Z");
      const startAt = Date.parse("2033-05-18T16:00:00.000Z");
      const endAt = startAt + 24 * 60 * 60 * 1000;
      const seedParticipant = async (
        id: string,
        historyEventId: string,
        historyInstallationId: string,
      ) => {
        const userId = `installation-${id}`;
        const accountId = `account-${id}`;
        await firstPool!.query(
          `INSERT INTO event_arena_events
            (event_id,event_type,artwork_id,starting_balance,ranking_direction,event_start_at,event_end_at)
           VALUES ($1,'lightning-round','stadium',100000,'highest-return',$2,$3)`,
          [id, new Date(startAt), new Date(endAt)],
        );
        await firstPool!.query(
          `INSERT INTO event_arena_lightning_participants
            (event_id,installation_id,account_id,alias,status,event_start_at,event_end_at)
           VALUES ($1,$2,$3,'MarketFox','queued',$4,$5)`,
          [id, userId, accountId, new Date(startAt), new Date(endAt)],
        );
        await firstPool!.query(
          `INSERT INTO paper_accounts (id,user_id,name,cash,created_at)
           VALUES ($1,$2,'Shared Event Arena',100000,$3)`,
          [accountId, userId, new Date(startAt)],
        );
        await firstPool!.query(
          `INSERT INTO paper_positions
            (id,user_id,account_id,symbol,company_name,shares,position_type,avg_cost,opened_at,sector)
           VALUES ($1,$2,$3,'MSFT','Microsoft',4,'long',200,$4,'Technology')`,
          [`position-${id}`, userId, accountId, new Date(startAt)],
        );
        await firstPool!.query(
          `INSERT INTO paper_lots (id,user_id,account_id,symbol,shares,cost,purchased_at)
           VALUES ($1,$2,$3,'MSFT',4,200,$4)`,
          [`lot-${id}`, userId, accountId, new Date(startAt)],
        );
        await firstPool!.query(
          `INSERT INTO paper_transactions
            (id,user_id,account_id,symbol,company_name,action,shares,price,total,date)
           VALUES ($1,$2,$3,'MSFT','Microsoft','BUY',4,200,800,$4)`,
          [`transaction-${id}`, userId, accountId, new Date(startAt)],
        );
        await firstPool!.query(
          `INSERT INTO paper_orders
            (id,user_id,account_id,symbol,company_name,order_type,side,shares,status,placed_at,lightning_round_event_id)
           VALUES ($1,$2,$3,'AAPL','Apple','market','buy',2,'pending',$4,$5)`,
          [`order-${id}`, userId, accountId, new Date(startAt), id],
        );
        await firstPool!.query(
          `INSERT INTO event_arena_events
            (event_id,event_type,artwork_id,starting_balance,ranking_direction,event_start_at,event_end_at,finalized_at)
           VALUES ($1,'event-arena','stadium',100000,'highest-return',$2,$3,$3)`,
          [historyEventId, new Date(startAt - 10 * 24 * 60 * 60 * 1000), new Date(startAt)],
        );
        await firstPool!.query(
          `INSERT INTO event_arena_leaderboard_entries
            (event_id,installation_id,participant_token,alias,start_equity,equity,return_percent,
             trade_count,holdings,event_start_at,event_end_at,updated_at,cash_balance,is_active)
           VALUES ($1,$2,$3,'SavedHistory',100000,101000,1,1,'[]'::jsonb,$4,$5,$5,100000,TRUE)`,
          [
            historyEventId,
            historyInstallationId,
            `token-${historyInstallationId}`,
            new Date(startAt - 10 * 24 * 60 * 60 * 1000),
            new Date(startAt),
          ],
        );
        return { userId, accountId };
      };

      const concurrentIds = {
        event: `lr-concurrent-${randomUUID()}`,
        historyEvent: `arena-history-${randomUUID()}`,
        historyInstallation: `history-user-${randomUUID()}`,
      };
      const concurrentAccount = await seedParticipant(
        concurrentIds.event,
        concurrentIds.historyEvent,
        concurrentIds.historyInstallation,
      );

      const firstConnection = await firstPool.connect();
      const secondConnection = await secondPool.connect();
      let firstBackendPid: number;
      let secondBackendPid: number;
      try {
        firstBackendPid = Number((await firstConnection.query("SELECT pg_backend_pid() AS pid")).rows[0].pid);
        secondBackendPid = Number((await secondConnection.query("SELECT pg_backend_pid() AS pid")).rows[0].pid);
      } finally {
        firstConnection.release();
        secondConnection.release();
      }
      assert.notEqual(firstBackendPid!, secondBackendPid!, "worker pools must use independent PostgreSQL connections");

      let notifyPriceStarted!: () => void;
      const priceStarted = new Promise<void>((resolve) => { notifyPriceStarted = resolve; });
      let resumePrice!: () => void;
      const priceGate = new Promise<void>((resolve) => { resumePrice = resolve; });
      const firstWorker = processDueLightningRoundOrders(
        executionDatabase(firstPool),
        {
          now: () => now,
          makeId: randomUUID,
          fetchPrice: async () => {
            notifyPriceStarted();
            await priceGate;
            return 150;
          },
        },
      );
      await priceStarted;
      const secondWorker = processDueLightningRoundOrders(
        executionDatabase(secondPool),
        { now: () => now, makeId: randomUUID, fetchPrice: async () => 150 },
      );

      let lockWaitObserved = false;
      let workerResults: PromiseSettledResult<Awaited<ReturnType<typeof processDueLightningRoundOrders>>>[];
      try {
        for (let attempt = 0; attempt < 100; attempt += 1) {
          const { rows } = await adminPool.query(
            "SELECT wait_event_type,wait_event FROM pg_stat_activity WHERE pid=$1",
            [secondBackendPid!],
          );
          if (rows[0]?.wait_event_type === "Lock" && rows[0]?.wait_event === "advisory") {
            lockWaitObserved = true;
            break;
          }
          await new Promise((resolve) => setTimeout(resolve, 10));
        }
      } finally {
        resumePrice();
        workerResults = await Promise.allSettled([firstWorker, secondWorker]);
      }
      assert.ok(lockWaitObserved, "the second worker should wait on the PostgreSQL advisory lock");
      const rejectedWorker = workerResults.find((result) => result.status === "rejected");
      if (rejectedWorker?.status === "rejected") throw rejectedWorker.reason;
      const [firstResult, secondResult] = workerResults.map((result) =>
        result.status === "fulfilled" ? result.value : undefined,
      );
      assert.ok(firstResult && secondResult);
      assert.equal(firstResult.filled + secondResult.filled, 1);
      assert.equal(
        Number((await firstPool.query(
          "SELECT COUNT(*)::int AS count FROM paper_transactions WHERE user_id=$1 AND lightning_round_event_id=$2",
          [concurrentAccount.userId, concurrentIds.event],
        )).rows[0].count),
        1,
      );
      assert.deepEqual(
        (await firstPool.query(
          "SELECT shares FROM paper_positions WHERE user_id=$1 AND account_id=$2 AND symbol='AAPL'",
          [concurrentAccount.userId, concurrentAccount.accountId],
        )).rows.map((row) => Number(row.shares)),
        [2],
      );
      assert.deepEqual(
        (await firstPool.query(
          "SELECT shares FROM paper_lots WHERE user_id=$1 AND account_id=$2 AND symbol='AAPL'",
          [concurrentAccount.userId, concurrentAccount.accountId],
        )).rows.map((row) => Number(row.shares)),
        [2],
      );
      assert.equal(
        (await firstPool.query(
          "SELECT status FROM paper_orders WHERE id=$1",
          [`order-${concurrentIds.event}`],
        )).rows[0].status,
        "filled",
      );

      const recoveryIds = {
        event: `lr-recovery-${randomUUID()}`,
        historyEvent: `arena-history-${randomUUID()}`,
        historyInstallation: `history-user-${randomUUID()}`,
      };
      const recoveryAccount = await seedParticipant(
        recoveryIds.event,
        recoveryIds.historyEvent,
        recoveryIds.historyInstallation,
      );

      await assert.rejects(
        processDueLightningRoundOrders(
          executionDatabase(firstPool, true),
          { now: () => now, makeId: randomUUID, fetchPrice: async () => 150 },
        ),
        /Simulated worker interruption after fill writes/,
      );

      const rollbackState = await firstPool.query(
        `SELECT
          (SELECT cash FROM paper_accounts WHERE id=$1 AND user_id=$2) AS cash,
          (SELECT jsonb_agg(jsonb_build_object('symbol',symbol,'shares',shares,'avgCost',avg_cost) ORDER BY symbol)
             FROM paper_positions WHERE account_id=$1 AND user_id=$2) AS positions,
          (SELECT jsonb_agg(jsonb_build_object('symbol',symbol,'shares',shares,'cost',cost) ORDER BY symbol)
             FROM paper_lots WHERE account_id=$1 AND user_id=$2) AS lots,
          (SELECT jsonb_agg(jsonb_build_object('id',id,'symbol',symbol,'eventId',lightning_round_event_id) ORDER BY id)
             FROM paper_transactions WHERE account_id=$1 AND user_id=$2) AS transactions,
          (SELECT jsonb_build_object('status',status,'filledPrice',filled_price,'filledAt',filled_at)
             FROM paper_orders WHERE id=$3 AND user_id=$2) AS order`,
        [recoveryAccount.accountId, recoveryAccount.userId, `order-${recoveryIds.event}`],
      );
      const rolledBack = rollbackState.rows[0];
      assert.equal(Number(rolledBack.cash), 100_000);
      assert.deepEqual(rolledBack.positions, [{ symbol: "MSFT", shares: 4, avgCost: 200 }]);
      assert.deepEqual(rolledBack.lots, [{ symbol: "MSFT", shares: 4, cost: 200 }]);
      assert.deepEqual(rolledBack.transactions, [{
        id: `transaction-${recoveryIds.event}`,
        symbol: "MSFT",
        eventId: null,
      }]);
      assert.equal(rolledBack.order.status, "pending");
      assert.equal(rolledBack.order.filledPrice, null);
      assert.equal(rolledBack.order.filledAt, null);
      assert.equal(
        (await firstPool.query(
          "SELECT status FROM event_arena_lightning_participants WHERE event_id=$1 AND installation_id=$2",
          [recoveryIds.event, recoveryAccount.userId],
        )).rows[0].status,
        "queued",
      );

      recoveryPool = new Pool(poolOptions);
      const recoveryResult = await processDueLightningRoundOrders(
        executionDatabase(recoveryPool),
        { now: () => now, makeId: randomUUID, fetchPrice: async () => 150 },
      );
      assert.equal(recoveryResult.filled, 1, "a fresh worker should complete the rolled-back order once");
      const retryResult = await processDueLightningRoundOrders(
        executionDatabase(recoveryPool),
        { now: () => now, makeId: randomUUID, fetchPrice: async () => 150 },
      );
      assert.equal(retryResult.filled, 0, "a later worker retry must not create another fill");

      const recovered = await recoveryPool.query(
        `SELECT
          (SELECT cash FROM paper_accounts WHERE id=$1 AND user_id=$2) AS cash,
          (SELECT jsonb_agg(jsonb_build_object('symbol',symbol,'shares',shares) ORDER BY symbol)
             FROM paper_positions WHERE account_id=$1 AND user_id=$2) AS positions,
          (SELECT jsonb_agg(jsonb_build_object('symbol',symbol,'shares',shares) ORDER BY symbol)
             FROM paper_lots WHERE account_id=$1 AND user_id=$2) AS lots,
          (SELECT COUNT(*)::int FROM paper_transactions
             WHERE account_id=$1 AND user_id=$2 AND lightning_round_event_id=$3) AS fill_count,
          (SELECT status FROM paper_orders WHERE id=$4 AND user_id=$2) AS order_status,
          (SELECT status FROM event_arena_lightning_participants
             WHERE event_id=$3 AND installation_id=$2) AS participant_status,
          (SELECT COUNT(*)::int FROM event_arena_leaderboard_entries
             WHERE event_id=$5 AND installation_id=$6) AS preserved_history_count`,
        [
          recoveryAccount.accountId,
          recoveryAccount.userId,
          recoveryIds.event,
          `order-${recoveryIds.event}`,
          recoveryIds.historyEvent,
          recoveryIds.historyInstallation,
        ],
      );
      const finalState = recovered.rows[0];
      assert.ok(Number(finalState.cash) < 100_000);
      assert.deepEqual(finalState.positions, [
        { symbol: "AAPL", shares: 2 },
        { symbol: "MSFT", shares: 4 },
      ]);
      assert.deepEqual(finalState.lots, [
        { symbol: "AAPL", shares: 2 },
        { symbol: "MSFT", shares: 4 },
      ]);
      assert.equal(finalState.fill_count, 1);
      assert.equal(finalState.order_status, "filled");
      assert.equal(finalState.participant_status, "entered");
      assert.equal(finalState.preserved_history_count, 1);

      const scheduledEventId = getLightningRoundScheduleIds(Date.now()).at(-1);
      assert.ok(scheduledEventId, "an upcoming Lightning Round schedule should be available");
      const archivedConfiguration = expectedEventArenaConfiguration(scheduledEventId);
      assert.ok(archivedConfiguration);
      const standingsStartAt = archivedConfiguration.startAtMs;
      const standingsEndAt = archivedConfiguration.endAtMs;
      const standingsIds = {
        event: archivedConfiguration.eventId,
        participants: [
          { installationId: `final-user-a-${randomUUID()}`, symbol: "AAPL", price: 110, optedIn: true },
          { installationId: `final-user-b-${randomUUID()}`, symbol: "MSFT", price: 110, optedIn: true },
          { installationId: `final-user-c-${randomUUID()}`, symbol: "GOOGL", price: 130, optedIn: false },
        ],
      };
      await firstPool.query(
        `INSERT INTO event_arena_events
          (event_id,event_type,artwork_id,starting_balance,ranking_direction,event_start_at,event_end_at)
         VALUES ($1,'lightning-round','stadium',100000,'highest-return',$2,$3)`,
        [standingsIds.event, new Date(standingsStartAt), new Date(standingsEndAt)],
      );
      for (const [index, participant] of standingsIds.participants.entries()) {
        const participantAccountId = `final-account-${index}-${randomUUID()}`;
        await firstPool.query(
          `INSERT INTO event_arena_lightning_participants
            (event_id,installation_id,account_id,alias,status,leaderboard_opted_in,event_start_at,event_end_at)
           VALUES ($1,$2,$3,$4,'entered',$5,$6,$7)`,
          [
            standingsIds.event,
            participant.installationId,
            participantAccountId,
            participant.optedIn ? "TiedPlayer" : `FinalPlayer${index}`,
            participant.optedIn,
            new Date(standingsStartAt),
            new Date(standingsEndAt),
          ],
        );
        await firstPool.query(
          `INSERT INTO paper_accounts (id,user_id,name,cash,created_at)
           VALUES ($1,$2,'Shared Event Arena',99800,$3)`,
          [participantAccountId, participant.installationId, new Date(standingsStartAt)],
        );
        await firstPool.query(
          `INSERT INTO paper_positions
            (id,user_id,account_id,symbol,company_name,shares,position_type,avg_cost,opened_at)
           VALUES ($1,$2,$3,$4,$4,2,'long',100,$5)`,
          [`final-position-${index}-${randomUUID()}`, participant.installationId,
            participantAccountId, participant.symbol, new Date(standingsStartAt)],
        );
        await firstPool.query(
          `INSERT INTO paper_lots (id,user_id,account_id,symbol,shares,cost,purchased_at)
           VALUES ($1,$2,$3,$4,2,200,$5)`,
          [`final-lot-${index}-${randomUUID()}`, participant.installationId,
            participantAccountId, participant.symbol, new Date(standingsStartAt)],
        );
        await firstPool.query(
          `INSERT INTO paper_transactions
            (id,user_id,account_id,symbol,company_name,action,shares,price,total,date,lightning_round_event_id)
           VALUES ($1,$2,$3,$4,$4,'BUY',2,100,200,$5,$6)`,
          [`final-transaction-${index}-${randomUUID()}`, participant.installationId,
            participantAccountId, participant.symbol, new Date(standingsStartAt + 1000), standingsIds.event],
        );
        await firstPool.query(
          `INSERT INTO paper_orders
            (id,user_id,account_id,symbol,company_name,order_type,side,shares,status,placed_at,
             filled_price,filled_at,lightning_round_event_id)
           VALUES ($1,$2,$3,$4,$4,'market','buy',2,'filled',$5,100,$6,$7)`,
          [`final-order-${index}-${randomUUID()}`, participant.installationId,
            participantAccountId, participant.symbol, new Date(standingsStartAt), new Date(standingsStartAt + 1000),
            standingsIds.event],
        );
      }

      const firstFinalizationAttempt = await processDueLightningRoundOrders(
        executionDatabase(firstPool),
        {
          now: () => standingsEndAt + 1000,
          makeId: randomUUID,
          fetchPrice: async (symbol) => symbol === "AAPL" ? 110 : null,
        },
      );
      assert.ok(firstFinalizationAttempt.events >= 1);
      assert.equal(
        (await firstPool.query(
          "SELECT finalized_at FROM event_arena_events WHERE event_id=$1",
          [standingsIds.event],
        )).rows[0].finalized_at,
        null,
        "an unavailable final quote must leave the event eligible for a later worker cycle",
      );
      assert.equal(
        Number((await firstPool.query(
          "SELECT COUNT(*)::int AS count FROM event_arena_leaderboard_snapshots WHERE event_id=$1",
          [standingsIds.event],
        )).rows[0].count),
        0,
      );
      const incompleteStandings = await firstPool.query(
        `SELECT participant.final_result,entry.installation_id AS leaderboard_installation_id
         FROM event_arena_lightning_participants AS participant
         LEFT JOIN event_arena_leaderboard_entries AS entry
           ON entry.event_id=participant.event_id AND entry.installation_id=participant.installation_id
         WHERE participant.event_id=$1`,
        [standingsIds.event],
      );
      assert.equal(incompleteStandings.rows.length, standingsIds.participants.length);
      assert.ok(
        incompleteStandings.rows.every((row) =>
          row.final_result === null && row.leaderboard_installation_id === null,
        ),
        "a successful earlier quote must not persist a partial result or leaderboard entry",
      );

      let notifyFinalQuoteStarted!: () => void;
      const finalQuoteStarted = new Promise<void>((resolve) => { notifyFinalQuoteStarted = resolve; });
      let resumeFinalQuote!: () => void;
      const finalQuoteGate = new Promise<void>((resolve) => { resumeFinalQuote = resolve; });
      const firstFinalizer = processDueLightningRoundOrders(
        executionDatabase(firstPool),
        {
          now: () => standingsEndAt + 2000,
          makeId: randomUUID,
          fetchPrice: async (symbol) => {
            if (symbol === "AAPL") {
              notifyFinalQuoteStarted();
              await finalQuoteGate;
            }
            return standingsIds.participants.find((participant) => participant.symbol === symbol)?.price ?? null;
          },
        },
      );
      await finalQuoteStarted;
      const competingFinalizer = processDueLightningRoundOrders(
        executionDatabase(secondPool),
        {
          now: () => standingsEndAt + 2000,
          makeId: randomUUID,
          fetchPrice: async (symbol) =>
            standingsIds.participants.find((participant) => participant.symbol === symbol)?.price ?? null,
        },
      );

      let finalizerLockWaitObserved = false;
      let finalizerResults: PromiseSettledResult<
        Awaited<ReturnType<typeof processDueLightningRoundOrders>>
      >[];
      try {
        for (let attempt = 0; attempt < 100; attempt += 1) {
          const { rows } = await adminPool.query(
            "SELECT wait_event_type,wait_event FROM pg_stat_activity WHERE pid=$1",
            [secondBackendPid!],
          );
          if (rows[0]?.wait_event_type === "Lock" && rows[0]?.wait_event === "advisory") {
            finalizerLockWaitObserved = true;
            break;
          }
          await new Promise((resolve) => setTimeout(resolve, 10));
        }
      } finally {
        resumeFinalQuote();
        finalizerResults = await Promise.allSettled([firstFinalizer, competingFinalizer]);
      }
      assert.ok(finalizerLockWaitObserved, "the competing finalizer should wait on the PostgreSQL advisory lock");
      const finalizerError = finalizerResults.find((result) => result.status === "rejected");
      if (finalizerError?.status === "rejected") throw finalizerError.reason;

      const savedStandings = await firstPool.query(
        `SELECT participant.installation_id,participant.leaderboard_opted_in,
                participant.final_result,entry.participant_token,entry.return_percent,
                snapshot.rank,snapshot.is_final
         FROM event_arena_lightning_participants AS participant
         LEFT JOIN event_arena_leaderboard_entries AS entry
           ON entry.event_id=participant.event_id AND entry.installation_id=participant.installation_id
         LEFT JOIN event_arena_leaderboard_snapshots AS snapshot
           ON snapshot.event_id=entry.event_id AND snapshot.participant_token=entry.participant_token
         WHERE participant.event_id=$1
         ORDER BY participant.installation_id`,
        [standingsIds.event],
      );
      assert.equal(savedStandings.rows.length, standingsIds.participants.length);
      const expectedTiedOrder = standingsIds.participants
        .filter((participant) => participant.optedIn)
        .map((participant) => participant.installationId)
        .sort();
      const tiedRanks: number[] = [];
      for (const row of savedStandings.rows) {
        const participant = standingsIds.participants.find((item) => item.installationId === row.installation_id);
        assert.ok(participant);
        assert.ok(row.final_result, "each entered participant should have a persisted personal result");
        assert.deepEqual(row.final_result.finalPrices, { [participant.symbol]: participant.price });
        if (participant.optedIn) {
          assert.ok(row.participant_token);
          assert.ok(row.is_final);
          const expectedRank = expectedTiedOrder.indexOf(participant.installationId) + 1;
          tiedRanks.push(Number(row.final_result.finalRank));
          assert.equal(Number(row.final_result.finalRank), expectedRank);
          assert.equal(Number(row.rank), Number(row.final_result.finalRank));
          assert.equal(Number(row.return_percent), 0.02);
        } else {
          assert.equal(row.participant_token, null, "opted-out participants must not be published");
          assert.equal(row.final_result.finalRank, null);
        }
      }
      assert.deepEqual(tiedRanks.sort(), [1, 2], "equal returns must receive stable, distinct ranks");
      assert.equal(
        Number((await firstPool.query(
          `SELECT COUNT(*)::int AS count FROM event_arena_leaderboard_snapshots
           WHERE event_id=$1 AND is_final=TRUE`,
          [standingsIds.event],
        )).rows[0].count),
        2,
        "only opted-in participants should receive one final snapshot each",
      );
      const frozenResults = savedStandings.rows.map((row) => ({
        installationId: row.installation_id,
        finalResult: row.final_result,
        rank: row.rank,
        returnPercent: row.return_percent,
      }));

      const finalRetry = await processDueLightningRoundOrders(
        executionDatabase(recoveryPool),
        {
          now: () => standingsEndAt + 60_000,
          makeId: randomUUID,
          fetchPrice: async () => 999,
        },
      );
      assert.equal(finalRetry.events, 0, "a finalized event must not be reprocessed");
      const retryStandings = await firstPool.query(
        `SELECT participant.installation_id,participant.final_result,snapshot.rank,entry.return_percent
         FROM event_arena_lightning_participants AS participant
         LEFT JOIN event_arena_leaderboard_entries AS entry
           ON entry.event_id=participant.event_id AND entry.installation_id=participant.installation_id
         LEFT JOIN event_arena_leaderboard_snapshots AS snapshot
           ON snapshot.event_id=entry.event_id AND snapshot.participant_token=entry.participant_token
         WHERE participant.event_id=$1
         ORDER BY participant.installation_id`,
        [standingsIds.event],
      );
      assert.deepEqual(retryStandings.rows.map((row) => ({
        installationId: row.installation_id,
        finalResult: row.final_result,
        rank: row.rank,
        returnPercent: row.return_percent,
      })), frozenResults, "later quotes must not alter frozen results or ranks");

      const activeTieEventId = `lr-active-tie-${randomUUID()}`;
      const activeTieParticipants = [
        { installationId: `active-tie-a-${randomUUID()}`, symbol: "AAPL", alias: "Zulu" },
        { installationId: `active-tie-b-${randomUUID()}`, symbol: "MSFT", alias: "Alpha" },
      ].sort((a, b) => a.installationId.localeCompare(b.installationId));
      activeTieParticipants[0]!.alias = "Zulu";
      activeTieParticipants[1]!.alias = "Alpha";
      await firstPool.query(
        `INSERT INTO event_arena_events
          (event_id,event_type,artwork_id,starting_balance,ranking_direction,event_start_at,event_end_at)
         VALUES ($1,'lightning-round','stadium',100000,'highest-return',$2,$3)`,
        [activeTieEventId, new Date(startAt), new Date(endAt)],
      );
      for (const participant of activeTieParticipants) {
        const participantAccountId = `active-tie-account-${randomUUID()}`;
        await firstPool.query(
          `INSERT INTO event_arena_lightning_participants
            (event_id,installation_id,account_id,alias,status,leaderboard_opted_in,event_start_at,event_end_at)
           VALUES ($1,$2,$3,$4,'entered',TRUE,$5,$6)`,
          [
            activeTieEventId,
            participant.installationId,
            participantAccountId,
            participant.alias,
            new Date(startAt),
            new Date(endAt),
          ],
        );
        await firstPool.query(
          `INSERT INTO paper_transactions
            (id,user_id,account_id,symbol,company_name,action,shares,price,total,date,lightning_round_event_id)
           VALUES ($1,$2,$3,$4,$4,'BUY',2,100,200,$5,$6)`,
          [
            `active-tie-transaction-${randomUUID()}`,
            participant.installationId,
            participantAccountId,
            participant.symbol,
            new Date(startAt + 1000),
            activeTieEventId,
          ],
        );
      }
      const processActiveTie = (
        pool: InstanceType<typeof Pool>,
        capturedAt: number,
      ) => processDueLightningRoundOrders(executionDatabase(pool), {
        now: () => capturedAt,
        makeId: randomUUID,
        fetchPrice: async () => 110,
      });
      await processActiveTie(firstPool, now);
      const firstActiveTieSnapshots = await firstPool.query(
        `SELECT participant.installation_id,snapshot.rank
         FROM event_arena_leaderboard_snapshots AS snapshot
         JOIN event_arena_leaderboard_entries AS entry
           ON entry.event_id=snapshot.event_id AND entry.participant_token=snapshot.participant_token
         JOIN event_arena_lightning_participants AS participant
           ON participant.event_id=entry.event_id AND participant.installation_id=entry.installation_id
         WHERE snapshot.event_id=$1 AND snapshot.is_final=FALSE
         ORDER BY participant.installation_id`,
        [activeTieEventId],
      );
      assert.deepEqual(
        firstActiveTieSnapshots.rows.map((row) => ({
          installationId: row.installation_id,
          rank: Number(row.rank),
        })),
        activeTieParticipants.map((participant, index) => ({
          installationId: participant.installationId,
          rank: index + 1,
        })),
      );

      await firstPool.query(
        `UPDATE event_arena_lightning_participants SET alias=$3
         WHERE event_id=$1 AND installation_id=$2`,
        [activeTieEventId, activeTieParticipants[0]!.installationId, "Alpha"],
      );
      await firstPool.query(
        `UPDATE event_arena_lightning_participants SET alias=$3
         WHERE event_id=$1 AND installation_id=$2`,
        [activeTieEventId, activeTieParticipants[1]!.installationId, "Zulu"],
      );
      await processActiveTie(secondPool, now + 6 * 60_000);
      const repeatedActiveTieSnapshots = await firstPool.query(
        `SELECT participant.installation_id,snapshot.rank
         FROM event_arena_leaderboard_snapshots AS snapshot
         JOIN event_arena_leaderboard_entries AS entry
           ON entry.event_id=snapshot.event_id AND entry.participant_token=snapshot.participant_token
         JOIN event_arena_lightning_participants AS participant
           ON participant.event_id=entry.event_id AND participant.installation_id=entry.installation_id
         WHERE snapshot.event_id=$1 AND snapshot.is_final=FALSE
         ORDER BY participant.installation_id`,
        [activeTieEventId],
      );
      assert.deepEqual(
        repeatedActiveTieSnapshots.rows.map((row) => ({
          installationId: row.installation_id,
          rank: Number(row.rank),
        })),
        firstActiveTieSnapshots.rows.map((row) => ({
          installationId: row.installation_id,
          rank: Number(row.rank),
        })),
        "tied ranks should remain tied to the same participants on another worker connection",
      );
      assert.equal(
        repeatedActiveTieSnapshots.rows.length,
        2,
        "an unchanged tie must not create duplicate history snapshots",
      );

      const apiParticipant = standingsIds.participants.find((participant) => participant.optedIn)!;
      const readFrozenResult = () => firstPool.query(
        `SELECT participant.final_result,snapshot.rank
         FROM event_arena_lightning_participants AS participant
         JOIN event_arena_leaderboard_entries AS entry
           ON entry.event_id=participant.event_id AND entry.installation_id=participant.installation_id
         JOIN event_arena_leaderboard_snapshots AS snapshot
           ON snapshot.event_id=entry.event_id AND snapshot.participant_token=entry.participant_token
         WHERE participant.event_id=$1 AND participant.installation_id=$2 AND snapshot.is_final=TRUE`,
        [standingsIds.event, apiParticipant.installationId],
      );
      const frozenBeforeApiRead = await readFrozenResult();
      assert.equal(frozenBeforeApiRead.rows.length, 1);

      const app = express();
      app.use(express.json());
      app.use(createEventArenaRouter(
        firstPool,
        (_req, _res, next) => next(),
        () => standingsEndAt + 60_000,
      ));
      const server = app.listen(0);
      await once(server, "listening");
      try {
        const address = server.address();
        assert.ok(address && typeof address === "object");
        const response = await fetch(
          `http://127.0.0.1:${address.port}/event-arena/lightning-round/${standingsIds.event}/state`,
          { headers: { "x-event-arena-installation-id": apiParticipant.installationId } },
        );
        assert.equal(response.status, 200);
        const payload = await response.json() as any;
        assert.deepEqual(payload.participant.finalResult.finalPrices, {
          [apiParticipant.symbol]: apiParticipant.price,
        });
        assert.equal(payload.participant.finalResult.finalRank, frozenBeforeApiRead.rows[0].rank);
        assert.deepEqual(await readFrozenResult(), frozenBeforeApiRead);

        const unauthorizedResponse = await fetch(
          `http://127.0.0.1:${address.port}/event-arena/lightning-round/${standingsIds.event}/state`,
          { headers: { "x-event-arena-installation-id": `different-${randomUUID()}` } },
        );
        assert.equal(unauthorizedResponse.status, 404);
        const unauthorizedPayload = await unauthorizedResponse.json();
        assert.deepEqual(unauthorizedPayload, {
          error: "Lightning Round participation was not found.",
        });
        assert.equal(JSON.stringify(unauthorizedPayload).includes(apiParticipant.installationId), false);
        assert.equal(JSON.stringify(unauthorizedPayload).includes(apiParticipant.symbol), false);
        assert.deepEqual(await readFrozenResult(), frozenBeforeApiRead);
      } finally {
        server.close();
        await once(server, "close");
      }

      assert.equal(
        Number((await firstPool.query(
          `SELECT COUNT(*)::int AS count FROM event_arena_leaderboard_snapshots
           WHERE event_id=$1 AND is_final=TRUE`,
          [standingsIds.event],
        )).rows[0].count),
        2,
        "retries must leave exactly one final snapshot per opted-in participant",
      );
    } finally {
      await Promise.all([
        firstPool?.end(),
        secondPool?.end(),
        recoveryPool?.end(),
      ]);
      if (schemaCreated) {
        await adminPool.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
      }
      await adminPool.end();
    }
  },
);
