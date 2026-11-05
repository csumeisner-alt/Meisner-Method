import assert from "node:assert/strict";
import test from "node:test";
import {
  parseBlsCpiEvents,
  parseBlsCpiArchiveValue,
  parseEiaReleaseEvents,
  parseFomcEvents,
  parseFomcPolicyValue,
  parseOpecMeetingEvents,
  parseOpecPressReleaseLinks,
  parseWasdeReleaseEvents,
  fetchCommodityEventCalendar,
  validateCommodityEventCalendar,
} from "./commodityEvents.ts";
import type { CommodityEventCalendar } from "./commodityAnalysis.ts";

const NOW = new Date("2026-11-05T12:00:00.000Z");
const RELEASE_MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

function cpiArchive(referenceMonth: string, releaseDate: string, index: string, note = "", annualRate: string | null = "3.7"): string {
  const [year, month, day] = releaseDate.split("-");
  return `Transmission of material in this release is embargoed until 8:30 a.m. (ET) Wednesday, ${RELEASE_MONTHS[Number(month) - 1]} ${Number(day)}, ${year}
    CONSUMER PRICE INDEX - ${referenceMonth}
    Not seasonally adjusted CPI measures
    The Consumer Price Index for All Urban Consumers (CPI-U) ${annualRate === null ? "" : `increased ${annualRate} percent over the last 12 months to an `}index level of ${index} (1982-84=100).
    ${note}`;
}

test("EIA release parser separates the recent release from a confirmed next report", () => {
  const html = "Weekly Petroleum Status Report | Data for week ending Nov. 1, 2026 | Release Date: Nov. 4, 2026 | Next Release Date: Nov. 12, 2026";
  const events = parseEiaReleaseEvents(html, "wpsr", "Crude Oil", "CL=F", NOW);
  assert.deepEqual(events.map((item) => [item.eventDate, item.status]).sort((a, b) => String(a[0]).localeCompare(String(b[0]))), [
    ["2026-11-04", "completed"],
    ["2026-11-12", "upcoming"],
  ]);
  assert.equal(events[0]!.source.url, "https://www.eia.gov/petroleum/supply/weekly/");
  assert.equal(events[0]!.values.actual, null, "report values are unavailable until tied to a dated inventory observation");
});

test("natural-gas EIA schedule includes a published release time when present", () => {
  const html = "Released: October 29, 2026 at 10:30 a.m. | Next Release: November 5, 2026";
  const events = parseEiaReleaseEvents(html, "natural-gas", "Natural Gas", "NG=F", NOW);
  const next = events.find((item) => item.eventDate === "2026-11-05");
  assert.equal(events.find((item) => item.eventDate === "2026-10-29")?.status, "completed");
  assert.equal(next?.status, "upcoming");
  assert.equal(next?.time, "10:30 AM");
  assert.equal(next?.timezone, "ET");
});

test("USDA schedule parses confirmed dates and time, but ignores expired dates", () => {
  const html = [
    "2026 WASDE Release Dates (12:00pm ET)",
    "In 2026 the WASDE report will be released on Jan. 12, Feb. 10, Mar. 10, Apr. 9, May 12, Jun. 11, Jul. 10, Aug. 12, Sep. 11, Oct. 9, Nov. 10, and Dec. 10.",
    "2027 WASDE Release Dates (12:00pm ET)",
    "In 2027 the WASDE report will be released on Jan. 12, Feb. 10, and Mar. 10.",
  ].join(" ");
  const events = parseWasdeReleaseEvents(html, ["Corn"], NOW);
  assert.deepEqual(events.map((item) => item.eventDate), [
    "2026-10-09",
    "2026-11-10",
    "2026-12-10",
    "2027-01-12",
    "2027-02-10",
  ]);
  const next = events.find((item) => item.eventDate === "2026-11-10")!;
  assert.equal(next.time, "12:00 PM");
  assert.equal(next.timezone, "ET");
  assert.equal(next.affectedCommodities[0], "Corn");
});

