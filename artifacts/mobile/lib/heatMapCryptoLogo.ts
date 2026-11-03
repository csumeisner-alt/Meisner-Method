export const HEAT_MAP_CRYPTO_LOGO_CODES = [
  "BTC",
  "ETH",
  "SOL",
  "XRP",
  "BNB",
  "DOGE",
  "ADA",
  "TRX",
  "AVAX",
  "LINK",
  "LTC",
  "BCH",
  "SUI",
  "DOT",
  "SHIB",
  "TON",
] as const;

export type HeatMapCryptoLogoCode = (typeof HEAT_MAP_CRYPTO_LOGO_CODES)[number];

const supportedCryptoLogoCodes = new Set<string>(HEAT_MAP_CRYPTO_LOGO_CODES);

export function getHeatMapCryptoLogoCode(symbol: string): HeatMapCryptoLogoCode | null {
  const normalized = symbol.trim().toUpperCase();
  const separator = normalized.lastIndexOf("-");
  const code = separator > 0 ? normalized.slice(0, separator) : normalized;
  return supportedCryptoLogoCodes.has(code) ? code as HeatMapCryptoLogoCode : null;
}
