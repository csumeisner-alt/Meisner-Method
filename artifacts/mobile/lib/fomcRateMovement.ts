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

export type FomcRateMovement = "raised" | "lowered" | "held";

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

  const lowerChange = actual.value - previous.value;
  const upperChange = actual.upperBound! - previous.upperBound!;
  if (lowerChange === 0 && upperChange === 0) return "held";
  if (lowerChange > 0 && upperChange > 0) return "raised";
  if (lowerChange < 0 && upperChange < 0) return "lowered";
  return null;
}
