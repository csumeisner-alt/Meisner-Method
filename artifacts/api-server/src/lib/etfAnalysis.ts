export interface EtfRegimePerformance {
  averageAnnualReturn: number | null;
  years: number;
}

export const ETF_SCENARIO_HORIZONS = [1, 3, 5, 10, 20] as const;

export interface EtfScenarioProjection {
  horizonYears: (typeof ETF_SCENARIO_HORIZONS)[number];
  noFeeValue: number | null;
  afterFeeValue: number | null;
}

export interface EtfScenario {
  label: "bear" | "base" | "bull";
  annualReturnAssumption: number | null;
  noFeeAnnualReturnAssumption: number | null;
  projections: EtfScenarioProjection[];
  fiveYearValue: number | null;
  tenYearValue: number | null;
  noFeeFiveYearValue: number | null;
  noFeeTenYearValue: number | null;
  assumption: string;
}

export function normalizeEtfExpenseRatio(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? value
    : null;
}

export function calculateEtfRiskMetrics(closes: number[]) {
  const validCloses = closes.filter((value) => Number.isFinite(value) && value > 0);
  const returns = validCloses.slice(1).map((close, index) => close / validCloses[index]! - 1);
  if (returns.length < 2) {
    return { annualizedReturn: null, annualizedVolatility: null, maxDrawdown: null, riskAdjustedReturn: null };
  }

  const meanDailyReturn = returns.reduce((sum, value) => sum + value, 0) / returns.length;
  const variance = returns.reduce((sum, value) => sum + (value - meanDailyReturn) ** 2, 0) / (returns.length - 1);
  const annualizedVolatility = Math.sqrt(variance * 252);
  const annualizedReturn = meanDailyReturn * 252;
  let peak = validCloses[0]!;
  let maxDrawdown = 0;
  for (const close of validCloses) {
    peak = Math.max(peak, close);
    maxDrawdown = Math.min(maxDrawdown, close / peak - 1);
  }
  return {
    annualizedReturn,
    annualizedVolatility,
    maxDrawdown,
    riskAdjustedReturn: annualizedVolatility > 0 ? annualizedReturn / annualizedVolatility : null,
  };
}

export function buildEtfPeerComparisonFields(
  profile: Record<string, unknown>,
  asOf: string,
) {
  const withSourceContext = (value: unknown) => {
    if (!value || typeof value !== "object" || Array.isArray(value)) return null;
    return {
      ...(value as Record<string, unknown>),
      source: "Yahoo Finance",
      asOf,
    };
  };

  return {
    peerExpenseComparison: withSourceContext(profile["peerExpenseComparison"]),
    peerAssetSizeComparison: withSourceContext(profile["peerAssetSizeComparison"]),
  };
}

export function buildEtfScenarios(
  currentPrice: number,
  expenseRatio: number | null,
  periods: Record<string, EtfRegimePerformance> | null | undefined,
): EtfScenario[] {
  const validExpenseRatio = normalizeEtfExpenseRatio(expenseRatio);
  const samples = Object.values(periods ?? {}).filter((period) =>
    typeof period.averageAnnualReturn === "number"
    && Number.isFinite(period.averageAnnualReturn)
    && period.years > 0,
  );
  const totalYears = samples.reduce((sum, period) => sum + period.years, 0);
  const base = totalYears
    ? samples.reduce((sum, period) => sum + period.averageAnnualReturn! * period.years, 0) / totalYears
    : null;
  const assumptions = {
    bear: periods?.["bear"]?.averageAnnualReturn ?? null,
    base,
    bull: periods?.["bull"]?.averageAnnualReturn ?? null,
  };
  return (["bear", "base", "bull"] as const).map((label) => {
    const observed = assumptions[label];
    const valid = typeof observed === "number" && Number.isFinite(observed) && observed > -1;
    const feeAdjustedReturn = valid && validExpenseRatio !== null
      ? observed - validExpenseRatio
      : null;
    const project = (annualReturn: number | null, years: number) =>
      annualReturn !== null && Number.isFinite(annualReturn) && annualReturn > -1
        ? Math.round(currentPrice * (1 + annualReturn) ** years * 100) / 100
      : null;
    const projections = ETF_SCENARIO_HORIZONS.map((horizonYears) => ({
      horizonYears,
      noFeeValue: project(valid ? observed : null, horizonYears),
      afterFeeValue: project(feeAdjustedReturn, horizonYears),
    }));
    const projectionAt = (horizonYears: number) =>
      projections.find((projection) => projection.horizonYears === horizonYears);
    return {
      label,
      annualReturnAssumption: feeAdjustedReturn,
      noFeeAnnualReturnAssumption: valid ? observed : null,
      projections,
      fiveYearValue: projectionAt(5)?.afterFeeValue ?? null,
      tenYearValue: projectionAt(10)?.afterFeeValue ?? null,
      noFeeFiveYearValue: projectionAt(5)?.noFeeValue ?? null,
      noFeeTenYearValue: projectionAt(10)?.noFeeValue ?? null,
      assumption: valid
        ? validExpenseRatio === null
          ? `Uses the historical ${label === "base" ? "sample-weighted" : label}-regime annual average for the no-fee illustration. Fee-adjusted values are unavailable because the expense ratio was not reported. Assumes constant compounding and no additional contributions.`
          : `Uses the historical ${label === "base" ? "sample-weighted" : label}-regime annual average; the fee-adjusted illustration subtracts the reported expense ratio. Assumes constant compounding and no additional contributions.`
        : `Not shown: insufficient provider-reported ${label} regime history.`,
    };
  });
}
