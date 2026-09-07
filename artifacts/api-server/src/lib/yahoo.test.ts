import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeDividendYield } from "./dividendYield.ts";

const approx = (actual: number, expected: number) => {
  assert.ok(Math.abs(actual - expected) < 1e-10, `${actual} ≈ ${expected}`);
};

test("normalizeDividendYield converts percent-like NVDA data to 0.43%", () => {
  approx(normalizeDividendYield(0.43, 1, 230.36), 0.0043);
});

test("normalizeDividendYield preserves decimal provider data", () => {
  approx(normalizeDividendYield(0.0073, 3.64, 499.7), 0.0073);
  approx(normalizeDividendYield(0.0241), 0.0241);
});

test("normalizeDividendYield handles missing yield from the declared rate", () => {
  approx(normalizeDividendYield(null, 1, 230.36), 1 / 230.36);
});