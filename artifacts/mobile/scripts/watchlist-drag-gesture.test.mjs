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
    /Gesture\.LongPress\(\)\s*\.minDuration\(Platform\.OS === 'web' \? 320 : 420\)\s*\.maxDistance\(Platform\.OS === 'web' \? 24 : 12\)\s*\.simultaneousWithExternalGesture\(scrollGesture\)\s*\.onStart\(\(\) => \{/,
  );
  assert.match(
    watchlistSource,
    /Gesture\.Pan\(\)\s*\.simultaneousWithExternalGesture\(scrollGesture\)\s*\.onUpdate\(\(event\) => \{/,
  );
  assert.match(watchlistSource, /Gesture\.Simultaneous\(longPress, pan\)/);
  assert.doesNotMatch(
    watchlistSource,
    /\.activateAfterLongPress\(/,
    "The web pan must not cancel the hold on small pointer movement.",
  );
  assert.match(watchlistSource, /dragGesture=\{rowDragGestures\[index\]\}/);
  assert.match(homeSource, /const scrollGesture = useMemo\(\(\) => Gesture\.Native\(\), \[\]\);/);
  assert.match(
    homeSource,
    /<GestureDetector gesture=\{scrollGesture\}>\s*<ScrollView[\s\S]*?<\/ScrollView>\s*<\/GestureDetector>/,
  );
  assert.match(homeSource, /scrollGesture=\{scrollGesture\}/);
});
