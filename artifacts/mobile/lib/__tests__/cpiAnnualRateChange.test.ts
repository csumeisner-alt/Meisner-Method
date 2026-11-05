import assert from "node:assert/strict";
import test from "node:test";
import { getCpiAnnualRateChange } from "../cpiAnnualRateChange.ts";

function publishedValue(date: string, rate: number) {
  const [year, month, day] = date.split("-");
  const url = `https://www.bls.gov/news.release/archives/cpi_${month}${day}${year}.htm`;
  return {
    annualRate: { value: rate, source: { url, publicationDate: date } },
    source: { url, publicationDate: date },
  };
}

test("CPI annual-rate movement reports rises and eases in percentage points", () => {
  assert.deepEqual(
    getCpiAnnualRateChange(publishedValue("2026-09-11", 3.7), publishedValue("2026-10-14", 3.9), "2026-10-14"),
    { direction: "rose", percentagePoints: 0.2 },
  );
  assert.deepEqual(
    getCpiAnnualRateChange(publishedValue("2026-09-11", 3.7), publishedValue("2026-10-14", 3.5), "2026-10-14"),
    { direction: "eased", percentagePoints: 0.2 },
  );
  assert.deepEqual(
    getCpiAnnualRateChange(publishedValue("2026-09-11", 3.7), publishedValue("2026-10-14", 3.7), "2026-10-14"),
    { direction: "unchanged", percentagePoints: 0 },
  );
});

test("CPI annual-rate movement is omitted unless both dated BLS rates are verified", () => {
  const previous = publishedValue("2026-09-11", 3.7);
  const actual = publishedValue("2026-10-14", 3.9);
  assert.equal(getCpiAnnualRateChange(null, actual, "2026-10-14"), null);

  const noPreviousRate = { ...previous, annualRate: null };
  assert.equal(getCpiAnnualRateChange(noPreviousRate, actual, "2026-10-14"), null);

  const mismatchedRateDate = {
    ...previous,
    annualRate: { ...previous.annualRate, source: { ...previous.annualRate.source, publicationDate: "2026-09-10" } },
  };
  assert.equal(getCpiAnnualRateChange(mismatchedRateDate, actual, "2026-10-14"), null);

  const wrongActualRelease = { ...actual, source: { ...actual.source, publicationDate: "2026-10-13" } };
  assert.equal(getCpiAnnualRateChange(previous, wrongActualRelease, "2026-10-14"), null);

  const wrongBlsUrl = { ...actual, annualRate: { ...actual.annualRate, source: { ...actual.annualRate.source, url: "https://example.com/cpi.htm" } } };
  assert.equal(getCpiAnnualRateChange(previous, wrongBlsUrl, "2026-10-14"), null);
});
