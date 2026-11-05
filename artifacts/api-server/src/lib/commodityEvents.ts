import {
  SUPPORTED_COMMODITIES,
  type CommodityEvent,
  type CommodityEventCalendar,
} from "./commodityAnalysis.ts";

const DAY_MS = 86_400_000;
const USDA_URL = "https://www.usda.gov/about-usda/general-information/staff-offices/office-chief-economist/commodity-markets/wasde-report";
const WPSR_URL = "https://www.eia.gov/petroleum/supply/weekly/";
const GAS_URL = "https://www.eia.gov/naturalgas/storage/";
const BLS_CPI_URL = "https://www.bls.gov/schedule/news_release/cpi.htm";
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
    output.push(event(`bls-cpi-${eventDate}`, "U.S. Consumer Price Index release", eventDate,
      match[3]!.replace(/\s+/g, " ").toUpperCase(), "ET", [commodity], "U.S. Bureau of Labor Statistics CPI release schedule",
      BLS_CPI_URL, now));
  }
  return output;
}

export function parseFomcEvents(html: string, commodity: string, now: Date): CommodityEvent[] {
  const text = normalizedText(html);
  const year = now.getUTCFullYear();
  const heading = new RegExp(`\\b${year}\\s+FOMC Meetings\\b`, "i").exec(text);
  if (!heading) return [];
  const section = text.slice(heading.index + heading[0].length);
  const nextYearHeading = new RegExp(`\\b${year + 1}\\s+FOMC Meetings\\b`, "i").exec(section);
  const currentYear = nextYearHeading ? section.slice(0, nextYearHeading.index) : section;
  const output: CommodityEvent[] = [];
  const meetingPattern = /\b(January|February|March|April|May|June|July|August|September|October|November|December)\s*(?:\|\s*)?(\d{1,2})\s*[-–]\s*(\d{1,2})\b/g;
  for (const match of currentYear.matchAll(meetingPattern)) {
    const eventDate = toIsoDate(match[1]!, match[3]!, String(year));
    if (!eventDate || !inWindow(eventDate, now)) continue;
    output.push(event(`fomc-${eventDate}`, "Federal Reserve FOMC meeting", eventDate, null, null,
      [commodity], "Federal Reserve FOMC meeting calendar", FOMC_URL, now));
  }
  return output;
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
  if (item.name === "U.S. Consumer Price Index release") return item.source.url === BLS_CPI_URL;
  if (item.name === "Federal Reserve FOMC meeting") return item.source.url === FOMC_URL;
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
      return value === null || (Number.isFinite(value.value) && typeof value.units === "string" && value.units.length > 0);
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
    const sources: Array<{ url: string; name: string; parse: (body: string) => CommodityEvent[] }> = [
      { url: BLS_CPI_URL, name: "BLS CPI schedule", parse: (body) => parseBlsCpiEvents(body, commodity.name, now) },
      { url: FOMC_URL, name: "Federal Reserve schedule", parse: (body) => parseFomcEvents(body, commodity.name, now) },
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
