import {
  SUPPORTED_COMMODITIES,
  type CommodityEvent,
  type CommodityEventCalendar,
  type CommodityPublishedValue,
} from "./commodityAnalysis.ts";

const DAY_MS = 86_400_000;
const USDA_URL = "https://www.usda.gov/about-usda/general-information/staff-offices/office-chief-economist/commodity-markets/wasde-report";
const WPSR_URL = "https://www.eia.gov/petroleum/supply/weekly/";
const GAS_URL = "https://www.eia.gov/naturalgas/storage/";
const BLS_CPI_URL = "https://www.bls.gov/schedule/news_release/cpi.htm";
const BLS_CPI_API_URL = "https://api.bls.gov/publicAPI/v2/timeseries/data/CUUR0000SA0";
const FOMC_URL = "https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm";
const OPEC_RELEASES_URL = "https://www.opec.org/press-releases.html";
const CACHE_MS = 6 * 60 * 60 * 1000;
const cache = new Map<string, { calendar: CommodityEventCalendar; expiresAt: number }>();
const requests = new Map<string, Promise<CommodityEventCalendar>>();

const MONTHS: Record<string, number> = {
  jan: 0, january: 0, feb: 1, february: 1, mar: 2, march: 2,
  apr: 3, april: 3, may: 4, jun: 5, june: 5, jul: 6, july: 6,
  aug: 7, august: 7, sep: 8, sept: 8, september: 8, oct: 9,
  october: 9, nov: 10, november: 10, dec: 11, december: 11,
};

function validDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const timestamp = Date.parse(`${value}T00:00:00.000Z`);
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString().slice(0, 10) === value;
}

function normalizedText(html: string): string {
  return html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<\/(?:td|th|tr|p|h[1-6]|li|div|br)\s*>/gi, " | ")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&ndash;|&#8211;/gi, "–")
    .replace(/&mdash;|&#8212;/gi, "—")
    .replace(/\s+/g, " ")
    .trim();
}

function toIsoDate(monthText: string, dayText: string, yearText: string): string | null {
  const month = MONTHS[monthText.toLowerCase().replace(/\.$/, "")];
  const day = Number(dayText);
  const year = Number(yearText);
  if (month === undefined || !Number.isInteger(day) || day < 1 || day > 31
    || !Number.isInteger(year) || year < 2000 || year > 2100) return null;
  const timestamp = Date.UTC(year, month, day);
  const date = new Date(timestamp).toISOString().slice(0, 10);
  return new Date(timestamp).getUTCMonth() === month ? date : null;
}

function statusFor(eventDate: string, now: Date): CommodityEvent["status"] {
  return eventDate < now.toISOString().slice(0, 10) ? "completed" : "upcoming";
}

function inWindow(eventDate: string, now: Date, pastDays = 30, futureDays = 120): boolean {
  const delta = Date.parse(`${eventDate}T00:00:00.000Z`) - Date.parse(`${now.toISOString().slice(0, 10)}T00:00:00.000Z`);
  return delta >= -pastDays * DAY_MS && delta <= futureDays * DAY_MS;
}

function event(
  id: string,
  name: string,
  eventDate: string,
  time: string | null,
  timezone: string | null,
  affectedCommodities: string[],
  sourceTitle: string,
  sourceUrl: string,
  now: Date,
): CommodityEvent {
  return {
    id,
    name,
    eventDate,
    time,
    timezone,
    status: statusFor(eventDate, now),
    affectedCommodities,
    source: { title: sourceTitle, url: sourceUrl, publicationDate: null },
    values: { previous: null, consensus: null, actual: null },
  };
}

