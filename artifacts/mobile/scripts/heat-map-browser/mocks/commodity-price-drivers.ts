import { initializeHeatMapBrowserState } from './api-client-react';

export interface CommodityPriceDrivers {
  up: string;
  down: string;
}

export function loadCommodityPriceDrivers(
  symbol: string,
  signal: AbortSignal,
): Promise<CommodityPriceDrivers | null> {
  const state = initializeHeatMapBrowserState();
  state.commodityDriverRequests.push({ symbol });
  state.commodityDriverSignals.push({ symbol, signal });
  const response = state.commodityDriverResponses.shift();

  if (response?.type === 'reject') {
    return Promise.reject(new Error('Mock commodity-driver request failed.'));
  }
  if (response?.type === 'resolve') {
    return Promise.resolve(response.payload as CommodityPriceDrivers | null);
  }
  if (response?.type === 'stall') {
    return new Promise(() => {});
  }
  if (response?.type === 'defer') {
    return new Promise((resolve) => {
      state.pendingCommodityDriverRequests.push({
        symbol,
        resolve: (payload) => resolve(payload as CommodityPriceDrivers | null),
      });
    });
  }

  return Promise.resolve({
    up: `${symbol} prices can rise when demand strengthens or supply tightens.`,
    down: `${symbol} prices can fall when demand weakens or supply expands.`,
  });
}
