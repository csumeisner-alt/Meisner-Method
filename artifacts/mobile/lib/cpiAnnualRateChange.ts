type CpiPublishedValue = {
  annualRate?: {
    value: number;
    source?: { url: string; publicationDate: string } | null;
  } | null;
  source?: { url: string; publicationDate: string } | null;
} | null;

export type CpiAnnualRateChange = {
  direction: "rose" | "eased" | "unchanged";
  percentagePoints: number;
};

function isValidDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function archivedReleaseUrl(date: string): string {
  const [year, month, day] = date.split("-");
  return `https://www.bls.gov/news.release/archives/cpi_${month}${day}${year}.htm`;
}

export function getCpiAnnualRateChange(
  previous: CpiPublishedValue,
  actual: CpiPublishedValue,
  actualReleaseDate: string,
): CpiAnnualRateChange | null {
  const previousRate = previous?.annualRate;
  const actualRate = actual?.annualRate;
  const previousRateSource = previousRate?.source;
  const actualRateSource = actualRate?.source;
  const previousSource = previous?.source;
  const actualSource = actual?.source;

  if (
    !previousRate || !actualRate
    || !Number.isFinite(previousRate.value) || !Number.isFinite(actualRate.value)
    || !previousRateSource || !actualRateSource
    || !previousSource || !actualSource
  ) return null;

  const previousDate = previousRateSource.publicationDate;
  const actualDate = actualRateSource.publicationDate;
  if (
    !isValidDate(previousDate) || !isValidDate(actualDate) || !isValidDate(actualReleaseDate)
    || previousDate >= actualDate || actualDate !== actualReleaseDate
    || previousSource.publicationDate !== previousDate || actualSource.publicationDate !== actualDate
  ) return null;

  const previousUrl = archivedReleaseUrl(previousDate);
  const actualUrl = archivedReleaseUrl(actualDate);
  if (
    previousRateSource.url !== previousUrl || previousSource.url !== previousUrl
    || actualRateSource.url !== actualUrl || actualSource.url !== actualUrl
  ) return null;

  const roundedDifference = Number((actualRate.value - previousRate.value).toFixed(1));
  return {
    direction: roundedDifference > 0 ? "rose" : roundedDifference < 0 ? "eased" : "unchanged",
    percentagePoints: Math.abs(roundedDifference),
  };
}
