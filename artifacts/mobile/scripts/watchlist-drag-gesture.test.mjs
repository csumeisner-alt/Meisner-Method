import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const watchlistSource = readFileSync(
  new URL("../components/DraggableWatchlist.tsx", import.meta.url),
  "utf8",
);
const homeSource = readFileSync(
  new URL("../app/index.tsx", import.meta.url),
  "utf8",
);

test("watchlist reorder waits on the card while ordinary swipes scroll", () => {
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
    /\.activateAfterLongPress\(Platform\.OS === 'web' \? 320 : 420\)\s*\.simultaneousWithExternalGesture\(scrollGesture\)\s*\.onStart\(\(\) => \{/,
  );
  assert.doesNotMatch(
    watchlistSource,
    /\.activateAfterLongPress\([^)]*\)\s*\.onBegin\(/,
    "A touch-down callback must not disable scrolling before the hold activates.",
  );
  assert.match(watchlistSource, /dragGesture=\{rowDragGestures\[index\]\}/);
  assert.match(homeSource, /const scrollGesture = useMemo\(\(\) => Gesture\.Native\(\), \[\]\);/);
  assert.match(
    homeSource,
    /<GestureDetector gesture=\{scrollGesture\}>\s*<ScrollView[\s\S]*?<\/ScrollView>\s*<\/GestureDetector>/,
  );
  assert.match(homeSource, /scrollGesture=\{scrollGesture\}/);
});