test("BLS CPI and Federal Reserve meeting calendars include only source dates in range", () => {
  const cpi = parseBlsCpiEvents(
    "Reference Month | Release Date | Release Time | October 2026 | Nov. 12, 2026 | 08:30 AM",
    "Gold",
    NOW,
  );
  assert.equal(cpi[0]?.eventDate, "2026-11-12");
  assert.equal(cpi[0]?.time, "08:30 AM");
  assert.match(cpi[0]!.name, /October 2026/);

  const fomc = parseFomcEvents(
    "2026 FOMC Meetings January | 27-28 March | 17-18 October | 27-28 December | 8-9 2027 FOMC Meetings",
    "Gold",
    NOW,
  );
  assert.deepEqual(fomc.map((item) => [item.eventDate, item.status]), [
    ["2026-10-28", "completed"],
    ["2026-12-09", "upcoming"],
  ]);
});

test("CPI archive value requires the matching reference month, release date, and unrevised index", () => {
  const item = parseBlsCpiEvents(
    "Reference Month | Release Date | Release Time | September 2026 | Oct. 14, 2026 | 08:30 AM",
    "Gold",
    NOW,
  )[0]!;
  const archive = cpiArchive("September 2026", "2026-10-14", "336.940");
  assert.deepEqual(parseBlsCpiArchiveValue(archive, item), {
    value: 336.94,
    units: "CPI-U index (1982–84=100), not seasonally adjusted",
    annualRate: {
      value: 3.7,
      units: "% year over year, not seasonally adjusted",
      source: {
        title: "BLS CPI-U September 2026 annual inflation rate",
        url: "https://www.bls.gov/news.release/archives/cpi_10142026.htm",
        publicationDate: "2026-10-14",
      },
    },
    source: {
      title: "BLS CPI-U September 2026 archived release",
      url: "https://www.bls.gov/news.release/archives/cpi_10142026.htm",
      publicationDate: "2026-10-14",
    },
  });
  const missingRate = parseBlsCpiArchiveValue(cpiArchive("September 2026", "2026-10-14", "336.940", "", null), item);
  assert.equal(missingRate?.value, 336.94, "the index remains available when the dated release has no matching annual rate");
  assert.equal(missingRate?.annualRate, null, "an absent annual rate remains unavailable");
  const decreasingRate = parseBlsCpiArchiveValue(
    cpiArchive("September 2026", "2026-10-14", "336.940").replace("increased 3.7 percent", "decreased 0.2 percent"),
    item,
  );
  assert.equal(decreasingRate?.annualRate?.value, -0.2, "a published decrease retains its negative sign");
  assert.equal(parseBlsCpiArchiveValue("", item), null, "missing archive page is unavailable");
  assert.equal(parseBlsCpiArchiveValue(cpiArchive("August 2026", "2026-10-14", "336.940"), item), null,
    "an archive for a different reference month is rejected");
  assert.equal(parseBlsCpiArchiveValue(cpiArchive("September 2026", "2026-10-13", "336.940"), item), null,
    "a page with a mismatched release date is rejected");
  assert.equal(parseBlsCpiArchiveValue(cpiArchive("September 2026", "2026-10-14", "336.940", "The CPI-U table was revised."), item), null,
    "a release marked revised is unavailable");
});

test("FOMC target range parses supported wording and numeric formats from the dated statement", () => {
  const url = "https://www.federalreserve.gov/newsevents/pressreleases/monetary20261028a.htm";
  const statements = [
    {
      text: "October 28, 2026. The Committee decided to maintain the target range for the federal funds rate at 3-3/4 to 4 percent.",
      value: 3.75,
      upperBound: 4,
    },
    {
      text: "October 28, 2026. The Committee decided to raise the target range for the federal funds rate to 1/4 to 1/2 percent.",
      value: 0.25,
      upperBound: 0.5,
    },
    {
      text: "October 28, 2026. The Committee decided to lower the target range for the federal funds rate to 4.25 to 4.5 percent.",
      value: 4.25,
      upperBound: 4.5,
    },
    {
      text: "October 28, 2026. The Committee decided to maintain the target range for the federal funds rate at 3–3/4 to 4 percent.",
      value: 3.75,
      upperBound: 4,
    },
  ];
  for (const statement of statements) {
    const result = parseFomcPolicyValue(statement.text, "2026-10-28", url);
    assert.equal(result?.value, statement.value, statement.text);
    assert.equal(result?.upperBound, statement.upperBound, statement.text);
    assert.equal(result?.source?.publicationDate, "2026-10-28", statement.text);
    assert.equal(result?.source?.url, url, statement.text);
  }
});

