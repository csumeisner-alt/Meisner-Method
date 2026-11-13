import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

const homeSource = readFileSync(new URL('../app/index.tsx', import.meta.url), 'utf8');
const buttonSource = readFileSync(new URL('../components/MarketHeatMapInsightButton.tsx', import.meta.url), 'utf8');

test('Analyze market heat-map button is driven by the total-market move and remains an accessible navigation action', () => {
  assert.match(homeSource, /useGetMarketPulse\(/);
  assert.match(homeSource, /getGetMarketPulseQueryKey\(\)/);
  assert.match(homeSource, /getMarketPulseInsight\(marketPulseQuery\.data\)/);
  assert.match(homeSource, /refetchInterval: 60_000/);
  assert.match(homeSource, /apiFetch<Omit<MarketSessionProxyQuote, 'fetchedAtMs'>>\('\/api\/stocks\/quote\/SPY'\)/);
  assert.match(homeSource, /sessionProxy=\{marketSessionProxyQuery\.data \?\? null\}/);
  assert.doesNotMatch(homeSource, /useGetMarketHeatMap\(MARKET_PULSE_PARAMS/);
  assert.match(homeSource, /MarketHeatMapInsightButton/);
  assert.match(buttonSource, /testID="open-heat-map"/);
  assert.match(buttonSource, /accessibilityRole="button"/);
  assert.match(buttonSource, /onPress=\{onPress\}/);
  assert.match(buttonSource, /formatMarketPulseDetail\(pulse\)/);
  assert.match(buttonSource, /'PRE-MARKET'/);
  assert.match(buttonSource, /'AFTER-HOURS'/);
  assert.match(buttonSource, /'OVERNIGHT'/);
  assert.match(buttonSource, /SPY \$\{sessionProxy\.priceChangePercent/);
  assert.match(buttonSource, /sessionProxy\.priceSource/);
  assert.match(buttonSource, /isMarketPulseStale\(pulse, nowMs\)/);
  assert.match(buttonSource, /'MARKET SIGNAL PAUSED'/);
  assert.match(buttonSource, /`\$\{quoteDetail \?\? 'Last quote unavailable'\} · PAUSED`/);
  assert.match(buttonSource, /pulse\.changePercent/);
  assert.doesNotMatch(buttonSource, /pulse\.price\b/);
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

test('cold-market flame and signal use icy blue and white', () => {
  assert.match(
    buttonSource,
    /if \(tone === 'COLD'\) \{\s*return \{ base: '#1D63D8', middle: '#6BC8FF', core: COLD_SIGNAL_WHITE \};\s*\}/,
  );
  const signalColor = buttonSource.match(/const signalColor =([\s\S]*?);/)?.[1];
  const glowColor = buttonSource.match(/const glowColor =([\s\S]*?);/)?.[1];
  assert.match(signalColor ?? '', /isCold[\s\S]*COLD_SIGNAL_BLUE/);
  assert.match(glowColor ?? '', /isCold[\s\S]*COLD_FLAME_GLOW/);
  assert.match(buttonSource, /const detailColor = isCold \? COLD_SIGNAL_WHITE : colors\.foreground/);
});