export function parseEiaReleaseEvents(
  html: string,
  kind: "wpsr" | "natural-gas",
  commodity: string,
  symbol: string,
  now: Date,
): CommodityEvent[] {
  const text = normalizedText(html);
  const releasePattern = kind === "wpsr"
    ? /\bRelease Date\s*:?\s*([A-Za-z]{3,9}\.?\s+\d{1,2},\s+\d{4})/i
    : /\bReleased\s*:?\s*([A-Za-z]{3,9}\.?\s+\d{1,2},\s+\d{4})/i;
  const nextPattern = kind === "wpsr"
    ? /\bNext Release Date\s*:?\s*([A-Za-z]{3,9}\.?\s+\d{1,2},\s+\d{4})/i
    : /\bNext Release\s*:?\s*([A-Za-z]{3,9}\.?\s+\d{1,2},\s+\d{4})/i;
  const currentText = text.match(releasePattern)?.[1];
  const nextText = text.match(nextPattern)?.[1];
  const parse = (value: string | undefined) => {
    const match = value?.match(/^([A-Za-z]{3,9})\.?\s+(\d{1,2}),\s+(\d{4})$/);
    return match ? toIsoDate(match[1]!, match[2]!, match[3]!) : null;
  };
  const currentDate = parse(currentText);
  const nextDate = parse(nextText);
  const title = kind === "wpsr" ? "EIA Weekly Petroleum Status Report" : "EIA Weekly Natural Gas Storage Report";
  const url = kind === "wpsr" ? WPSR_URL : GAS_URL;
  const releaseTime = kind === "natural-gas"
    ? text.match(/\b(?:Released|Release Date)\b[^|]{0,100}?\bat\s+(\d{1,2}:\d{2}\s*[ap]\.?m\.?)/i)?.[1]
      ?.replace(/\./g, "").toUpperCase() ?? null
    : null;
  const output: CommodityEvent[] = [];
  if (currentDate && inWindow(currentDate, now, 30, 0)) {
    output.push(event(`${symbol}-eia-release-${currentDate}`, title, currentDate, releaseTime, releaseTime ? "ET" : null,
      [commodity], title, url, now));
  }
  if (nextDate && inWindow(nextDate, now, 0, 120)) {
    output.push(event(`${symbol}-eia-release-${nextDate}`, title, nextDate, releaseTime, releaseTime ? "ET" : null,
      [commodity], title, url, now));
  }
  return output;
}

export function parseWasdeReleaseEvents(
  html: string,
  affectedCommodities: string[],
  now: Date,
): CommodityEvent[] {
  const text = normalizedText(html);
  const output: CommodityEvent[] = [];
  const schedulePattern = /\bIn\s+(20\d{2})\s+the\s+WASDE report will be released on\s+([\s\S]*?)(?=\bIn\s+20\d{2}\s+the\s+WASDE report|$)/gi;
  for (const match of text.matchAll(schedulePattern)) {
    const year = Number(match[1]);
    const list = match[2] ?? "";
    const datePattern = /\b(January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)\.?\s*(\d{1,2})\b/gi;
    for (const dateMatch of list.matchAll(datePattern)) {
      const date = toIsoDate(dateMatch[1]!, dateMatch[2]!, String(year));
      if (!date || !inWindow(date, now)) continue;
      output.push(event(`wasde-${date}`, "USDA WASDE supply and demand report", date,
        "12:00 PM", "ET", affectedCommodities, "USDA World Agricultural Supply and Demand Estimates",
        USDA_URL, now));
    }
  }
  return output;
}

export function parseBlsCpiEvents(html: string, commodity: string, now: Date): CommodityEvent[] {
  const text = normalizedText(html);
  const output: CommodityEvent[] = [];
  const rowPattern = /\b([A-Za-z]+\s+20\d{2})\s*\|\s*([A-Za-z]{3,9}\.?\s+\d{1,2},\s+20\d{2})\s*\|\s*(\d{1,2}:\d{2}\s*[AP]M)\b/g;
  for (const match of text.matchAll(rowPattern)) {
    const dateMatch = match[2]!.match(/^([A-Za-z]{3,9})\.?\s+(\d{1,2}),\s+(20\d{2})$/);
    const eventDate = dateMatch ? toIsoDate(dateMatch[1]!, dateMatch[2]!, dateMatch[3]!) : null;
    if (!eventDate || !inWindow(eventDate, now)) continue;
    output.push(event(`bls-cpi-${eventDate}`, `U.S. Consumer Price Index release · ${match[1]}`, eventDate,
      match[3]!.replace(/\s+/g, " ").toUpperCase(), "ET", [commodity], "U.S. Bureau of Labor Statistics CPI release schedule",
      BLS_CPI_URL, now));
  }
  return output;
}

