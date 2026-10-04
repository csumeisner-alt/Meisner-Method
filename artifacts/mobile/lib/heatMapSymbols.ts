export const MAX_CUSTOM_HEAT_MAP_SYMBOLS = 40;

const SYMBOL_PATTERN = /^[A-Z0-9.^=-]{1,15}$/;

export function normalizeCustomHeatMapSymbols(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const symbols = new Set<string>();

  for (const item of value) {
    if (typeof item !== "string") continue;
    const symbol = item.trim().toUpperCase();
    if (SYMBOL_PATTERN.test(symbol)) symbols.add(symbol);
    if (symbols.size >= MAX_CUSTOM_HEAT_MAP_SYMBOLS) break;
  }

  return [...symbols];
}