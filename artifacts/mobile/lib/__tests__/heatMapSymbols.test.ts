import assert from "node:assert/strict";
import test from "node:test";
import {
  MAX_CUSTOM_HEAT_MAP_SYMBOLS,
  normalizeCustomHeatMapSymbols,
} from "../heatMapSymbols.ts";

test("saved custom symbols are uppercased, validated, and deduplicated", () => {
  assert.deepEqual(
    normalizeCustomHeatMapSymbols([" aapl ", "AAPL", "brk-b", "bad symbol", 42, ""]),
    ["AAPL", "BRK-B"],
  );
});

test("saved custom symbols are capped to the API's supported maximum", () => {
  const input = Array.from({ length: MAX_CUSTOM_HEAT_MAP_SYMBOLS + 3 }, (_, index) => `T${index}`);
  assert.equal(normalizeCustomHeatMapSymbols(input).length, MAX_CUSTOM_HEAT_MAP_SYMBOLS);
});