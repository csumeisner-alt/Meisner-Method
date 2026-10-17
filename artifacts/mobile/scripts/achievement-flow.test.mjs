import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const readSource = (path) => readFileSync(resolve(scriptDir, path), "utf8");
const portfolioSource = readSource("../app/portfolio.tsx");
const paperSource = readSource("../app/paper.tsx");
const heatMapSource = readSource("../app/heat-map.tsx");
const homeSource = readSource("../app/index.tsx");
const settingsSource = readSource("../components/DonationSidebar.tsx");
const bottomTabSource = readSource("../components/BottomTabBar.tsx");

test("first-time app milestones are wired to achievement rewards and a review screen", () => {
  assert.match(portfolioSource, /if \(update\.firstQuoteView\) await awardAchievement\('first-quote'\)/);
  assert.match(paperSource, /awardAchievement\('first-paper-order'\)/);
  assert.match(heatMapSource, /awardAchievement\('first-custom-instrument'\)/);
  assert.match(settingsSource, /onPress=\{\(\) => \{\s*onClose\(\);\s*setTimeout\(openGallery, 240\);/);
  assert.match(homeSource, /<DonationSidebar\s+visible=\{settingsOpen\}/);
  assert.doesNotMatch(homeSource, /useAchievements|onPress=\{openGallery\}/);
  assert.doesNotMatch(bottomTabSource, /AWARDS|openGallery|useAchievements/);
});
