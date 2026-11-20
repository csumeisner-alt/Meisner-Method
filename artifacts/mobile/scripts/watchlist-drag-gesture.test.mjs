import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const watchlistSource = readFileSync(
  new URL("../components/DraggableWatchlist.tsx", import.meta.url),
  "utf8",
);
const homeSource = readFileSync(
  new URL("../app/(tabs)/index.tsx", import.meta.url),
  "utf8",
);

test("watchlist reorder waits for a hold on native and web before taking row movement", () => {
  assert.equal(
    (watchlistSource.match(/<GestureDetector/g) ?? []).length,
    1,
    "The reorder gesture should wrap one main card region per row.",
  );
  assert.match(
    watchlistSource,
    /<GestureDetector gesture=\{dragGesture\} touchAction="pan-y">[\s\S]*?rowStyles\.dragRegion/,
  );
  assert.match(
    watchlistSource,
    /accessibilityLabel=\{`Reorder \$\{item\.symbol\}`\}[\s\S]*?Long press anywhere on this ticker card and drag/,
  );
  assert.match(
    watchlistSource,
    /if \(Platform\.OS !== 'web'\) \{\s*return pan\s*\.activateAfterLongPress\(420\)\s*\.onStart\(startDrag\);\s*\}/,
  );
  assert.match(
    watchlistSource,
    /Gesture\.LongPress\(\)\s*\.minDuration\(320\)\s*\.maxDistance\(24\)\s*\.simultaneousWithExternalGesture\(scrollGesture\)\s*\.onStart\(startDrag\)/,
  );
  assert.match(watchlistSource, /const pan = Gesture\.Pan\(\)\s*\.simultaneousWithExternalGesture\(scrollGesture\)\s*\.onUpdate\(\(event\) => \{/);
  assert.match(watchlistSource, /Gesture\.Simultaneous\(longPress, pan\)/);
  assert.match(watchlistSource, /dragGesture=\{rowDragGestures\[index\]\}/);
  assert.match(watchlistSource, /const startDrag = \(\) => \{\s*'worklet';/);
  assert.match(watchlistSource, /runOnJS\(startGhost\)\(symbol, order\)/);
  assert.match(watchlistSource, /runOnJS\(endDrag\)\(symbol, to, succeeded\)/);
  assert.match(watchlistSource, /if \(!succeeded \|\| dragTranslationY\.value !== 0\) return/);
  assert.match(watchlistSource, /useFocusEffect\(useCallback\(\(\) => \{[\s\S]*?screenFocused\.current = false;\s*cancelDrag\(\)/);
  assert.match(homeSource, /const scrollGesture = useMemo\(\(\) => Gesture\.Native\(\), \[\]\);/);
  assert.match(
    homeSource,
    /<AnalyzeScrollGesture gesture=\{scrollGesture\}>\s*<ScrollView[\s\S]*?<\/ScrollView>\s*<\/AnalyzeScrollGesture>/,
  );
  assert.match(homeSource, /Platform\.OS === 'web'[\s\S]*?\? <View style=\{\{ flex: 1 \}\}>\{children\}<\/View>[\s\S]*?: children/);
  assert.match(homeSource, /scrollGesture=\{scrollGesture\}/);
  assert.match(homeSource, /if \(!scrollEnabledRef\.current && event\.cancelable\) event\.preventDefault\(\)/);
  assert.match(homeSource, /addEventListener\('touchmove', preventDragScroll, \{ passive: false, capture: true \}\)/);
  assert.match(homeSource, /removeEventListener\('touchmove', preventDragScroll, \{ capture: true \}\)/);
});
