export type EtfScenario = {
  label: string;
  annualReturnAssumption: number | null;
  noFeeAnnualReturnAssumption: number | null;
  projections: EtfScenarioProjection[];
  fiveYearValue: number | null;
  tenYearValue: number | null;
  noFeeFiveYearValue: number | null;
  noFeeTenYearValue: number | null;
  assumption: string;
};

export type EtfScenarioProjection = {
  horizonYears: number;
  noFeeValue: number | null;
  afterFeeValue: number | null;
};

export type EtfContributionCadence = 'weekly' | 'monthly' | 'quarterly';

export const ETF_SCENARIO_LABELS = ['bear', 'base', 'bull'] as const;
export const ETF_SCENARIO_HORIZONS = [1, 3, 5, 10, 20] as const;
export const ETF_CONTRIBUTION_CADENCES = ['weekly', 'monthly', 'quarterly'] as const;

export function calculateEtfScenarioValue(
  initialInvestment: number,
  annualReturn: number | null,
  contributionAmount: number,
  horizonYears: number,
  cadence: EtfContributionCadence = 'monthly',
): number | null {
  if (
    !Number.isFinite(initialInvestment)
    || initialInvestment <= 0
    || typeof annualReturn !== 'number'
    || !Number.isFinite(annualReturn)
    || annualReturn <= -1
    || !Number.isFinite(contributionAmount)
    || contributionAmount < 0
    || !Number.isFinite(horizonYears)
    || horizonYears <= 0
    || !ETF_CONTRIBUTION_CADENCES.includes(cadence)
  ) {
    return null;
  }

  const periodsPerYear = {
    weekly: 52,
    monthly: 12,
    quarterly: 4,
  }[cadence];
  const periods = Math.floor(horizonYears * periodsPerYear);
  const periodicRate = (1 + annualReturn) ** (1 / periodsPerYear) - 1;
  const growth = (1 + annualReturn) ** horizonYears;
  const contributionGrowth = (1 + periodicRate) ** periods;
  const contributionValue = periodicRate === 0
    ? contributionAmount * periods
    : contributionAmount * (contributionGrowth - 1) / periodicRate;
  const value = initialInvestment * growth + contributionValue;
  return Number.isFinite(value) ? Math.round(value * 100) / 100 : null;
}

export function parseEtfScenarios(scenarios: unknown): EtfScenario[] {
  if (!Array.isArray(scenarios)) return [];

  return scenarios.flatMap((scenario): EtfScenario[] => {
    if (typeof scenario !== 'object' || scenario === null || Array.isArray(scenario)) return [];
    const record = scenario as Record<string, unknown>;
    if (typeof record.label !== 'string' || !record.label.trim() || typeof record.assumption !== 'string') {
      return [];
    }
    const numberOrNull = (value: unknown) =>
      typeof value === 'number' && Number.isFinite(value) ? value : null;
    const projections = Array.isArray(record.projections)
      ? record.projections.flatMap((projection): EtfScenarioProjection[] => {
        if (typeof projection !== 'object' || projection === null || Array.isArray(projection)) return [];
        const projectionRecord = projection as Record<string, unknown>;
        if (typeof projectionRecord.horizonYears !== 'number'
          || !ETF_SCENARIO_HORIZONS.includes(projectionRecord.horizonYears as typeof ETF_SCENARIO_HORIZONS[number])) {
          return [];
        }
        return [{
          horizonYears: projectionRecord.horizonYears,
          noFeeValue: numberOrNull(projectionRecord.noFeeValue),
          afterFeeValue: numberOrNull(projectionRecord.afterFeeValue),
        }];
      })
      : [];
    return [{
      label: record.label,
      annualReturnAssumption: numberOrNull(record.annualReturnAssumption),
      noFeeAnnualReturnAssumption: numberOrNull(record.noFeeAnnualReturnAssumption),
      projections,
      fiveYearValue: numberOrNull(record.fiveYearValue),
      tenYearValue: numberOrNull(record.tenYearValue),
      noFeeFiveYearValue: numberOrNull(record.noFeeFiveYearValue),
      noFeeTenYearValue: numberOrNull(record.noFeeTenYearValue),
      assumption: record.assumption,
    }];
  });
}
