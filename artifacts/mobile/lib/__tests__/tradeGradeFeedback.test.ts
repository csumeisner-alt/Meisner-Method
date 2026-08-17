import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getTradeGradeFeedback } from '../tradeGradeFeedback.ts';

test('every portfolio grade has distinct feedback copy', () => {
  const grades = ['A+', 'A', 'A-', 'B+', 'B', 'B-', 'C+', 'C', 'C-', 'D+', 'D', 'D-', 'F+', 'F', 'F-'];
  const feedback = grades.map(grade => getTradeGradeFeedback(grade, 'Quick win — +4.0% in 3 days'));

  assert.equal(new Set(feedback.map(item => item.headline)).size, grades.length);
  for (const item of feedback) {
    assert.match(item.guidance, /Quick win/);
    assert.ok(item.guidance.length > 24);
  }
});

test('unknown grades use a safe review fallback', () => {
  assert.deepEqual(
    getTradeGradeFeedback('?', 'Trade context'),
    {
      headline: 'TRADE REVIEW',
      guidance: 'Trade context. Review the setup and risk before your next trade.',
    },
  );
});