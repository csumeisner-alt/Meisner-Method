import assert from "node:assert/strict";
import test from "node:test";
import {
  parseBlsCpiEvents,
  parseBlsCpiIndex,
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

test("CPI result is accepted only for the latest matching BLS period without revision notes", () => {
  const item = parseBlsCpiEvents(
    "Reference Month | Release Date | Release Time | September 2026 | Oct. 13, 2026 | 08:30 AM",
    "Gold",
    NOW,
  )[0]!;
  const response = {
    status: "REQUEST_SUCCEEDED",
    Results: { series: [{
      seriesID: "CUUR0000SA0",
      data: [
        { year: "2026", period: "M09", latest: "true", value: "336.940", footnotes: [{}] },
        { year: "2026", period: "M08", value: "334.980", footnotes: [{}] },
      ],
    }] },
  };
  assert.deepEqual(parseBlsCpiIndex(response, item), {
    value: 336.94,
    units: "CPI-U index (1982–84=100), not seasonally adjusted",
    source: {
      title: "BLS CPI-U all-items series",
      url: "https://api.bls.gov/publicAPI/v2/timeseries/data/CUUR0000SA0?startyear=2026&endyear=2026",
      publicationDate: "2026-10-13",
    },
  });
  const stale = structuredClone(response);
  stale.Results.series[0]!.data[0]!.latest = "false";
  assert.equal(parseBlsCpiIndex(stale, item), null);
  const revised = structuredClone(response);
  revised.Results.series[0]!.data[0]!.footnotes = [{ code: "R", text: "Revised" }];
  assert.equal(parseBlsCpiIndex(revised, item), null);
});

test("FOMC target range must match the dated official statement", () => {
  const url = "https://www.federalreserve.gov/newsevents/pressreleases/monetary20261028a.htm";
  const statement = "October 28, 2026. The Committee decided to maintain the target range for the federal funds rate at 3-3/4 to 4 percent.";
  assert.deepEqual(parseFomcPolicyValue(statement, "2026-10-28", url), {
    value: 3.75,
    upperBound: 4,
    units: "percent, federal funds target range",
    source: {
      title: "Federal Reserve FOMC statement",
      url,
      publicationDate: "2026-10-28",
    },
  });
  assert.equal(parseFomcPolicyValue(statement, "2026-09-16", url), null);
  assert.equal(parseFomcPolicyValue(statement, "2026-10-28", "https://example.com/monetary20261028a.htm"), null);
});

test("completed CPI and FOMC events include only official dated results", async () => {
  const originalFetch = globalThis.fetch;
  const currentStatementUrl = "https://www.federalreserve.gov/newsevents/pressreleases/monetary20261028a.htm";
  const priorStatementUrl = "https://www.federalreserve.gov/newsevents/pressreleases/monetary20260916a.htm";
  globalThis.fetch = async (input) => {
    const url = String(input);
    if (url === "https://www.bls.gov/schedule/news_release/cpi.htm") {
      return new Response("Reference Month | Release Date | Release Time | September 2026 | Oct. 13, 2026 | 08:30 AM");
    }
    if (url === "https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm") {
      return new Response([
        "2026 FOMC Meetings September | 15-16 October | 27-28 December | 8-9",
        `<a href="${priorStatementUrl}">HTML</a><a href="${currentStatementUrl}">HTML</a>`,
      ].join(" "));
    }
    if (url.startsWith("https://api.bls.gov/publicAPI/v2/timeseries/data/CUUR0000SA0")) {
      return Response.json({
        status: "REQUEST_SUCCEEDED",
        Results: { series: [{ seriesID: "CUUR0000SA0", data: [
          { year: "2026", period: "M09", latest: "true", value: "336.940", footnotes: [{}] },
        ] }] },
      });
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
    const cpi = result.events.find((item) => item.name.startsWith("U.S. Consumer Price Index"));
    const fomc = result.events.find((item) => item.name === "Federal Reserve FOMC meeting");
    assert.deepEqual(cpi?.values.previous, null);
    assert.equal(cpi?.values.consensus, null);
    assert.equal(cpi?.values.actual?.value, 336.94);
    assert.equal(cpi?.values.actual?.source?.publicationDate, "2026-10-13");
    assert.equal(fomc?.values.actual?.value, 3.75);
    assert.equal(fomc?.values.actual?.upperBound, 4);
    assert.equal(fomc?.values.previous?.value, 3.5);
    assert.equal(fomc?.values.previous?.upperBound, 3.75);
    assert.equal(fomc?.values.previous?.source?.url, priorStatementUrl);
    assert.equal(fomc?.source.publicationDate, "2026-10-28");
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
