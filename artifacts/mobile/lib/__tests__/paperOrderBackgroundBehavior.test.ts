import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { formatPaperOrderFillTime } from '../paperMath.ts';

const screenSource = readFileSync('app/(tabs)/paper.tsx', 'utf8');

test('active quote refreshes evaluate device-local pending orders after resume', () => {
  assert.match(
    screenSource,
    /const refresh = \(forceRefresh = false\) => \{\s*if \(!appIsActive\) return;\s*\/\/ Active-account refreshes are the only execution opportunity for[\s\S]*?fetchQuotes\(positionsRef\.current, activeIdRef\.current, true, forceRefresh\)/,
  );
  assert.match(screenSource, /if \(resumed\) refresh\(true\)/);
});

test('the pending-order UI explains device-only storage and app-closed behavior', () => {
  assert.match(screenSource, /testID="paper-device-only-order-notice"/);
  assert.match(screenSource, /saved only on this device\. Orders are not monitored while the app is closed/);
  assert.match(screenSource, /Market orders need a fresh regular-session quote/);
});

test('filled orders show the recorded app execution time without implying trigger-crossing time', () => {
  assert.match(screenSource, /const fillTime = o\.status === 'filled' \? formatPaperOrderFillTime\(o\.filledAt\) : null/);
  assert.match(screenSource, /testID=\{`paper-order-fill-time-\$\{o\.id\}`\}/);
  assert.match(screenSource, /EXECUTED \{fillTime\}/);
  assert.match(screenSource, /App execution time; this does not indicate when a market price first crossed your order level/);
  assert.match(screenSource, /\{o\.status\.toUpperCase\(\)\}/);
  assert.match(screenSource, /@ \$\{o\.filledPrice\.toFixed\(2\)\}/);
});

test('paper order fill time formatting handles valid and missing timestamps', () => {
  assert.equal(
    formatPaperOrderFillTime('2026-11-21T15:30:00.000Z')?.includes('2026'),
    true,
  );
  assert.equal(formatPaperOrderFillTime(undefined), null);
  assert.equal(formatPaperOrderFillTime('not-a-timestamp'), null);
});
