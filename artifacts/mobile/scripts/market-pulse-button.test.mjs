import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

const homeSource = readFileSync(new URL('../app/index.tsx', import.meta.url), 'utf8');
const buttonSource = readFileSync(new URL('../components/MarketHeatMapInsightButton.tsx', import.meta.url), 'utf8');

test('Analyze market heat-map button is driven by fresh breadth data and remains an accessible navigation action', () => {
  assert.match(homeSource, /useGetMarketHeatMap\(MARKET_PULSE_PARAMS/);
  assert.match(homeSource, /getMarketBreadthInsight\(marketPulseQuery\.data\?\.quotes \?\? \[\]\)/);
  assert.match(homeSource, /MarketHeatMapInsightButton/);
  assert.match(buttonSource, /testID="open-heat-map"/);
  assert.match(buttonSource, /accessibilityRole="button"/);
  assert.match(buttonSource, /onPress=\{onPress\}/);
});

test('heat-map badge uses gentle campfire kindling and respects reduced motion', () => {
  assert.match(buttonSource, /AccessibilityInfo\.addEventListener\('reduceMotionChanged'/);
  assert.match(buttonSource, /Animated\.loop\(Animated\.sequence\(\[/);
  assert.match(buttonSource, /function createKindlingCycle/);
  assert.match(buttonSource, /Animated\.delay\(restDuration\)/);
  assert.match(buttonSource, /function FlameTongue/);
  assert.match(buttonSource, /Easing\.inOut\(Easing\.sin\)/);
  assert.match(buttonSource, /toValue: 2,[\s\S]*duration: 680/);
  assert.match(buttonSource, /inputRange: \[0, 0\.15, 1, 2\]/);
  assert.match(buttonSource, /createKindlingCycle\(centerLick, 460, 1_620, 560, nativeDriver\)/);
  assert.doesNotMatch(buttonSource, /const step = directional \? 145/);
  assert.match(buttonSource, /active && !reduceMotion/);
  assert.match(buttonSource, /NEON_GUCCI_DECOR\.cyan/);
  assert.match(buttonSource, /borderColor: '#C4CDD7'/);
  assert.match(buttonSource, /colors\.gold/);
});