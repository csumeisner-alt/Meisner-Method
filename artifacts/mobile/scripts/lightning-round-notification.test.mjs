import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const layout = readFileSync(new URL("../app/_layout.tsx", import.meta.url), "utf8");
const screen = readFileSync(new URL("../components/LightningRoundScreen.tsx", import.meta.url), "utf8");

test("the notification handler routes result taps to the Past Lightning Rounds tab", () => {
  assert.match(layout, /installLightningRoundNotificationResponseHandler\(\s*Notifications,/);
  assert.match(layout, /pathname: '\/lightning-round',\s*params: \{\s*tab: 'past'/);
  assert.match(screen, /useLocalSearchParams<\{ tab\?: string; join\?: string \}>/);
  assert.match(screen, /routeParams\.tab === 'past'[\s\S]*?setTab\(routeParams\.tab\)/);
  assert.match(screen, /storeReady && !storeError && tab === 'past'[\s\S]*?Past Lightning Rounds/);
});
