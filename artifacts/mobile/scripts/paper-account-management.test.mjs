import test from "node:test";
import assert from "node:assert/strict";
import {
  getAdjacentPaperAccountId,
  renamePaperAccount,
  resetPaperAccountData,
} from "../lib/paperAccountManagement.ts";
import { computePaperEquity, INITIAL_BALANCE } from "../lib/paperMath.ts";

const accounts = [
  { id: "tiger", name: "Tiger", cash: 100_000, createdAt: "2026-01-01T00:00:00.000Z" },
  { id: "borg", name: "Borg", cash: 100_000, createdAt: "2026-01-01T00:00:00.000Z" },
  { id: "fireball", name: "Fireball", cash: 100_000, createdAt: "2026-01-01T00:00:00.000Z" },
];

test("account swipes preserve ordering and stop at either carousel boundary", () => {
  assert.equal(getAdjacentPaperAccountId(accounts, "tiger", -1), "tiger");
  assert.equal(getAdjacentPaperAccountId(accounts, "tiger", 1), "borg");
  assert.equal(getAdjacentPaperAccountId(accounts, "borg", -1), "tiger");
  assert.equal(getAdjacentPaperAccountId(accounts, "borg", 1), "fireball");
  assert.equal(getAdjacentPaperAccountId(accounts, "fireball", 1), "fireball");
  assert.equal(getAdjacentPaperAccountId([], "tiger", 1), null);
});

test("renaming changes only the requested account and ignores blank names", () => {
  const renamed = renamePaperAccount(accounts, "borg", "  Long Term  ");
  assert.deepEqual(renamed.map(({ id, name }) => ({ id, name })), [
    { id: "tiger", name: "Tiger" },
    { id: "borg", name: "Long Term" },
    { id: "fireball", name: "Fireball" },
  ]);
  assert.equal(renamePaperAccount(accounts, "borg", "  "), accounts);
  assert.deepEqual(accounts[1], { id: "borg", name: "Borg", cash: 100_000, createdAt: "2026-01-01T00:00:00.000Z" });
});

test("reset removes only the selected account's trades and restores its cash", () => {
  const position = (id, accountId) => ({ id, accountId, symbol: "VOO" });
  const data = {
    accounts: accounts.map((account) => ({
      ...account,
      cash: 12_000,
      unsettledCash: 400,
      unsettledItems: [{ amount: 400, settlesAt: "2026-01-03T00:00:00.000Z" }],
    })),
    positions: [position("p1", "tiger"), position("p2", "borg")],
    transactions: [{ id: "t1", accountId: "tiger" }, { id: "t2", accountId: "borg" }],
    orders: [{ id: "o1", accountId: "tiger" }, { id: "o2", accountId: "borg" }],
    lots: [{ id: "l1", accountId: "tiger" }, { id: "l2", accountId: "borg" }],
  };

  const reset = resetPaperAccountData(data, "tiger", "2026-11-14T12:00:00.000Z");

  assert.deepEqual(reset.accounts[0], {
    ...data.accounts[0],
    cash: 100_000,
    unsettledCash: 0,
    unsettledItems: [],
    shortCollateral: 0,
    createdAt: "2026-11-14T12:00:00.000Z",
  });
  assert.deepEqual(reset.accounts[1], data.accounts[1]);
  assert.deepEqual(reset.positions, [data.positions[1]]);
  assert.deepEqual(reset.transactions, [data.transactions[1]]);
  assert.deepEqual(reset.orders, [data.orders[1]]);
  assert.deepEqual(reset.lots, [data.lots[1]]);
});

test("resetting one strategy returns only it to zero and preserves other account returns", () => {
  const data = {
    accounts: [
      { id: "tiger", name: "Tiger", cash: 95_000, createdAt: "2026-11-01T00:00:00.000Z" },
      { id: "borg", name: "Borg", cash: 90_000, createdAt: "2026-11-01T00:00:00.000Z" },
      { id: "fireball", name: "Fireball", cash: 80_000, createdAt: "2026-11-01T00:00:00.000Z" },
      { id: "paper-event:arena", name: "Event Arena", cash: 95_000, createdAt: "2026-11-01T00:00:00.000Z" },
    ],
    positions: [
      { id: "tiger-position", accountId: "tiger", symbol: "TIG", shares: 50, avgCost: 100 },
      { id: "borg-position", accountId: "borg", symbol: "BOR", shares: 25, avgCost: 100 },
      { id: "fireball-position", accountId: "fireball", symbol: "FIR", shares: 200, avgCost: 100 },
      { id: "event-position", accountId: "paper-event:arena", symbol: "EVT", shares: 25, avgCost: 100 },
    ],
    transactions: [],
    orders: [],
    lots: [],
  };
  const quotes = {
    TIG: { price: 225 },
    BOR: { price: 100 },
    FIR: { price: 250 },
    EVT: { price: 250 },
  };
  const accountReturn = (account, positions) => (
    (computePaperEquity(
      account,
      positions.filter((position) => position.accountId === account.id),
      quotes,
    ) - INITIAL_BALANCE) / INITIAL_BALANCE
  ) * 100;
  const reset = resetPaperAccountData(data, "tiger", "2026-11-14T12:00:00.000Z");

  assert.equal(accountReturn(reset.accounts[0], reset.positions), 0);
  assert.equal(accountReturn(reset.accounts[1], reset.positions), -7.5);
  assert.equal(accountReturn(reset.accounts[2], reset.positions), 30);
  assert.equal(accountReturn(reset.accounts[3], reset.positions), 1.25);
  assert.deepEqual(
    reset.positions.map((position) => position.accountId),
    ["borg", "fireball", "paper-event:arena"],
  );
  assert.equal(data.positions.length, 4, "Reset must not mutate the saved source data.");
});
