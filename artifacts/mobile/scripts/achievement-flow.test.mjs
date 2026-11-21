import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { getAchievementSealLayout } from "../lib/achievementSealLayout.ts";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const readSource = (path) => readFileSync(resolve(scriptDir, path), "utf8");
const portfolioSource = readSource("../app/(tabs)/portfolio.tsx");
const paperSource = readSource("../app/(tabs)/paper.tsx");
const heatMapSource = readSource("../app/heat-map.tsx");
const homeSource = readSource("../app/(tabs)/index.tsx");
const settingsSource = readSource("../components/DonationSidebar.tsx");
const watchlistSource = readSource("../hooks/useWatchlist.ts");
const analysisSource = readSource("../app/analysis/[symbol].tsx");
const bottomTabSource = readSource("../components/BottomTabBar.tsx");
const overlaySource = readSource("../components/AchievementsOverlay.tsx");
const achievementsContextSource = readSource("../contexts/AchievementsContext.tsx");

test("first-time app milestones are wired to achievement rewards and a review screen", () => {
  assert.match(achievementsContextSource, /enqueueAchievementToast\(queue, result\.achievement\)/);
  assert.match(achievementsContextSource, /const toastAchievement = toastQueue\[0\] \?\? null/);
  assert.match(overlaySource, /galleryVisible \|\|[\s\S]*?rainbowCelebrationVisible \|\|[\s\S]*?achievementSeal\.visible/);
  assert.match(achievementsContextSource, /getTrainingTapeAchievementsForOpenCount\(nextCount\)/);
  assert.match(achievementsContextSource, /AsyncStorage\.setItem\(TRAINING_TAPE_OPEN_COUNT_STORAGE_KEY, String\(nextCount\)\)/);
  assert.doesNotMatch(portfolioSource, /quotesViewed >= (50|100)/);
  assert.match(paperSource, /awardAchievement\('first-paper-order'\)/);
  assert.match(paperSource, /awardAchievement\('first-paper-limit'\)/);
  assert.match(heatMapSource, /awardAchievement\('first-custom-instrument'\)/);
  assert.match(heatMapSource, /awardCustomMapMilestones\(nextSymbols\.length\)/);
  assert.match(heatMapSource, /setCustomSymbols\(malformed \? \[\] : symbols\);[\s\S]*?if \(!malformed\) awardCustomMapMilestones\(symbols\.length\)/);
  assert.match(heatMapSource, /if \(count >= 10\) void awardAchievement\('custom-map-10'\)/);
  assert.doesNotMatch(heatMapSource, /awardAchievement\('quote-50'\)/);
  assert.match(portfolioSource, /sellTradeCount = trades\.filter\(trade => trade\.type === 'sell'\)\.length/);
  assert.match(portfolioSource, /sellTradeCount >= 5\) void awardAchievement\('quote-50'\)/);
  assert.match(homeSource, /if \(!resolvedSymbol\) return;\s*void recordAnalyzeSearch\(\);\s*navigateTo\(resolvedSymbol\);/);
  assert.match(homeSource, /onPress=\{\(\) => \{\s*void recordAnalyzeSearch\(\);\s*navigateTo\(t\.symbol\);\s*\}\}/);
  assert.match(achievementsContextSource, /nextCount >= ANALYZE_SEARCH_ACHIEVEMENT_THRESHOLD[\s\S]*?void awardAchievement\('quote-100'\)/);
  assert.match(achievementsContextSource, /AsyncStorage\.setItem\(ANALYZE_SEARCH_COUNT_STORAGE_KEY, String\(nextCount\)\)/);
  assert.match(watchlistSource, /awardAchievement\('first-watchlist'\)/);
  assert.match(watchlistSource, /awardAchievement\('first-price-alert'\)/);
  assert.match(analysisSource, /awardAchievement\('first-analysis'\)/);
  assert.match(settingsSource, /onPress=\{\(\) => \{\s*onClose\(\);\s*setTimeout\(openGallery, 240\);/);
  assert.match(settingsSource, /const DONATION_FEATURE_ENABLED = false/);
  assert.match(
    settingsSource,
    /\{DONATION_FEATURE_ENABLED && \(\s*<>[\s\S]*?Keep it 100% ad-free![\s\S]*?onPress=\{donateVenmo\}[\s\S]*?onPress=\{donateCashApp\}[\s\S]*?Every tip goes straight[\s\S]*?<\/>\s*\)\}/,
  );
  assert.match(homeSource, /<DonationSidebar\s+visible=\{settingsOpen\}/);
  assert.match(homeSource, /useAchievements/);
  assert.doesNotMatch(homeSource, /onPress=\{openGallery\}/);
  assert.doesNotMatch(bottomTabSource, /AWARDS|openGallery|useAchievements/);
  assert.match(overlaySource, /<ScrollView[\s\S]*?contentContainerStyle=\{styles\.achievementList\}/);
  assert.match(overlaySource, /showsVerticalScrollIndicator=\{false\}/);
  assert.match(overlaySource, /TITLE FLAG/);
  assert.match(overlaySource, /selectPremiumFlag\(flag\.id\)/);
  assert.match(overlaySource, /DEFAULT_FLAG_ID/);
  assert.match(overlaySource, /ACHIEVEMENT_UNLOCKED_FLAGS\.map/);
  assert.match(overlaySource, /disabled=\{!premiumFlagReady \|\| !prideUnlocked\}/);
  assert.match(achievementsContextSource, /hasUnlockedPrideFlag\(brew\.quotesViewed\)/);
  assert.match(achievementsContextSource, /id === PRIDE_FLAG\.id && !prideUnlocked/);
  assert.match(overlaySource, /Math\.min\(quotesViewed, PRIDE_FLAG_QUOTE_THRESHOLD\)/);
  assert.match(overlaySource, /hasCompletedAllAchievements\(earnedIds\)/);
  assert.match(overlaySource, /hasCompletedAllAchievements\(earnedIds\)\s*&&\s*\(/);
  assert.doesNotMatch(overlaySource, /Complete all 15 to choose/);
  assert.match(overlaySource, /onPress=\{requestPrideSelection\}/);
  assert.match(overlaySource, /selectPremiumFlag\(PRIDE_FLAG\.id\)/);
  assert.match(overlaySource, /confirmPrideSelection/);
  assert.match(overlaySource, /RainbowCelebration onDismiss=\{dismissRainbowCelebration\}/);
  assert.match(overlaySource, /Smart choice\. Your current flag stays selected/);
  assert.match(overlaySource, /!toastAchievement \|\|\s*!shouldPresentAchievementSeal\(achievementSeal, toastAchievement\.id, earnedIds\)/);
  assert.match(overlaySource, /THE FINAL SEAL/);
  assert.match(overlaySource, /15 of 15 complete/);
  assert.match(overlaySource, /Choose your title flag/);
  assert.match(overlaySource, /duration: 1_850/);
  assert.match(overlaySource, /staggerStart = 0\.06/);
  assert.match(overlaySource, /final_seal_unlock\.mp3/);
  assert.match(overlaySource, /setTimeout\(play, 1_320\)/);
  assert.match(overlaySource, /soundPlayedRef\.current = true/);
  assert.match(overlaySource, /Platform\.OS === 'web' \|\| Constants\.appOwnership === 'expo' \|\| soundPlayedRef\.current/);
  assert.match(overlaySource, /playsInSilentMode: false/);
  assert.match(overlaySource, /if \(reducedMotion\) \{\s*progress\.setValue\(1\)/);
  assert.match(overlaySource, /accessibilityLabel="Dismiss achievement celebration"/);
  assert.match(overlaySource, /accessibilityLabel="Choose your title flag"/);
  assert.match(overlaySource, /onRequestClose=\{\(\) => dispatchAchievementSeal\(\{ type: 'dismiss' \}\)\}/);
  assert.match(overlaySource, /onDismiss=\{\(\) => dispatchAchievementSeal\(\{ type: 'dismiss' \}\)\}/);
  assert.match(overlaySource, /dispatchAchievementSeal\(\{ type: 'choose-title-flag' \}\);\s*setTimeout\(openGallery, 260\)/);
  assert.match(overlaySource, /shouldPresentAchievementSeal\(achievementSeal, toastAchievement\.id, earnedIds\)/);
  assert.match(overlaySource, /openGallery, 260/);
  assert.match(overlaySource, /borderBottomColor: 'transparent'/);
  assert.doesNotMatch(overlaySource, /confetti/i);
  assert.match(overlaySource, /maxHeight: '88%'/);
});

test("Analyze title stays stable across achievement states on narrow screens", () => {
  const headerSource = homeSource.match(/\{\/\* Header \*\/\}([\s\S]*?)\{\/\* Search bar \*\/\}/)?.[0];

  assert.ok(headerSource, "the Analyze header and following search section should be present");
  assert.match(headerSource, /Meisner Method/);
  assert.match(headerSource, /AI-powered market intelligence/);
  assert.doesNotMatch(headerSource, /hasCompletedAllAchievements|selectedPremiumFlagId|PremiumFlagBadge|🇺🇸/);
  assert.doesNotMatch(headerSource, /allowFontScaling=\{false\}/);
  assert.match(homeSource, /brandText: \{ flex: 1 \}/);
  assert.match(homeSource, /brandName: \{ fontSize: 21, lineHeight: 26, flexShrink: 1 \}/);

  for (const viewportWidth of [320, 360, 375]) {
    const availableBrandTextWidth = viewportWidth - 40 - 36 - 44 - 12 - 21;
    assert.ok(
      availableBrandTextWidth >= 160,
      `the brand text has ${availableBrandTextWidth}px available at ${viewportWidth}px`,
    );
  }

  assert.match(overlaySource, /selectPremiumFlag\(flag\.id\)/);
  assert.match(overlaySource, /<PremiumFlagBadge flagId=\{flag\.id\}/);
});

test("achievement toasts use success haptics and the Final Seal uses medium impact", () => {
  assert.match(overlaySource, /const hapticsEnabled = brew\.hapticsEnabled/);
  assert.match(overlaySource, /Haptics\.notificationAsync\(Haptics\.NotificationFeedbackType\.Success\)/);
  assert.match(overlaySource, /Haptics\.impactAsync\(Haptics\.ImpactFeedbackStyle\.Medium\)/);
  assert.match(overlaySource, /toastHapticAchievementRef\.current === toastAchievement\.id/);
  assert.match(overlaySource, /Platform\.OS === 'web' \|\| !hapticsEnabled/);
  assert.match(overlaySource, /!visible \|\| Platform\.OS === 'web' \|\| !hapticsEnabled/);
  assert.match(overlaySource, /shouldPresentAchievementSeal\(achievementSeal, toastAchievement\.id, earnedIds\)/);
});

test("Final Seal moves Android screen-reader focus to the title flag gallery", () => {
  assert.match(
    overlaySource,
    /if \(!galleryVisible \|\| Platform\.OS !== 'android'\) return;[\s\S]*?findNodeHandle\(titleFlagGalleryHeadingRef\.current\)[\s\S]*?AccessibilityInfo\.setAccessibilityFocus\(headingTag\)[\s\S]*?\}, 350\);/,
  );
  assert.match(
    overlaySource,
    /ref=\{titleFlagGalleryHeadingRef\}[\s\S]*?accessibilityRole="header"[\s\S]*?accessibilityLabel=\{`Title flag gallery\./,
  );
  assert.match(overlaySource, /Default U\.S\. flag[\s\S]*?accessibilityHint="Double tap to select this title flag\."/);
  assert.match(overlaySource, /\$\{flag\.name\} premium flag[\s\S]*?accessibilityHint="Double tap to select this title flag\."/);
  assert.match(overlaySource, /Pride premium flag[\s\S]*?accessibilityHint=\{prideUnlocked \? "Double tap to select this title flag\."/);
  assert.match(overlaySource, /dispatchAchievementSeal\(\{ type: 'choose-title-flag' \}\);\s*setTimeout\(openGallery, 260\)/);
});

test("Final Seal fits compact Android layouts and keeps its controls tappable", () => {
  for (const viewport of [
    { width: 320, height: 568, topInset: 24, bottomInset: 24, fontScale: 1 },
    { width: 360, height: 640, topInset: 24, bottomInset: 24, fontScale: 1 },
    { width: 320, height: 568, topInset: 24, bottomInset: 24, fontScale: 2 },
    { width: 360, height: 640, topInset: 24, bottomInset: 24, fontScale: 2 },
  ]) {
    const layout = getAchievementSealLayout(
      viewport.width,
      viewport.height,
      viewport.topInset,
      viewport.bottomInset,
      viewport.fontScale,
    );

    assert.ok(layout.ringSize <= viewport.width - 44, "the full seal stays inside horizontal padding");
    assert.ok(layout.contentHeight <= viewport.height - layout.contentClearance, "the seal, copy, action, and safe areas fit with clearance");
    assert.ok(layout.buttonWidth <= viewport.width - 44, "the title-flag action stays inside horizontal padding");
    assert.ok(layout.copyWidth <= viewport.width - 44, "the headline and description stay inside horizontal padding");
    assert.ok(layout.ringSize >= 96, "the seal remains visible at enlarged text scales");
    assert.ok(layout.copyHeightBudget >= 140 * viewport.fontScale, "copy space accounts for Android text scaling");
  }

  assert.match(overlaySource, /getAchievementSealLayout\(\s*width,\s*height,\s*insets\.top,\s*insets\.bottom,\s*fontScale/);
  assert.match(overlaySource, /styles\.sealDismiss,\s*\{\s*top: insets\.top \+ 10\s*\}/);
  assert.match(overlaySource, /width: 48, height: 48/);
  assert.match(overlaySource, /accessibilityLabel="Dismiss achievement celebration"[\s\S]*?hitSlop=\{10\}/);
  assert.match(overlaySource, /paddingTop: insets\.top \+ verticalPadding, paddingBottom: insets\.bottom \+ verticalPadding/);
  assert.match(overlaySource, /width: copyWidth, opacity: sealCopyOpacity/);
  assert.match(overlaySource, /lineHeight: 34 \* fontScale/);
  assert.match(overlaySource, /lineHeight: 21 \* fontScale/);
  assert.match(overlaySource, /minHeight: 52/);
  assert.match(overlaySource, /if \(reducedMotion\) \{\s*progress\.setValue\(1\)/);
  assert.match(overlaySource, /sealCopyOpacity[\s\S]*?outputRange: \[0, 0, 1, 1\]/);
  assert.match(overlaySource, /buttonOpacity[\s\S]*?outputRange: \[0, 0, 1, 1\]/);
});
