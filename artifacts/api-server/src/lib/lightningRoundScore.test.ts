import assert from "node:assert/strict";
import test from "node:test";
import { calculateLightningRoundScore } from "./lightningRoundScore.ts";

const sameTime = "2026-11-27T14:31:00.000Z";

test("same-time buy then sell keeps persisted fill order and leaves no holding", () => {
  const fills = [
    {
      symbol: "AAPL",
      action: "BUY",
      shares: 10,
      price: 100,
      total: 1_000,
      date: sameTime,
    },
    {
      symbol: "AAPL",
      action: "SELL",
      shares: 10,
      price: 110,
      total: 1_100,
      date: sameTime,
    },
  ];

  const firstRead = calculateLightningRoundScore(fills, {}, 10_000);
  const repeatedRead = calculateLightningRoundScore(fills, {}, 10_000);

  assert.ok(firstRead);
  assert.deepEqual(repeatedRead, firstRead);
  assert.equal(firstRead.cashBalance, 10_100);
  assert.equal(firstRead.equity, 10_100);
  assert.deepEqual(firstRead.finalPositions, []);
  assert.deepEqual(firstRead.holdings, []);
});

test("same-time sell then buy keeps persisted fill order and rebuilds the remaining holding", () => {
  const fills = [
    {
      symbol: "AAPL",
      action: "BUY",
      shares: 10,
      price: 50,
      total: 500,
      date: "2026-11-27T14:30:00.000Z",
    },
    {
      symbol: "AAPL",
      action: "SELL",
      shares: 10,
      price: 60,
      total: 600,
      date: sameTime,
    },
    {
      symbol: "AAPL",
      action: "BUY",
      shares: 5,
      price: 70,
      total: 350,
      date: sameTime,
    },
  ];

  const firstRead = calculateLightningRoundScore(fills, { AAPL: 80 }, 10_000);
  const repeatedRead = calculateLightningRoundScore(fills, { AAPL: 80 }, 10_000);

  assert.ok(firstRead);
  assert.deepEqual(repeatedRead, firstRead);
  assert.equal(firstRead.cashBalance, 9_750);
  assert.equal(firstRead.equity, 10_150);
  assert.deepEqual(firstRead.finalPositions, [{
    symbol: "AAPL",
    companyName: "AAPL",
    shares: 5,
    avgCost: 70,
    marketPrice: 80,
    marketValue: 400,
    unrealizedPnL: 50,
  }]);
});
