import test from "node:test";
import assert from "node:assert/strict";
import { fallbackAiAnalysis, parseAiAnalysis } from "./analysisResponse.ts";

test("parses the expected AI analysis object", () => {
  assert.deepEqual(parseAiAnalysis(JSON.stringify({
    reasoning: "The trend is constructive.",
    risks: ["Valuation"],
    strengths: ["Momentum"],
  })), {
    reasoning: "The trend is constructive.",
    risks: ["Valuation"],
    strengths: ["Momentum"],
  });
});

test("parses fenced JSON and ignores surrounding text", () => {
  assert.deepEqual(parseAiAnalysis(
    'Here is the analysis:\n```json\n{"reasoning":"Looks stable.","risks":["Volatility"],"strengths":["Growth"]}\n```\n',
  ), {
    reasoning: "Looks stable.",
    risks: ["Volatility"],
    strengths: ["Growth"],
  });
});

test("filters non-string list entries without failing the analysis", () => {
  assert.deepEqual(parseAiAnalysis(
    '{"reasoning":"Mixed fields.","risks":["Risk",3,null],"strengths":[true,"Strength"]}',
  ), {
    reasoning: "Mixed fields.",
    risks: ["Risk"],
    strengths: ["Strength"],
  });
});

test("recovers literal paragraph breaks inside a reasoning string", () => {
  assert.deepEqual(parseAiAnalysis(
    '{"reasoning":"Paragraph one.\n\nParagraph two.","risks":[],"strengths":[]}',
  ), {
    reasoning: "Paragraph one.\n\nParagraph two.",
    risks: [],
    strengths: [],
  });
});

test("returns null for malformed JSON so the caller can use a fallback", () => {
  assert.equal(parseAiAnalysis('{"reasoning" "missing colon"}'), null);
  assert.deepEqual(fallbackAiAnalysis(), {
    reasoning: "The AI explanation was unavailable, so this analysis is based on the rules-based technical, fundamental, and behavioral scores shown above.",
    risks: [],
    strengths: [],
  });
});