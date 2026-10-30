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
  currentPrice: number | null | undefined,
  expenseRatio: number | null,
  periods: Record<string, EtfRegimePerformance> | null | undefined,
): EtfScenario[] {
  const validCurrentPrice =
    typeof currentPrice === "number" && Number.isFinite(currentPrice) && currentPrice > 0;
  const validExpenseRatio = normalizeEtfExpenseRatio(expenseRatio);
  const samples = Object.values(periods ?? {}).filter((period) =>
    typeof period.averageAnnualReturn === "number"
    && Number.isFinite(period.averageAnnualReturn)
    && typeof period.years === "number"
    && Number.isFinite(period.years)
    && period.years > 0,
  );
  const maxYears = samples.reduce((max, period) => Math.max(max, period.years), 0);
  const totalNormalizedYears = maxYears
    ? samples.reduce((sum, period) => sum + period.years / maxYears, 0)
    : 0;
  const base = totalNormalizedYears
    ? samples.reduce(
        (sum, period) =>
          sum + period.averageAnnualReturn! * (period.years / maxYears / totalNormalizedYears),
        0,
      )
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
    const project = (annualReturn: number | null, years: number) => {
      if (
        !validCurrentPrice
        || annualReturn === null
        || !Number.isFinite(annualReturn)
        || annualReturn <= -1
      ) {
        return null;
      }

      const compoundedValue = currentPrice * (1 + annualReturn) ** years;
      if (!Number.isFinite(compoundedValue)) return null;

      const roundedValue = Math.round(compoundedValue * 100) / 100;
      return Number.isFinite(roundedValue) ? roundedValue : null;
    };
    const projections = ETF_SCENARIO_HORIZONS.map((horizonYears) => ({
      horizonYears,
      noFeeValue: project(valid ? observed : null, horizonYears),
      afterFeeValue: project(feeAdjustedReturn, horizonYears),
    }));
    const projectionAt = (horizonYears: number) =>
      projections.find((projection) => projection.horizonYears === horizonYears);
    const scenarioAssumption = valid
      ? validExpenseRatio === null
        ? `Uses the historical ${label === "base" ? "sample-weighted" : label}-regime annual average for the no-fee illustration. Fee-adjusted values are unavailable because the expense ratio was not reported. The supplied projection values assume one initial share and no added contributions; the app models monthly contributions separately.`
        : `Uses the historical ${label === "base" ? "sample-weighted" : label}-regime annual average; the fee-adjusted illustration subtracts the reported expense ratio. The supplied projection values assume one initial share and no added contributions; the app models monthly contributions separately.`
      : `Not shown: insufficient provider-reported ${label} regime history.`;
    return {
      label,
      annualReturnAssumption: feeAdjustedReturn,
      noFeeAnnualReturnAssumption: valid ? observed : null,
      projections,
      fiveYearValue: projectionAt(5)?.afterFeeValue ?? null,
      tenYearValue: projectionAt(10)?.afterFeeValue ?? null,
      noFeeFiveYearValue: projectionAt(5)?.noFeeValue ?? null,
      noFeeTenYearValue: projectionAt(10)?.noFeeValue ?? null,
      assumption: validCurrentPrice
        ? scenarioAssumption
        : `${scenarioAssumption} Projection values are unavailable because the starting share price is missing or invalid.`,
    };
  });
}
