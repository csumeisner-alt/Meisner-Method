import { readFileSync } from "node:fs";
import { test } from "node:test";
import assert from "node:assert/strict";

const source = readFileSync(new URL("./user.ts", import.meta.url), "utf8");

test("paper schema adds short fields without changing legacy positions", () => {
  assert.match(source, /\["paper_positions", "position_type", "TEXT NOT NULL DEFAULT 'long'"\]/);
  assert.match(source, /\["paper_positions", "collateral_per_share", "DOUBLE PRECISION"\]/);
  assert.match(source, /\["paper_accounts", "short_collateral", "DOUBLE PRECISION NOT NULL DEFAULT 0"\]/);
  assert.match(source, /\["paper_orders", "intent", "TEXT"\]/);
  assert.match(source, /\["paper_transactions", "cash_delta", "DOUBLE PRECISION"\]/);
});

test("paper sync normalizes short state and keeps account identities on every record", () => {
  assert.match(source, /positionType: p\.positionType === 'short' \? 'short' : 'long'/);
  assert.match(source, /collateralPerShare:[\s\S]*?reqNumber\(p\.collateralPerShare/);
  assert.match(source, /shortCollateral: optNumber\(a\.shortCollateral[\s\S]*?shortCollateralRatio: optNumber/);
  assert.match(source, /intent: o\.intent === 'short' \|\| o\.intent === 'cover' \? o\.intent : null/);
  assert.match(source, /shortCollateralRatio:[\s\S]*?reqNumber\(o\.shortCollateralRatio/);
  assert.match(source, /cashDelta:[\s\S]*?shortCollateralDelta:/);
  assert.match(source, /accountId: reqString\(p\.accountId/);
  assert.match(source, /accountId: reqString\(t\.accountId/);
  assert.match(source, /accountId: reqString\(o\.accountId/);
});

test("paper sync writes and reads collateral, intent, and account-scoped history", () => {
  assert.match(source, /INSERT INTO paper_positions[\s\S]*?position_type, asset_type, collateral_per_share/);
  assert.match(source, /INSERT INTO paper_transactions[\s\S]*?cash_delta, short_collateral_delta/);
  assert.match(source, /INSERT INTO paper_orders[\s\S]*?intent, short_collateral_ratio/);
  assert.match(source, /SELECT id, account_id, symbol, company_name, shares, avg_cost, position_type, asset_type, collateral_per_share/);
  assert.match(source, /SELECT id, account_id, symbol, company_name, order_type, side, shares, intent, short_collateral_ratio/);
  assert.match(source, /shortCollateralDelta: r\.short_collateral_delta/);
});
