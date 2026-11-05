type PublishedRateRange = {
  value: number;
  upperBound?: number;
  units: string;
  source?: {
    title: string;
    url: string;
    publicationDate: string;
  };
};

type FomcEvent = {
  name: string;
  eventDate: string;
  status: "completed" | "upcoming";
  values: {
    previous: PublishedRateRange | null;
    actual: PublishedRateRange | null;
  };
};

export type FomcRateMovement = {
  direction: "raised" | "lowered" | "held";
  basisPoints: number;
};

function statementDate(value: PublishedRateRange): string | null {
  if (value.units !== "percent, federal funds target range"
    || !value.source
    || value.source.title !== "Federal Reserve FOMC statement"
    || value.upperBound === undefined
    || !Number.isFinite(value.value)
    || !Number.isFinite(value.upperBound)
    || value.upperBound < value.value) return null;
  const match = value.source.url.match(
    /^https:\/\/www\.federalreserve\.gov\/newsevents\/pressreleases\/monetary(20\d{2})(\d{2})(\d{2})a\.htm$/,
  );
  if (!match) return null;
  const date = `${match[1]}-${match[2]}-${match[3]}`;
  return value.source.publicationDate === date ? date : null;
}

export function getFomcRateMovement(event: FomcEvent): FomcRateMovement | null {
  if (event.name !== "Federal Reserve FOMC meeting" || event.status !== "completed") return null;
  const { previous, actual } = event.values;
  if (!previous || !actual) return null;
  const previousDate = statementDate(previous);
  const actualDate = statementDate(actual);
  if (!previousDate || previousDate >= event.eventDate
    || actualDate !== event.eventDate
    || previous.source?.url === actual.source?.url) return null;

  const lowerChangeBasisPoints = (actual.value - previous.value) * 100;
  const upperChangeBasisPoints = (actual.upperBound! - previous.upperBound!) * 100;
  const lowerChange = Math.round(lowerChangeBasisPoints);
  const upperChange = Math.round(upperChangeBasisPoints);
  if (Math.abs(lowerChangeBasisPoints - lowerChange) > 1e-8
    || Math.abs(upperChangeBasisPoints - upperChange) > 1e-8
    || lowerChange !== upperChange) return null;
  if (lowerChange === 0) return { direction: "held", basisPoints: 0 };
  return {
    direction: lowerChange > 0 ? "raised" : "lowered",
    basisPoints: Math.abs(lowerChange),
  };
}
