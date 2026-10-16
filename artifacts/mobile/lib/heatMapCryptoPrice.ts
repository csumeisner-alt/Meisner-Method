export function getHeatMapCryptoQuoteCurrency(symbol: string): string | null {
  const separator = symbol.lastIndexOf("-");
  if (separator <= 0) return null;
  const currency = symbol.slice(separator + 1).toUpperCase();
  return /^[A-Z]{3,5}$/.test(currency) ? currency : null;
}

export function formatHeatMapCryptoPrice(
  price: number,
  symbol: string,
  lowPriceFractionDigits = 4,
): string {
  const currency = getHeatMapCryptoQuoteCurrency(symbol);
  const fractionDigits = price >= 1 ? 2 : price < 0.01 ? lowPriceFractionDigits : 4;
  const amount = price.toLocaleString("en-US", {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  });
  if (!currency) return `$${amount}`;
  return currency === "USD" ? `$${amount}` : `${amount} ${currency}`;
}
