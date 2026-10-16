import supportedInstrumentCatalog from "./heatmap-instruments/catalog.json" with { type: "json" };

export const MAX_CUSTOM_HEAT_MAP_SYMBOLS = 40;

const SYMBOL_PATTERN = /^[A-Z0-9.^=-]{1,15}$/;

export const CUSTOM_HEAT_MAP_ASSET_TYPES = [
  { id: "stocks", label: "Stocks" },
  { id: "etfs", label: "ETFs" },
  { id: "commodities", label: "Commodities" },
  { id: "futures", label: "Futures" },
  { id: "cryptocurrency", label: "Crypto" },
] as const;

export type CustomHeatMapAssetType = (typeof CUSTOM_HEAT_MAP_ASSET_TYPES)[number]["id"];

export interface CustomHeatMapAsset {
  symbol: string;
  name: string;
}

export interface CustomHeatMapAssetSearchResult {
  assetType: Exclude<CustomHeatMapAssetType, "stocks">;
  asset: CustomHeatMapAsset;
}

export const CUSTOM_HEAT_MAP_ASSETS: Record<Exclude<CustomHeatMapAssetType, "stocks">, CustomHeatMapAsset[]> = {
  ...supportedInstrumentCatalog,
};

export function searchCustomHeatMapAssets(query: string): CustomHeatMapAssetSearchResult[] {
  const normalizedQuery = query.trim().toLocaleLowerCase();
  if (!normalizedQuery) return [];

  const results = Object.entries(CUSTOM_HEAT_MAP_ASSETS).flatMap(([assetType, assets]) =>
    assets
      .filter((asset) =>
        asset.name.toLocaleLowerCase().includes(normalizedQuery)
        || asset.symbol.toLocaleLowerCase().includes(normalizedQuery))
      .map((asset) => ({
        assetType: assetType as Exclude<CustomHeatMapAssetType, "stocks">,
        asset,
      })),
  );

  return results.sort((left, right) => {
    const rank = (result: CustomHeatMapAssetSearchResult) => {
      const name = result.asset.name.toLocaleLowerCase();
      const symbol = result.asset.symbol.toLocaleLowerCase();
      if (symbol === normalizedQuery) return 0;
      if (name === normalizedQuery) return 1;
      if (symbol.startsWith(normalizedQuery) || name.startsWith(normalizedQuery)) return 2;
      return 3;
    };
    return rank(left) - rank(right) || left.asset.name.localeCompare(right.asset.name);
  });
}

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