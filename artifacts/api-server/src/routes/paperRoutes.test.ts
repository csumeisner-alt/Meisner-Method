import assert from "node:assert/strict";
import { once } from "node:events";
import express from "express";
import test from "node:test";
import { createPaperRouter } from "./paperRoutes.ts";

class MemoryPaperDatabase {
  metadata = new Map<string, any>();
  tokens = new Map<string, string>();
  codes = new Map<string, any>();
  accounts: any[] = [];
  positions: any[] = [];
  transactions: any[] = [];
  orders: any[] = [];
  lots: any[] = [];

  async connect() {
    return { query: this.query.bind(this), release() {} };
  }

  async query(sql: string, values: any[] = []) {
    const query = sql.replace(/\s+/g, " ").trim();
    if (query === "BEGIN" || query === "COMMIT" || query === "ROLLBACK"
      || query.startsWith("SELECT pg_advisory_xact_lock")) return { rows: [] };
    if (query.startsWith("SELECT sync_id FROM event_arena_device_sync_tokens")) {
      const syncId = this.tokens.get(values[0]);
      return { rows: syncId ? [{ sync_id: syncId }] : [] };
    }
    if (query.startsWith("INSERT INTO event_arena_device_sync (")) {
      this.metadata.set(values[0], {
        source_installation_id: values[1],
        revision: 0,
        challenge_store: JSON.parse(values[2]),
      });
      return { rows: [] };
    }
    if (query.startsWith("INSERT INTO event_arena_device_sync_tokens")) {
      this.tokens.set(values[0], values[1]);
      return { rows: [] };
    }
    if (query.startsWith("SELECT source_installation_id,revision FROM event_arena_device_sync")) {
      const row = this.metadata.get(values[0]);
      return { rows: row ? [row] : [] };
    }
    if (query.startsWith("SELECT source_installation_id,revision,challenge_store FROM event_arena_device_sync")) {
      const row = this.metadata.get(values[0]);
      return { rows: row ? [row] : [] };
    }
    if (query.startsWith("UPDATE event_arena_device_sync SET revision=")) {
      const row = this.metadata.get(values[0]);
      if (row) {
        row.revision = Number(values[1]);
        row.challenge_store = JSON.parse(values[2]);
      }
      return { rows: [] };
    }
    if (query.startsWith("DELETE FROM event_arena_device_pairing_codes")) return { rows: [] };
    if (query.startsWith("INSERT INTO event_arena_device_pairing_codes")) {
      this.codes.set(values[0], {
        sync_id: values[1],
        expires_at: new Date(values[2]),
        consumed_at: null,
        redeemed_token_hash: null,
      });
      return { rows: [] };
    }
    if (query.startsWith("SELECT sync_id,expires_at,consumed_at,redeemed_token_hash")) {
      const row = this.codes.get(values[0]);
      return { rows: row ? [row] : [] };
    }
    if (query.startsWith("UPDATE event_arena_device_pairing_codes SET consumed_at=")) {
      const row = this.codes.get(values[0]);
      if (row) {
        row.consumed_at = new Date();
        row.redeemed_token_hash = values[1];
      }
      return { rows: [] };
    }
    if (query.startsWith("DELETE FROM paper_accounts")) {
      this.accounts = this.accounts.filter((row) => row.user_id !== values[0]);
      return { rows: [] };
    }
    if (query.startsWith("INSERT INTO paper_accounts")) {
      this.accounts.push({
        id: values[0], user_id: values[1], name: values[2], cash: values[3],
        short_collateral: values[4], short_collateral_ratio: values[5], created_at: new Date(values[6]),
        unsettled_items: JSON.parse(values[7]), last_dividend_credit: values[8],
      });
      return { rows: [] };
    }
    if (query.startsWith("DELETE FROM paper_positions")) {
      this.positions = this.positions.filter((row) => row.user_id !== values[0]);
      return { rows: [] };
    }
    if (query.startsWith("INSERT INTO paper_positions")) {
      this.positions.push({
        id: values[0], user_id: values[1], account_id: values[2], symbol: values[3],
        company_name: values[4], shares: values[5], avg_cost: values[6], position_type: values[7],
        asset_type: values[8], collateral_per_share: values[9], opened_at: new Date(values[10]), dividend_yield: values[11],
        dividend_rate: values[12], expense_ratio: values[13], sector: values[14],
      });
      return { rows: [] };
    }
    if (query.startsWith("DELETE FROM paper_transactions")) {
      this.transactions = this.transactions.filter((row) => row.user_id !== values[0]);
      return { rows: [] };
    }
    if (query.startsWith("INSERT INTO paper_transactions")) {
      this.transactions.push({
        id: values[0], user_id: values[1], account_id: values[2], symbol: values[3],
        company_name: values[4], action: values[5], shares: values[6], price: values[7],
        total: values[8], date: new Date(values[9]), realized_pnl: values[10], fee: values[11],
        asset_type: values[12], cash_delta: values[13], short_collateral_delta: values[14], lightning_round_event_id: values[15],
      });
      return { rows: [] };
    }
    if (query.startsWith("DELETE FROM paper_orders")) {
      this.orders = this.orders.filter((row) => row.user_id !== values[0]);
      return { rows: [] };
    }
    if (query.startsWith("INSERT INTO paper_orders")) {
      this.orders.push({
        id: values[0], user_id: values[1], account_id: values[2], symbol: values[3],
        company_name: values[4], order_type: values[5], side: values[6], intent: values[7],
        short_collateral_ratio: values[8], shares: values[9], limit_price: values[10],
        stop_price: values[11], trail_pct: values[12], trail_abs: values[13], trail_ref: values[14],
        status: values[15], filled_price: values[16], filled_at: values[17], placed_at: new Date(values[18]),
        lightning_round_event_id: values[19], rejection_reason: values[20], asset_type: values[21],
        dividend_yield: values[22], dividend_rate: values[23], expense_ratio: values[24], sector: values[25],
      });
      return { rows: [] };
    }
    if (query.startsWith("DELETE FROM paper_lots")) {
      this.lots = this.lots.filter((row) => row.user_id !== values[0]);
      return { rows: [] };
    }
    if (query.startsWith("INSERT INTO paper_lots")) {
      this.lots.push({
        id: values[0], user_id: values[1], account_id: values[2], symbol: values[3],
        shares: values[4], cost: values[5], purchased_at: new Date(values[6]),
      });
      return { rows: [] };
    }
    if (query.startsWith("SELECT id,name,cash,short_collateral,short_collateral_ratio")) {
      return { rows: this.accounts.filter((row) => row.user_id === values[0]) };
    }
    if (query.startsWith("SELECT id,account_id,symbol,company_name,shares,avg_cost,position_type")) {
      return { rows: this.positions.filter((row) => row.user_id === values[0]) };
    }
    if (query.startsWith("SELECT id,account_id,symbol,company_name,action,shares,price,total,date")) {
      return { rows: this.transactions.filter((row) => row.user_id === values[0]) };
    }
    if (query.startsWith("SELECT id,account_id,symbol,company_name,order_type,side,intent")) {
      return { rows: this.orders.filter((row) => row.user_id === values[0]) };
    }
    if (query.startsWith("SELECT id,account_id,symbol,shares,cost,purchased_at")) {
      return { rows: this.lots.filter((row) => row.user_id === values[0]) };
    }
    throw new Error(`Unimplemented SQL in test: ${query}`);
  }
}