function parseFomcStatementLinks(html: string): Map<string, string> {
  const links = new Map<string, string>();
  for (const match of html.matchAll(/href=["'](https:\/\/www\.federalreserve\.gov)?\/newsevents\/pressreleases\/monetary(20\d{6})a\.htm["']/gi)) {
    const url = `https://www.federalreserve.gov/newsevents/pressreleases/monetary${match[2]}a.htm`;
    const date = `${match[2]!.slice(0, 4)}-${match[2]!.slice(4, 6)}-${match[2]!.slice(6, 8)}`;
    if (validDate(date)) links.set(date, url);
  }
  return links;
}

export function parseFomcEvents(html: string, commodity: string, now: Date): CommodityEvent[] {
  const text = normalizedText(html);
  const year = now.getUTCFullYear();
  const heading = new RegExp(`\\b${year}\\s+FOMC Meetings\\b`, "i").exec(text);
  if (!heading) return [];
  const section = text.slice(heading.index + heading[0].length);
  const nextYearHeading = new RegExp(`\\b${year + 1}\\s+FOMC Meetings\\b`, "i").exec(section);
  const currentYear = nextYearHeading ? section.slice(0, nextYearHeading.index) : section;
  const statementLinks = parseFomcStatementLinks(html);
  const output: CommodityEvent[] = [];
  const meetingPattern = /\b(January|February|March|April|May|June|July|August|September|October|November|December)\s*(?:\|\s*)?(\d{1,2})\s*[-–]\s*(\d{1,2})\b/g;
  for (const match of currentYear.matchAll(meetingPattern)) {
    const eventDate = toIsoDate(match[1]!, match[3]!, String(year));
    if (!eventDate || !inWindow(eventDate, now)) continue;
    const statementUrl = statementLinks.get(eventDate);
    const item = event(`fomc-${eventDate}`, "Federal Reserve FOMC meeting", eventDate, null, null,
      [commodity], statementUrl ? "Federal Reserve FOMC statement" : "Federal Reserve FOMC meeting calendar",
      statementUrl ?? FOMC_URL, now);
    output.push(item);
  }
  return output;
}

function monthNumber(name: string): number | null {
  const month = MONTHS[name.toLowerCase()];
  return month === undefined ? null : month + 1;
}

export function parseBlsCpiIndex(
  response: unknown,
  item: CommodityEvent,
): CommodityPublishedValue | null {
  const period = item.name.match(/release\s*[·-]\s*([A-Za-z]+)\s+(20\d{2})$/i);
  if (!period) return null;
  const month = monthNumber(period[1]!);
  const year = Number(period[2]);
  if (!month || !Number.isInteger(year)) return null;
  const series = (response as { status?: unknown; Results?: { series?: unknown } } | null)?.Results?.series;
  if ((response as { status?: unknown } | null)?.status !== "REQUEST_SUCCEEDED" || !Array.isArray(series)) return null;
  const exactSeries = series.find((entry) => (entry as { seriesID?: unknown })?.seriesID === "CUUR0000SA0") as
    { data?: unknown } | undefined;
  if (!Array.isArray(exactSeries?.data)) return null;
  const record = exactSeries.data.find((entry) => {
    const row = entry as { year?: unknown; period?: unknown; latest?: unknown; footnotes?: unknown };
    return row.year === String(year) && row.period === `M${String(month).padStart(2, "0")}` && row.latest === "true";
  }) as { value?: unknown; footnotes?: unknown } | undefined;
  if (!record || (Array.isArray(record.footnotes) && record.footnotes.some((note) => {
    const entry = note as { code?: unknown; text?: unknown };
    return (typeof entry.code === "string" && entry.code.length > 0)
      || (typeof entry.text === "string" && entry.text.length > 0);
  }))) return null;
  const value = typeof record.value === "string" ? Number(record.value) : record.value;
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return null;
  return {
    value,
    units: "CPI-U index (1982–84=100), not seasonally adjusted",
    source: {
      title: "BLS CPI-U all-items series",
      url: `${BLS_CPI_API_URL}?startyear=${year}&endyear=${year}`,
      publicationDate: item.eventDate,
    },
  };
}

function parseFederalRate(value: string): number | null {
  const parts = value.trim().split("-");
  const whole = Number(parts[0]);
  if (!Number.isFinite(whole)) return null;
  if (parts.length === 1) return whole;
  const fraction = parts[1]!.split("/");
  if (fraction.length !== 2) return null;
  const numerator = Number(fraction[0]);
  const denominator = Number(fraction[1]);
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator <= 0) return null;
  return whole + numerator / denominator;
}

export function parseFomcPolicyValue(html: string, eventDate: string, sourceUrl: string): CommodityPublishedValue | null {
  const sourceDate = sourceUrl.match(/^https:\/\/www\.federalreserve\.gov\/newsevents\/pressreleases\/monetary(20\d{2})(\d{2})(\d{2})a\.htm$/);
  if (!sourceDate || `${sourceDate[1]}-${sourceDate[2]}-${sourceDate[3]}` !== eventDate) return null;
  const text = normalizedText(html);
  const dateMatch = text.match(/\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2}),\s+(20\d{2})\b/);
  if (!dateMatch || toIsoDate(dateMatch[1]!, dateMatch[2]!, dateMatch[3]!) !== eventDate) return null;
  const decision = text.match(/The Committee decided to [^.]*\./i)?.[0];
  const rate = decision?.match(/target range for the federal funds rate at ((?:\d+-)?\d+(?:\/\d+)?) to ((?:\d+-)?\d+(?:\/\d+)?) percent/i);
  if (!rate) return null;
  const lower = parseFederalRate(rate[1]!);
  const upper = parseFederalRate(rate[2]!);
  if (lower === null || upper === null || upper < lower) return null;
  return {
    value: lower,
    upperBound: upper,
    units: "percent, federal funds target range",
    source: {
      title: "Federal Reserve FOMC statement",
      url: sourceUrl,
      publicationDate: eventDate,
    },
  };
}