test("FOMC target range leaves unsupported, malformed, or ambiguous wording unavailable", () => {
  const url = "https://www.federalreserve.gov/newsevents/pressreleases/monetary20261028a.htm";
  const unsupported = "October 28, 2026. The Committee decided to set the federal funds rate between 3.5 and 4 percent.";
  const malformed = "October 28, 2026. The Committee decided to maintain the target range for the federal funds rate at 3-5/4 to 4 percent.";
  const equalBounds = "October 28, 2026. The Committee decided to maintain the target range for the federal funds rate at 4 to 4 percent.";
  const ambiguous = "October 28, 2026. The Committee decided to maintain the target range for the federal funds rate at 3 to 3.25 percent; target range for the federal funds rate at 3.25 to 3.5 percent.";
  for (const statement of [unsupported, malformed, equalBounds, ambiguous]) {
    assert.equal(parseFomcPolicyValue(statement, "2026-10-28", url), null, statement);
  }
});

test("FOMC target range requires matching dates in the event, URL, and statement", () => {
  const url = "https://www.federalreserve.gov/newsevents/pressreleases/monetary20261028a.htm";
  const statement = "October 28, 2026. The Committee decided to maintain the target range for the federal funds rate at 3-3/4 to 4 percent.";
  assert.equal(parseFomcPolicyValue(statement, "2026-09-16", url), null);
  assert.equal(parseFomcPolicyValue(statement, "2026-10-28", "https://example.com/monetary20261028a.htm"), null);
  assert.equal(
    parseFomcPolicyValue(statement.replace("October 28, 2026", "October 27, 2026"), "2026-10-28", url),
    null,
  );
});