async function withApi(run: (baseUrl: string, db: MemoryPaperDatabase) => Promise<void>) {
  const app = express();
  app.use(express.json());
  const db = new MemoryPaperDatabase();
  app.use(createPaperRouter(db, (_req, _res, next) => next()));
  const server = app.listen(0);
  await once(server, "listening");
  const address = server.address();
  assert.ok(address && typeof address === "object");
  try {
    await run(`http://127.0.0.1:${address.port}`, db);
  } finally {
    server.close();
    await once(server, "close");
  }
}

const sourceToken = "a".repeat(64);
const targetToken = "b".repeat(64);
const sourceInstallationId = "installation-id-source-123";
const snapshot = {
  sourceInstallationId,
  accounts: [{
    id: "paper-event:2026-11-16", name: "Event Arena", cash: 91_000,
    createdAt: "2026-11-16T00:00:00.000Z",
  }],
  positions: [],
  transactions: [{
    id: "lr-fill-1", accountId: "paper-event:2026-11-16", symbol: "AAPL",
    action: "BUY", shares: 2, price: 100, total: 200, date: "2026-11-20T15:00:00.000Z",
    lightningRoundEventId: "lightning-2026-11-20",
  }],
  orders: [{
    id: "lr-order-1", accountId: "paper-event:2026-11-16", symbol: "AAPL",
    orderType: "market", side: "buy", shares: 2, status: "pending",
    placedAt: "2026-11-20T14:00:00.000Z", lightningRoundEventId: "lightning-2026-11-20",
  }],
  lots: [],
  challengeStore: {
    enrollment: null,
    lightningEnrollment: null,
    history: [{
      eventId: "2026-11-16",
      accountId: "paper-event:2026-11-16",
      tradingFingerprintObservation: {
        version: 1,
        observationId: "positive-trade-consistency",
        headline: "Your results came from consistency",
        supportingSentence: "3 of 3 trades with reported realized results were profitable (100%).",
        score: 87.5,
        scoreParts: { magnitude: 1, uniqueness: 1, reliability: 0.375 },
        evidence: { positiveTradeCount: 3, realizedTradeCount: 3, positiveTradeSharePercent: 100 },
      },
    }],
  },
};

