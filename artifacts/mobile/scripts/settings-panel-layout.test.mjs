import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import {
  SETTINGS_BOTTOM_NAV_GAP,
  SETTINGS_BOTTOM_NAV_HEIGHT,
  getSettingsPanelWidth,
  getSettingsScrollBottomPadding,
} from "../lib/settingsPanelLayout.ts";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const mobileDir = resolve(scriptDir, "..");

test("settings panel fits narrow and larger mobile widths with the existing side margin", () => {
  assert.equal(getSettingsPanelWidth(320), 281.6);
  assert.equal(getSettingsPanelWidth(375), 330);
  assert.equal(getSettingsPanelWidth(430), 360);
  assert.ok(getSettingsPanelWidth(320) < 320);
});

test("scrolling to the end leaves the final divider above the fixed bottom navigation", () => {
  for (const height of [640, 844, 932]) {
    for (const bottomInset of [0, 16, 24, 34]) {
      const bottomPadding = getSettingsScrollBottomPadding(bottomInset, false);
      const navigationTop = height - (SETTINGS_BOTTOM_NAV_HEIGHT + bottomInset);
      const finalContentBottom = height - bottomPadding;
      assert.ok(
        finalContentBottom <= navigationTop - SETTINGS_BOTTOM_NAV_GAP,
        `last content should clear navigation at ${height}px height and ${bottomInset}px inset`,
      );
    }
  }

  const webPadding = getSettingsScrollBottomPadding(0, true);
  assert.equal(webPadding, SETTINGS_BOTTOM_NAV_HEIGHT + 34 + SETTINGS_BOTTOM_NAV_GAP);
});

test("the rendered settings drawer uses responsive sizing and keeps tab navigation mounted", async () => {
  const [settings, home, tabs] = await Promise.all([
    readFile(join(mobileDir, "components/DonationSidebar.tsx"), "utf8"),
    readFile(join(mobileDir, "app/(tabs)/index.tsx"), "utf8"),
    readFile(join(mobileDir, "components/BottomTabBar.tsx"), "utf8"),
  ]);

  assert.match(settings, /useWindowDimensions\(\)/);
  assert.match(settings, /getSettingsPanelWidth\(screenWidth\)/);
  assert.match(settings, /height: Platform\.OS === 'web' \? '100%' : screenHeight - panelTopInset/);
  assert.match(settings, /testID="settings-panel"/);
  assert.match(settings, /testID="settings-scroll-view"/);
  assert.match(settings, /contentContainerStyle=\{\{ padding: 20, paddingBottom: bottomScrollPadding \}\}/);
  assert.match(settings, /testID="settings-bottom-divider"/);
  assert.match(settings, /paddingHorizontal: 20/);
  assert.match(settings, /height: 1, marginVertical: 24/);
  assert.match(settings, /getSettingsScrollBottomPadding\(insets\.bottom, Platform\.OS === 'web'\)/);

  const tabsPosition = home.indexOf("<BottomTabBar />");
  const settingsPosition = home.indexOf("<DonationSidebar");
  assert.ok(tabsPosition >= 0 && settingsPosition > tabsPosition, "the existing bottom tab bar remains mounted behind Settings");
  assert.match(tabs, /minHeight: 66/);
});