test("unsupported FOMC statement wording is reported as unavailable, not guessed", async () => {
  const originalFetch = globalThis.fetch;
  const statementUrl = "https://www.federalreserve.gov/newsevents/pressreleases/monetary20261028a.htm";
  globalThis.fetch = async (input) => {
    const url = String(input);
    if (url === "https://www.bls.gov/schedule/news_release/cpi.htm") return new Response("");
    if (url === "https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm") {
      return new Response([
        "2026 FOMC Meetings September | 15-16 October | 27-28 December | 8-9",
        `<a href="${statementUrl}">HTML</a>`,
      ].join(" "));
    }
    if (url === statementUrl) {
      return new Response("October 28, 2026. The Committee decided to set the federal funds rate between 3.5 and 4 percent.");
    }
    throw new Error(`Unexpected source request: ${url}`);
  };
  try {
    const result = await fetchCommodityEventCalendar("SI=F", new Date("2026-11-06T12:00:00.000Z"));
    const fomc = result.events.find((item) => item.name === "Federal Reserve FOMC meeting");
    assert.equal(fomc?.values.actual, null);
    assert.ok(result.unavailable.some((item) => item.includes("Federal Reserve policy result for 2026-10-28 could not be verified")));
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("completed CPI and FOMC events include only official dated results", async () => {
  const originalFetch = globalThis.fetch;
  const currentStatementUrl = "https://www.federalreserve.gov/newsevents/pressreleases/monetary20261028a.htm";
  const priorStatementUrl = "https://www.federalreserve.gov/newsevents/pressreleases/monetary20260916a.htm";
  globalThis.fetch = async (input) => {
    const url = String(input);
    if (url === "https://www.bls.gov/schedule/news_release/cpi.htm") {
      return new Response("Reference Month | Release Date | Release Time | August 2026 | Sep. 11, 2026 | 08:30 AM | September 2026 | Oct. 14, 2026 | 08:30 AM | October 2026 | Nov. 12, 2026 | 08:30 AM");
    }
    if (url === "https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm") {
      return new Response([
        "2026 FOMC Meetings September | 15-16 October | 27-28 December | 8-9",
        `<a href="${priorStatementUrl}">HTML</a><a href="${currentStatementUrl}">HTML</a>`,
      ].join(" "));
    }
    if (url === "https://www.bls.gov/news.release/archives/cpi_10142026.htm") {
      return new Response(cpiArchive("September 2026", "2026-10-14", "336.940"));
    }
    if (url === "https://www.bls.gov/news.release/archives/cpi_09112026.htm") {
      return new Response(cpiArchive("August 2026", "2026-09-11", "334.980"));
    }
    if (url === currentStatementUrl) {
      return new Response("October 28, 2026. The Committee decided to maintain the target range for the federal funds rate at 3-3/4 to 4 percent.");
    }
    if (url === priorStatementUrl) {
      return new Response("September 16, 2026. The Committee decided to maintain the target range for the federal funds rate at 3-1/2 to 3-3/4 percent.");
    }
    throw new Error(`Unexpected source request: ${url}`);
  };
  try {
    const result = await fetchCommodityEventCalendar("SI=F", NOW);
    const cpi = result.events.find((item) => item.eventDate === "2026-10-14");
    const fomc = result.events.find((item) => item.name === "Federal Reserve FOMC meeting");
    assert.equal(cpi?.values.consensus, null);
    assert.equal(cpi?.values.actual?.value, 336.94);
    assert.equal(cpi?.values.actual?.annualRate?.value, 3.7);
    assert.equal(cpi?.values.actual?.source?.publicationDate, "2026-10-14");
    assert.equal(cpi?.values.previous?.value, 334.98);
    assert.equal(cpi?.values.previous?.annualRate?.value, 3.7);
    assert.equal(cpi?.values.previous?.source?.publicationDate, "2026-09-11");
    assert.notEqual(cpi?.values.actual?.source?.url, cpi?.values.previous?.source?.url);
    assert.notEqual(cpi?.values.actual?.annualRate?.source?.url, cpi?.values.previous?.annualRate?.source?.url);
    assert.equal(cpi?.values.actual?.annualRate?.source?.publicationDate, "2026-10-14");
    assert.equal(cpi?.values.previous?.annualRate?.source?.publicationDate, "2026-09-11");
    assert.equal(cpi?.source.url, cpi?.values.actual?.source?.url);
    const validated = validateCommodityEventCalendar(result, "SI=F", NOW);
    assert.equal(validated.events.find((item) => item.eventDate === "2026-10-14")?.values.previous?.value, 334.98);
    assert.equal(validated.events.find((item) => item.eventDate === "2026-10-14")?.values.actual?.annualRate?.value, 3.7);
    assert.equal(fomc?.values.actual?.value, 3.75);
    assert.equal(fomc?.values.actual?.upperBound, 4);
    assert.equal(fomc?.values.previous?.value, 3.5);
    assert.equal(fomc?.values.previous?.upperBound, 3.75);
    assert.equal(fomc?.values.actual?.source?.url, currentStatementUrl);
    assert.equal(fomc?.values.previous?.source?.url, priorStatementUrl);
    assert.equal(fomc?.values.actual?.source?.publicationDate, "2026-10-28");
    assert.equal(fomc?.values.previous?.source?.publicationDate, "2026-09-16");
    assert.equal(fomc?.source.publicationDate, "2026-10-28");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("FOMC event keeps its current range but leaves the prior range unavailable if its statement date mismatches", async () => {
  const originalFetch = globalThis.fetch;
  const currentStatementUrl = "https://www.federalreserve.gov/newsevents/pressreleases/monetary20261028a.htm";
  const priorStatementUrl = "https://www.federalreserve.gov/newsevents/pressreleases/monetary20260916a.htm";
  globalThis.fetch = async (input) => {
    const url = String(input);
    if (url === "https://www.bls.gov/schedule/news_release/cpi.htm") return new Response("");
    if (url === "https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm") {
      return new Response([
        "2026 FOMC Meetings September | 15-16 October | 27-28 December | 8-9",
        `<a href="${priorStatementUrl}">HTML</a><a href="${currentStatementUrl}">HTML</a>`,
      ].join(" "));
    }
    if (url === currentStatementUrl) {
      return new Response("October 28, 2026. The Committee decided to maintain the target range for the federal funds rate at 3-3/4 to 4 percent.");
    }
    if (url === priorStatementUrl) {
      return new Response("September 15, 2026. The Committee decided to maintain the target range for the federal funds rate at 3-1/2 to 3-3/4 percent.");
    }
    throw new Error(`Unexpected source request: ${url}`);
  };
  try {
    const result = await fetchCommodityEventCalendar("GC=F", NOW);
    const fomc = result.events.find((item) => item.name === "Federal Reserve FOMC meeting");
    assert.equal(fomc?.values.actual?.source?.publicationDate, "2026-10-28");
    assert.equal(fomc?.values.previous, null);
    assert.ok(result.unavailable.some((item) => item.includes("Prior Federal Reserve policy value")));
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("OPEC+ dates are accepted only from a recent official press release", () => {
  const source = "https://www.opec.org/pr-detail/620-1-november-2026.html";
  const article = [
    "Saudi Arabia, Russia, Iraq, Kuwait, Kazakhstan, Algeria, and Oman reaffirm commitment to market stability.",
    "The seven OPEC+ countries met virtually on 1 November 2026.",
    "The next meeting will be held on 29 November 2026.",
  ].join(" ");
  const events = parseOpecMeetingEvents(article, source, "Crude Oil", NOW);
  assert.deepEqual(events.map((item) => [item.eventDate, item.status]).sort((a, b) => String(a[0]).localeCompare(String(b[0]))), [
    ["2026-11-01", "completed"],
    ["2026-11-29", "upcoming"],
  ]);
  assert.equal(events.find((item) => item.eventDate === "2026-11-29")!.source.publicationDate, "2026-11-01");
  assert.equal(parseOpecMeetingEvents(article, "https://example.com/pr-detail/620-1-november-2026.html", "Crude Oil", NOW).length, 0);
  assert.deepEqual(parseOpecPressReleaseLinks(
    '<a href="/pr-detail/620-1-november-2026.html">release</a><a href="https://example.com/pr-detail/1-x.html">bad</a>',
  ), [source]);
});

test("event calendar validation rejects stale, irrelevant, malformed, and unknown-source entries", () => {
  const validCalendar: CommodityEventCalendar = {
    status: "available",
    checkedAt: NOW.toISOString(),
    events: [{
      id: "bls-cpi-2026-11-12",
      name: "U.S. Consumer Price Index release",
      eventDate: "2026-11-12",
      time: "08:30 AM",
      timezone: "ET",
      status: "upcoming",
      affectedCommodities: ["Gold"],
      source: {
        title: "BLS CPI schedule",
        url: "https://www.bls.gov/schedule/news_release/cpi.htm",
        publicationDate: null,
      },
      values: { previous: null, consensus: null, actual: null },
    }],
    unavailable: ["OPEC+ meeting dates unavailable unless officially confirmed."],
  };
  assert.equal(validateCommodityEventCalendar(validCalendar, "GC=F", NOW).events.length, 1);
  assert.equal(validateCommodityEventCalendar(validCalendar, "CL=F", NOW).events.length, 0);
  const wrongSource = structuredClone(validCalendar);
  wrongSource.events[0]!.source.url = "https://example.com/calendar";
  assert.equal(validateCommodityEventCalendar(wrongSource, "GC=F", NOW).events.length, 0);
  const stale = { ...validCalendar, checkedAt: "2026-11-01T12:00:00.000Z" };
  assert.equal(validateCommodityEventCalendar(stale, "GC=F", NOW).status, "unavailable");
});

test("event source outages return explicit unavailable schedules instead of guessed dates", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => { throw new Error("calendar source unavailable"); };
  try {
    const result = await fetchCommodityEventCalendar("PA=F", NOW);
    assert.equal(result.status, "unavailable");
    assert.equal(result.events.length, 0);
    assert.ok(result.unavailable.some((item) => item.includes("BLS CPI schedule unavailable")));
    assert.ok(result.unavailable.some((item) => item.includes("Federal Reserve schedule unavailable")));
  } finally {
    globalThis.fetch = originalFetch;
  }
});
