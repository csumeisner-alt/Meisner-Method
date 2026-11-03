import assert from "node:assert/strict";
import test from "node:test";
import {
  formatHeatMapCryptoPrice,
  getHeatMapCryptoQuoteCurrency,
} from "../heatMapCryptoPrice.ts";

test("crypto pairs expose their quoted currency without converting the pair price", () => {
  assert.equal(getHeatMapCryptoQuoteCurrency("BTC-EUR"), "EUR");
  assert.equal(getHeatMapCryptoQuoteCurrency("ETH-BTC"), "BTC");
  assert.equal(formatHeatMapCryptoPrice(62_500, "BTC-EUR"), "62,500.00 EUR");
  assert.equal(formatHeatMapCryptoPrice(0.025, "ETH-BTC"), "0.0250 BTC");
  assert.equal(formatHeatMapCryptoPrice(0.000023, "XRP-USD", 6), "$0.000023");
  assert.equal(formatHeatMapCryptoPrice(62_500, "BTC-USD"), "$62,500.00");
});

test("symbols without a quote-currency suffix retain the existing dollar display", () => {
  assert.equal(getHeatMapCryptoQuoteCurrency("BTC"), null);
  assert.equal(formatHeatMapCryptoPrice(1.25, "BTC"), "$1.25");
});
