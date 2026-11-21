import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

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