test("pairing restores paper state once and retains Lightning Round order identity", async () => {
  await withApi(async (baseUrl) => {
    const create = await fetch(`${baseUrl}/event-arena/device-pairing`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-event-arena-device-token": sourceToken,
      },
      body: JSON.stringify({ snapshot }),
    });
    assert.equal(create.status, 200);
    const pairing = await create.json() as { code: string; revision: number };
    assert.equal(pairing.revision, 1);
    assert.equal(pairing.code.length, 32);

    const restore = () => fetch(`${baseUrl}/event-arena/device-pairing/redeem`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ code: pairing.code, deviceToken: targetToken }),
    });
    const restored = await restore();
    assert.equal(restored.status, 200);
    const body = await restored.json() as any;
    assert.equal(body.revision, 1);
    assert.equal(body.snapshot.accounts[0].cash, 91_000);
    assert.equal(body.snapshot.transactions[0].lightningRoundEventId, "lightning-2026-11-20");
    assert.equal(body.snapshot.orders[0].id, "lr-order-1");
    assert.equal(body.snapshot.orders[0].status, "pending");
    assert.equal(body.snapshot.orders[0].lightningRoundEventId, "lightning-2026-11-20");
    assert.equal(body.snapshot.challengeStore.history[0].eventId, "2026-11-16");
    assert.equal(
      body.snapshot.challengeStore.history[0].tradingFingerprintObservation.supportingSentence,
      "3 of 3 trades with reported realized results were profitable (100%).",
    );

    assert.equal((await restore()).status, 200);
    const secondDevice = await fetch(`${baseUrl}/event-arena/device-pairing/redeem`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ code: pairing.code, deviceToken: "c".repeat(64) }),
    });
    assert.equal(secondDevice.status, 409);
  });
});

test("revision conflicts do not overwrite the shared Event Arena account", async () => {
  await withApi(async (baseUrl) => {
    const create = await fetch(`${baseUrl}/event-arena/device-pairing`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-event-arena-device-token": sourceToken },
      body: JSON.stringify({ snapshot }),
    });
    const { code } = await create.json() as { code: string };
    const restored = await fetch(`${baseUrl}/event-arena/device-pairing/redeem`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ code, deviceToken: targetToken }),
    });
    assert.equal(restored.status, 200);
    const changedSnapshot = {
      ...snapshot,
      accounts: [{ ...snapshot.accounts[0], cash: 80_000 }],
      orders: [{ ...snapshot.orders[0], status: "filled", filledPrice: 101 }],
    };
    const update = () => fetch(`${baseUrl}/event-arena/device-sync`, {
      method: "PUT",
      headers: {
        "content-type": "application/json",
        "x-event-arena-device-token": targetToken,
        "x-event-arena-revision": "1",
      },
      body: JSON.stringify({ snapshot: changedSnapshot }),
    });
    assert.equal((await update()).status, 200);
    assert.equal((await update()).status, 409);
    const latest = await fetch(`${baseUrl}/event-arena/device-sync`, {
      headers: { "x-event-arena-device-token": sourceToken },
    });
    const state = await latest.json() as any;
    assert.equal(state.revision, 2);
    assert.equal(state.snapshot.accounts[0].cash, 80_000);
    assert.equal(state.snapshot.orders[0].status, "filled");
    assert.equal(state.snapshot.orders[0].lightningRoundEventId, "lightning-2026-11-20");
    assert.equal(
      state.snapshot.challengeStore.history[0].tradingFingerprintObservation.headline,
      "Your results came from consistency",
    );
  });
});

test("invalid snapshots are rejected before creating a paired account", async () => {
  await withApi(async (baseUrl, db) => {
    const invalid = await fetch(`${baseUrl}/event-arena/device-pairing`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-event-arena-device-token": sourceToken },
      body: JSON.stringify({ snapshot: { ...snapshot, accounts: [{ ...snapshot.accounts[0], id: "personal" }] } }),
    });
    assert.equal(invalid.status, 400);
    assert.equal(db.metadata.size, 0);
  });
});

test("device sync rejects duplicate order and execution IDs instead of storing duplicate effects", async () => {
  await withApi(async (baseUrl, db) => {
    for (const invalidSnapshot of [
      {
        ...snapshot,
        transactions: [snapshot.transactions[0], { ...snapshot.transactions[0], symbol: "TSLA" }],
      },
      {
        ...snapshot,
        orders: [snapshot.orders[0], { ...snapshot.orders[0], symbol: "TSLA" }],
      },
    ]) {
      const response = await fetch(`${baseUrl}/event-arena/device-pairing`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-event-arena-device-token": sourceToken },
        body: JSON.stringify({ snapshot: invalidSnapshot }),
      });
      assert.equal(response.status, 400);
    }
    assert.equal(db.metadata.size, 0, "invalid duplicate identities must not create server snapshots");
  });
});

