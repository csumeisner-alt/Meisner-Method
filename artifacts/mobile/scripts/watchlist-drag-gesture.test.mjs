import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const watchlistSource = readFileSync(
  new URL("../components/DraggableWatchlist.tsx", import.meta.url),
  "utf8",
);

test("watchlist reorder waits for a long press on the handle, not the whole row", () => {
  assert.equal(
    (watchlistSource.match(/<GestureDetector/g) ?? []).length,
    1,
    "The reorder gesture should only wrap the row drag handle.",
  );
  assert.match(
    watchlistSource,
    /<GestureDetector gesture=\{dragGesture\} touchAction="pan-y">/,
  );
  assert.match(
    watchlistSource,
    /accessibilityLabel=\{`Reorder \$\{item\.symbol\}`\}[\s\S]*?Long press and drag to change its position/,
  );
  assert.match(
    watchlistSource,
    /\.activateAfterLongPress\(400\)\s*\.onStart\(\(\) => \{/,
  );
  assert.doesNotMatch(
    watchlistSource,
    /\.activateAfterLongPress\(400\)\s*\.onBegin\(/,
    "A touch-down callback must not disable scrolling before the hold activates.",
  );
  assert.match(watchlistSource, /dragGesture=\{rowDragGestures\[index\]\}/);
});
