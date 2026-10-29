export interface EtfScoreInput {
  expenseRatio: number | null;
  categoryAverageExpenseRatio: number | null;
  trackingError: number | null;
  sectorWeights: readonly { sector: string; weight: number }[];
  averageVolume: number | null;
  totalAssets: number | null;
  peerAssetSizeComparison: {
    category: string;
    categoryAverageTotalAssets: number;
    sampleSize: number | null;
    sampleContext: string;
    source: string;
    asOf: string;
  } | null;
  annualizedVolatility: number | null;
  maxDrawdown: number | null;
}

export interface EtfScoreComponent {
  id: "cost" | "tracking" | "diversification" | "liquidity" | "risk";
  label: string;
  weight: number;
  score: number | null;
  detail: string;
  peerContext?: {
    category: string;
    categoryAverageTotalAssets: number;
    sampleSize: number | null;
    sampleContext: string;
    source: string;
    asOf: string;
  };
}

const clamp = (value: number) => Math.min(100, Math.max(0, value));
const validNonNegative = (value: number | null | undefined): value is number =>
  typeof value === "number" && Number.isFinite(value) && value >= 0;

function logBandScore(value: number, low: number, high: number) {
  return clamp(((Math.log10(value) - Math.log10(low)) / (Math.log10(high) - Math.log10(low))) * 100);
}

export function calculateEtfResearchScore(input: EtfScoreInput) {
  let sectorEntries = input.sectorWeights.filter((entry) =>
    entry.sector.trim()
    && Number.isFinite(entry.weight)
    && entry.weight > 0
    && entry.weight <= 1,
  );
  const sectorCoverage = sectorEntries.reduce((sum, entry) => sum + entry.weight, 0);
  if (sectorCoverage < 0.8) sectorEntries = [];
  const normalizedSectors = sectorEntries.map((entry) => entry.weight / sectorCoverage);
  const sectorHhi = normalizedSectors.reduce((sum, weight) => sum + weight ** 2, 0);

  const liquidityScores: number[] = [];
  if (validNonNegative(input.averageVolume) && input.averageVolume > 0) {
    liquidityScores.push(logBandScore(input.averageVolume, 10_000, 1_000_000));
  }
  const categoryAverageAssets = input.peerAssetSizeComparison?.categoryAverageTotalAssets;
  const hasPeerAssetBaseline = validNonNegative(input.totalAssets)
    && input.totalAssets > 0
    && validNonNegative(categoryAverageAssets)
    && categoryAverageAssets > 0;
  if (validNonNegative(input.totalAssets) && input.totalAssets > 0) {
    liquidityScores.push(hasPeerAssetBaseline
      ? clamp(50 * input.totalAssets / categoryAverageAssets)
      : logBandScore(input.totalAssets, 10_000_000, 1_000_000_000));
  }

  const riskScores: number[] = [];
  if (validNonNegative(input.annualizedVolatility)) {
    riskScores.push(clamp((1 - input.annualizedVolatility / 0.6) * 100));
  }
  if (typeof input.maxDrawdown === "number" && Number.isFinite(input.maxDrawdown) && input.maxDrawdown <= 0) {
    riskScores.push(clamp((1 - Math.abs(input.maxDrawdown) / 0.75) * 100));
  }

  const components: EtfScoreComponent[] = [
    {
      id: "cost",
      label: "Cost vs category average",
      weight: 25,
      score: validNonNegative(input.expenseRatio)
        && typeof input.categoryAverageExpenseRatio === "number"
        && Number.isFinite(input.categoryAverageExpenseRatio)
        && input.categoryAverageExpenseRatio > 0
        ? clamp((1 - input.expenseRatio / (2 * input.categoryAverageExpenseRatio)) * 100)
        : null,
      detail: "At the provider category average scores 50; twice the average or more scores 0.",
    },
    {
      id: "tracking",
      label: "Benchmark tracking",
      weight: 25,
      score: validNonNegative(input.trackingError)
        ? clamp((1 - input.trackingError / 0.05) * 100)
        : null,
      detail: "Uses annualized tracking error only when a provider-identified benchmark is available; 5% or more scores 0.",
    },
    {
      id: "diversification",
      label: "Reported sector diversification",
      weight: 20,
      score: sectorEntries.length >= 2 ? clamp((1 - sectorHhi) * 100) : null,
      detail: sectorEntries.length >= 2
        ? `Based on ${sectorEntries.length} provider-reported sectors covering ${(sectorCoverage * 100).toFixed(0)}% of the reported mix.`
        : "Unavailable unless reported sector weights cover at least 80% across two or more sectors.",
    },
    {
      id: "liquidity",
      label: "Liquidity",
      weight: 15,
      score: liquidityScores.length ? liquidityScores.reduce((sum, score) => sum + score, 0) / liquidityScores.length : null,
      detail: hasPeerAssetBaseline
        ? "Average daily shares use fixed 10K–1M bands; assets score 50 at the provider category average and scale linearly to 100 at 2×."
        : "Uses fixed log-scale bands: 10K–1M average daily shares and $10M–$1B assets; assets are not peer-relative.",
      ...(hasPeerAssetBaseline && input.peerAssetSizeComparison
        ? {
          peerContext: {
            category: input.peerAssetSizeComparison.category,
            categoryAverageTotalAssets: input.peerAssetSizeComparison.categoryAverageTotalAssets,
            sampleSize: input.peerAssetSizeComparison.sampleSize,
            sampleContext: input.peerAssetSizeComparison.sampleContext,
            source: input.peerAssetSizeComparison.source,
            asOf: input.peerAssetSizeComparison.asOf,
          },
        }
        : {}),
    },
    {
      id: "risk",
      label: "One-year risk",
      weight: 15,
      score: riskScores.length ? riskScores.reduce((sum, score) => sum + score, 0) / riskScores.length : null,
      detail: "Uses fixed bands: 60% annualized volatility and 75% maximum drawdown each score 0; not peer-relative.",
    },
  ];
  const available = components.filter((component) => component.score !== null);
  const availableWeight = available.reduce((sum, component) => sum + component.weight, 0);
  const score = available.length >= 3
    ? Math.round(available.reduce((sum, component) => sum + component.score! * component.weight, 0) / availableWeight)
    : null;

  return {
    score,
    availableComponents: available.length,
    components,
  };
}