export function parseOpecMeetingEvents(
  html: string,
  sourceUrl: string,
  commodity: string,
  now: Date,
): CommodityEvent[] {
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(sourceUrl);
  } catch {
    return [];
  }
  if (parsedUrl.protocol !== "https:" || parsedUrl.hostname !== "www.opec.org"
    || !/^\/pr-detail\/\d+-[\w-]+\.html$/i.test(parsedUrl.pathname)) return [];
  const text = normalizedText(html);
  if (!/OPEC\+/.test(text) || !/\bmeeting\b/i.test(text)) return [];
  const datePattern = "([0-3]?\\d)\\s+(January|February|March|April|May|June|July|August|September|October|November|December)\\s+(20\\d{2})";
  const output: CommodityEvent[] = [];
  const publicationDateMatch = text.match(new RegExp(`\\b${datePattern}\\b`, "i"));
  const publicationDate = publicationDateMatch
    ? toIsoDate(publicationDateMatch[2]!, publicationDateMatch[1]!, publicationDateMatch[3]!)
    : null;
  const futureMatch = text.match(new RegExp(`\\bnext\\s+meeting\\s+(?:will\\s+be\\s+held|is\\s+scheduled|will\\s+take\\s+place)\\s+on\\s+${datePattern}`, "i"));
  if (futureMatch) {
    const eventDate = toIsoDate(futureMatch[2]!, futureMatch[1]!, futureMatch[3]!);
    if (eventDate && inWindow(eventDate, now, 0, 120)) {
      const item = event(`opec-meeting-${eventDate}`, "OPEC+ meeting", eventDate, null, null,
        [commodity], "OPEC official press release", sourceUrl, now);
      item.source.publicationDate = publicationDate;
      output.push(item);
    }
  }
  const pastPattern = new RegExp(`\\b(?:met\\s+(?:virtually\\s+)?|held\\s+a\\s+meeting\\s+(?:virtually\\s+)?|meeting\\s+was\\s+held\\s+(?:virtually\\s+)?)on\\s+${datePattern}`, "i");
  const pastMatch = text.match(pastPattern);
  if (pastMatch) {
    const eventDate = toIsoDate(pastMatch[2]!, pastMatch[1]!, pastMatch[3]!);
    if (eventDate && inWindow(eventDate, now, 30, 0)) {
      const item = event(`opec-meeting-${eventDate}`, "OPEC+ meeting", eventDate, null, null,
        [commodity], "OPEC official press release", sourceUrl, now);
      item.source.publicationDate = publicationDate;
      output.push(item);
    }
  }
  return output;
}