test("One-Stock Challenge server snapshots allow one eligible holding and reject bypasses", async () => {
  const accountId = "paper-event:2027-02-08";
  const enrollment = {
    eventId: "2027-02-08",
    eventType: "one-stock-challenge",
    accountId,
    eventStartAtMs: Date.parse("2027-02-08T14:30:00.000Z"),
    eventEndAtMs: Date.parse("2027-02-12T21:00:00.000Z"),
  };
  const base = {
    ...snapshot,
    accounts: [{ ...snapshot.accounts[0], id: accountId }],
    positions: [],
    transactions: [],
    orders: [],
    lots: [],
    challengeStore: { enrollment, lightningEnrollment: null, history: [] },
  };
  const buy = (id: string, symbol: string, shares: number, assetType: "stock" | "etf" = "stock") => ({
    id,
    accountId,
    symbol,
    companyName: symbol,
    action: "BUY",
    shares,
    price: 100,
    total: shares * 100,
    date: "2027-02-08T15:00:00.000Z",
    assetType,
  });
  const sell = (id: string, symbol: string, shares: number) => ({
    id,
    accountId,
    symbol,
    companyName: symbol,
    action: "SELL",
    shares,
    price: 110,
    total: shares * 110,
    date: "2027-02-08T16:00:00.000Z",
    assetType: "stock",
  });
  const position = (symbol: string, shares: number, assetType: "stock" | "etf" = "stock") => ({
    id: `position-${symbol}`,
    accountId,
    symbol,
    companyName: symbol,
    shares,
    avgCost: 100,
    assetType,
    openedAt: "2027-02-08T15:00:00.000Z",
  });
  const validStates = [
    { transactions: [buy("first-stock", "AAPL", 2)], positions: [position("AAPL", 2)] },
    { transactions: [buy("first-etf", "VOO", 2, "etf")], positions: [position("VOO", 2, "etf")] },
    { transactions: [buy("add-one", "AAPL", 2), buy("add-two", "AAPL", 1)], positions: [position("AAPL", 3)] },
    { transactions: [buy("partial-buy", "AAPL", 3), sell("partial-sell", "AAPL", 1)], positions: [position("AAPL", 2)] },
    {
      transactions: [
        buy("close-buy", "AAPL", 2),
        sell("close-sell", "AAPL", 2),
        { ...buy("switch-buy", "VOO", 1, "etf"), date: "2027-02-08T17:00:00.000Z" },
      ],
      positions: [position("VOO", 1, "etf")],
    },
  ];
  const invalidStates = [
    {
      transactions: [buy("two-a", "AAPL", 1), buy("two-b", "MSFT", 1)],
      positions: [position("AAPL", 1), { ...position("MSFT", 1), id: "position-MSFT" }],
      orders: [],
    },
    {
      transactions: [buy("pending-a", "AAPL", 1)],
      positions: [position("AAPL", 1)],
      orders: [{
        id: "pending-other", accountId, symbol: "MSFT", companyName: "MSFT",
        orderType: "limit", side: "buy", assetType: "stock", shares: 1,
        status: "pending", placedAt: "2027-02-08T16:00:00.000Z",
      }],
    },
    {
      transactions: [{
        ...buy("short", "AAPL", 1),
        action: "SHORT_SELL",
      }],
      positions: [{ ...position("AAPL", 1), positionType: "short" }],
      orders: [],
    },
    {
      transactions: [{ ...buy("unknown-asset", "XYZ", 1, "stock"), assetType: "unknown" }],
      positions: [{ ...position("XYZ", 1, "stock"), assetType: "unknown" }],
      orders: [],
    },
  ];

  await withApi(async (baseUrl, db) => {
    for (const [index, state] of validStates.entries()) {
      const response = await fetch(`${baseUrl}/event-arena/device-pairing`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-event-arena-device-token": String(index + 1).padStart(64, "0"),
        },
        body: JSON.stringify({ snapshot: { ...base, ...state, sourceInstallationId: `${sourceInstallationId}-${index}` } }),
      });
      assert.equal(response.status, 200, `valid one-stock state ${index} should sync`);
    }
    for (const [index, state] of invalidStates.entries()) {
      const response = await fetch(`${baseUrl}/event-arena/device-pairing`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-event-arena-device-token": String(index + 20).padStart(64, "0"),
        },
        body: JSON.stringify({ snapshot: { ...base, ...state, sourceInstallationId: `${sourceInstallationId}-invalid-${index}` } }),
      });
      assert.equal(response.status, 400, `invalid one-stock state ${index} must be rejected by the server`);
    }
    assert.equal(db.metadata.size, validStates.length, "invalid trades must not create server snapshots");
  });
});
