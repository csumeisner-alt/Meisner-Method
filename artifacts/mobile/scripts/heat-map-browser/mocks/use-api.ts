export function useApi() {
  return {
    apiFetch: async () => ({
      previousClose: 122,
      open: 123,
      dayLow: 120,
      dayHigh: 126,
      fiftyTwoWeekLow: 90,
      fiftyTwoWeekHigh: 140,
      volume: 1_000_000,
      averageVolume3Month: 800_000,
      marketCap: 250_000_000_000,
      beta: 1.21,
      earningsTimestamp: Date.parse('2030-06-12T00:00:00Z') / 1000,
      targetMeanPrice: 135,
      trailingEps: 6.21,
      totalRevenue: 30_000_000_000,
    }),
  };
}