export function parseOpecPressReleaseLinks(html: string): string[] {
  const urls = [...html.matchAll(/href=["']([^"']*\/pr-detail\/\d+-[\w-]+\.html(?:\?[^"']*)?)["']/gi)]
    .flatMap((match) => {
      try {
        const url = new URL(match[1]!, "https://www.opec.org");
        return url.protocol === "https:" && url.hostname === "www.opec.org" ? [url.href] : [];
      } catch {
        return [];
      }
    });
  return [...new Set(urls)].slice(0, 8);
}

function withinFreshness(checkedAt: string, now: Date): boolean {
  const timestamp = Date.parse(checkedAt);
  const age = now.getTime() - timestamp;
  return Number.isFinite(timestamp) && age >= 0 && age <= 24 * 60 * 60 * 1000;
}

function knownEventSource(item: CommodityEvent): boolean {
  if (item.name === "USDA WASDE supply and demand report") return item.source.url === USDA_URL;
  if (item.name === "EIA Weekly Petroleum Status Report") return item.source.url === WPSR_URL;
  if (item.name === "EIA Weekly Natural Gas Storage Report") return item.source.url === GAS_URL;
  if (item.name.startsWith("U.S. Consumer Price Index release")) return item.source.url === BLS_CPI_URL;
  if (item.name === "Federal Reserve FOMC meeting") {
    return item.source.url === FOMC_URL
      || /^https:\/\/www\.federalreserve\.gov\/newsevents\/pressreleases\/monetary20\d{6}a\.htm$/.test(item.source.url);
  }
  if (item.name === "OPEC+ meeting") {
    try {
      const url = new URL(item.source.url);
      return url.protocol === "https:" && url.hostname === "www.opec.org"
        && /^\/pr-detail\/\d+-[\w-]+\.html$/i.test(url.pathname);
    } catch {
      return false;
    }
  }
  return false;
}

function knownPublishedValueSource(item: CommodityEvent, value: CommodityPublishedValue): boolean {
  if (!value.source) return true;
  try {
    const url = new URL(value.source.url);
    if (item.name.startsWith("U.S. Consumer Price Index release")) {
      return url.protocol === "https:" && url.hostname === "api.bls.gov"
        && url.pathname === "/publicAPI/v2/timeseries/data/CUUR0000SA0";
    }
    if (item.name === "Federal Reserve FOMC meeting") {
      return url.protocol === "https:" && url.hostname === "www.federalreserve.gov"
        && /^\/newsevents\/pressreleases\/monetary20\d{6}a\.htm$/.test(url.pathname);
    }
  } catch {
    return false;
  }
  return false;
}

export function validateCommodityEventCalendar(
  calendar: CommodityEventCalendar,
  symbol: string,
  now: Date,
): CommodityEventCalendar {
  const commodity = SUPPORTED_COMMODITIES[symbol.trim().toUpperCase()];
  const checkedAt = calendar?.checkedAt;
  if (!commodity || typeof checkedAt !== "string" || !withinFreshness(checkedAt, now)
    || !Array.isArray(calendar.events) || !Array.isArray(calendar.unavailable)) {
    return {
      status: "unavailable",
      checkedAt: now.toISOString(),
      events: [],
      unavailable: ["Official event schedules are unavailable or expired."],
    };
  }
  const events = calendar.events.filter((item) => item && typeof item === "object"
    && typeof item.id === "string" && item.id.length > 0
    && typeof item.name === "string" && item.name.length > 0
    && validDate(item.eventDate) && inWindow(item.eventDate, now)
    && item.status === statusFor(item.eventDate, now)
    && Array.isArray(item.affectedCommodities)
    && item.affectedCommodities.includes(commodity.name)
    && typeof item.source?.title === "string"
    && knownEventSource(item)
    && (item.source.publicationDate === null || validDate(item.source.publicationDate))
    && (item.time === null || typeof item.time === "string")
    && (item.timezone === null || typeof item.timezone === "string")
    && item.values
    && ["previous", "consensus", "actual"].every((key) => {
      const value = item.values[key as keyof CommodityEvent["values"]];
      if (value === null) return true;
      if (!Number.isFinite(value.value) || typeof value.units !== "string" || value.units.length === 0) return false;
      if (value.upperBound !== undefined && (!Number.isFinite(value.upperBound) || value.upperBound < value.value)) return false;
      if (value.source && (!validDate(value.source.publicationDate) || typeof value.source.title !== "string"
        || !value.source.title || !/^https:\/\//.test(value.source.url))) return false;
      return knownPublishedValueSource(item, value);
    }));
  const unavailable = calendar.unavailable.filter((item) => typeof item === "string" && item.trim().length > 0);
  return {
    status: events.length === 0 ? "unavailable" : unavailable.length ? "partial" : "available",
    checkedAt,
    events,
    unavailable,
  };
}

async function fetchPage(url: string): Promise<string> {
  const response = await fetch(url, {
    headers: { "User-Agent": "MeisnerMethod/1.0 (verified commodity event schedules)" },
    signal: AbortSignal.timeout(8_000),
  });
  if (!response.ok) throw new Error(`Official event schedule returned HTTP ${response.status}`);
  return response.text();
}

function isAgriculturalOrLivestock(symbol: string): boolean {
  return ["ZC=F", "ZW=F", "ZS=F", "CT=F", "SB=F", "LE=F", "HE=F"].includes(symbol);
}

export async function fetchCommodityEventCalendar(
  symbol: string,
  now = new Date(),
): Promise<CommodityEventCalendar> {
  const normalized = symbol.trim().toUpperCase();
  const commodity = SUPPORTED_COMMODITIES[normalized];
  if (!commodity) {
    return { status: "unavailable", checkedAt: now.toISOString(), events: [], unavailable: ["Unsupported commodity."] };
  }
  const key = `${normalized}:${now.toISOString().slice(0, 10)}`;
  const cached = cache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.calendar;
  const pending = requests.get(key);
  if (pending) return pending;
  const request = (async () => {
    const events: CommodityEvent[] = [];
    const unavailable = ["Geopolitical and unscheduled production events do not have a verified calendar."];
    let fomcHtml: string | null = null;
    const sources: Array<{ url: string; name: string; parse: (body: string) => CommodityEvent[] }> = [
      { url: BLS_CPI_URL, name: "BLS CPI schedule", parse: (body) => parseBlsCpiEvents(body, commodity.name, now) },
      {
        url: FOMC_URL,
        name: "Federal Reserve schedule",
        parse: (body) => {
          fomcHtml = body;
          return parseFomcEvents(body, commodity.name, now);
        },
      },
    ];
    if (normalized === "CL=F") {
      sources.push({ url: WPSR_URL, name: "EIA petroleum schedule", parse: (body) => parseEiaReleaseEvents(body, "wpsr", commodity.name, normalized, now) });
    } else if (normalized === "NG=F") {
      sources.push({ url: GAS_URL, name: "EIA natural gas schedule", parse: (body) => parseEiaReleaseEvents(body, "natural-gas", commodity.name, normalized, now) });
    }
    if (isAgriculturalOrLivestock(normalized)) {
      sources.push({
        url: USDA_URL,
        name: "USDA WASDE schedule",
        parse: (body) => parseWasdeReleaseEvents(body, [commodity.name], now),
      });
    }
    await Promise.all(sources.map(async (source) => {
      try {
        events.push(...source.parse(await fetchPage(source.url)));
      } catch {
        unavailable.push(`${source.name} unavailable; no dates were inferred.`);
      }
    }));
    const statementLinks = fomcHtml ? parseFomcStatementLinks(fomcHtml) : new Map<string, string>();
    await Promise.all(events.map(async (item) => {
      if (item.status !== "completed") return;
      if (item.name.startsWith("U.S. Consumer Price Index release")) {
        const year = item.name.match(/(20\d{2})$/)?.[1];
        if (!year) return;
        try {
          const url = `${BLS_CPI_API_URL}?startyear=${year}&endyear=${year}`;
          const response = await fetch(url, {
            headers: { "User-Agent": "MeisnerMethod/1.0 (verified BLS CPI data)" },
            signal: AbortSignal.timeout(8_000),
          });
          if (!response.ok) throw new Error(`BLS CPI series returned HTTP ${response.status}`);
          const actual = parseBlsCpiIndex(await response.json(), item);
          if (!actual) {
            unavailable.push(`BLS CPI result for ${item.eventDate} is not current or could not be verified.`);
            return;
          }
          item.values.actual = actual;
          item.source.publicationDate = actual.source?.publicationDate ?? null;
          item.source.url = BLS_CPI_URL;
          unavailable.push(`Prior CPI release value for ${item.eventDate} is unavailable without a verified release-specific snapshot.`);
        } catch {
          unavailable.push(`BLS CPI result for ${item.eventDate} is unavailable; no value was inferred.`);
        }
        return;
      }
      if (item.name !== "Federal Reserve FOMC meeting") return;
      const statementUrl = statementLinks.get(item.eventDate);
      if (!statementUrl) {
        unavailable.push(`Federal Reserve policy result for ${item.eventDate} is unavailable without a matching statement.`);
        return;
      }
      try {
        const currentHtml = await fetchPage(statementUrl);
        const actual = parseFomcPolicyValue(currentHtml, item.eventDate, statementUrl);
        if (!actual) {
          unavailable.push(`Federal Reserve policy result for ${item.eventDate} could not be verified in its statement.`);
          return;
        }
        const priorDate = [...statementLinks.keys()].filter((date) => date < item.eventDate).sort().at(-1);
        let previous: CommodityPublishedValue | null = null;
        if (priorDate) {
          const priorUrl = statementLinks.get(priorDate)!;
          try {
            previous = parseFomcPolicyValue(await fetchPage(priorUrl), priorDate, priorUrl);
          } catch {
            previous = null;
          }
        }
        item.values.actual = actual;
        item.values.previous = previous;
        item.source = { title: actual.source!.title, url: actual.source!.url, publicationDate: actual.source!.publicationDate };
        if (!previous && priorDate) {
          unavailable.push(`Prior Federal Reserve policy value for ${item.eventDate} is unavailable.`);
        }
      } catch {
        unavailable.push(`Federal Reserve policy result for ${item.eventDate} is unavailable; no value was inferred.`);
      }
    }));
    if (normalized === "CL=F") {
      try {
        const releasePage = await fetchPage(OPEC_RELEASES_URL);
        const releaseUrls = parseOpecPressReleaseLinks(releasePage);
        const details = await Promise.all(releaseUrls.map(async (url) => {
          try {
            return { url, html: await fetchPage(url) };
          } catch {
            return null;
          }
        }));
        for (const detail of details) {
          if (detail) events.push(...parseOpecMeetingEvents(detail.html, detail.url, commodity.name, now));
        }
        if (!events.some((item) => item.name === "OPEC+ meeting" && item.status === "upcoming")) {
          unavailable.push("No upcoming OPEC+ meeting date was found in recent official press releases.");
        }
      } catch {
        unavailable.push("OPEC+ meeting schedule unavailable; no date was inferred.");
      }
    }
    const unique = [...new Map(events.map((item) => [item.id, item])).values()]
      .sort((a, b) => a.eventDate.localeCompare(b.eventDate) || a.name.localeCompare(b.name));
    const data: CommodityEventCalendar = {
      status: unique.length === 0 ? "unavailable" : unavailable.length ? "partial" : "available",
      checkedAt: now.toISOString(),
      events: unique,
      unavailable,
    };
    cache.set(key, { calendar: data, expiresAt: Date.now() + CACHE_MS });
    return data;
  })().finally(() => {
    if (requests.get(key) === request) requests.delete(key);
  });
  requests.set(key, request);
  return request;
}
