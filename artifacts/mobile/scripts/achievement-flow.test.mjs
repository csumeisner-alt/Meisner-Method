import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { ACHIEVEMENTS, ALL_PREMIUM_FLAGS, hasCompletedAllAchievements } from "../lib/achievements.ts";
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
const premiumFlagBadgeSource = readSource("../components/PremiumFlagBadge.tsx");
const achievementsContextSource = readSource("../contexts/AchievementsContext.tsx");

test("Achievements panel heading uses a gold trophy and keeps its accessible name", () => {
  const heading = overlaySource.match(
    /<MaterialCommunityIcons name="trophy-outline"[\s\S]*?<\/Text>/,
  )?.[0];

  assert.ok(heading, "the panel heading should use the trophy icon");
  assert.match(heading, /size=\{20\} color=\{colors\.gold\} accessible=\{false\}/);
  assert.match(heading, /accessibilityRole="header"/);
  assert.match(heading, /accessibilityLabel="Achievements"/);
});

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
  assert.match(overlaySource, /achievementSealShown[\s\S]*?type: 'restore-shown'/);
  assert.match(overlaySource, /if \(!achievementsHydrated\) return/);
  assert.match(overlaySource, /shouldPresentAchievementSealOnHydration\([\s\S]*?type: 'completion-hydrated'/);
  assert.match(achievementsContextSource, /ACHIEVEMENT_SEAL_SHOWN_STORAGE_KEY/);
  assert.match(achievementsContextSource, /setItem\(ACHIEVEMENT_SEAL_SHOWN_STORAGE_KEY, 'true'\)/);
  assert.match(achievementsContextSource, /Promise\.all\(\[[\s\S]*?ACHIEVEMENT_STORAGE_KEY[\s\S]*?ACHIEVEMENT_SEAL_SHOWN_STORAGE_KEY/);
  assert.match(overlaySource, /THE FINAL SEAL/);
  assert.match(overlaySource, /testID="replay-final-seal"[\s\S]*?accessibilityLabel="Replay the Final Seal"/);
  assert.match(overlaySource, /const replayAchievementSeal = \(\) => \{\s*if \(!hasCompletedAllAchievements\(earnedIds\)\) return;\s*closeGallery\(\);\s*setTimeout\(\(\) => dispatchAchievementSeal\(\{ type: 'replay' \}\), 260\);/);
  assert.match(overlaySource, /if \(!visible\) \{\s*progress\.setValue\(0\);\s*return;\s*\}[\s\S]*?duration: 1_850/);
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

test("title flags lead completed achievements and fit the scrollable narrow-phone panel", () => {
  const allAchievementIds = ACHIEVEMENTS.map(({ id }) => id);
  assert.equal(hasCompletedAllAchievements(allAchievementIds.slice(0, -1)), false,
    "the title-flag reward stays hidden while any achievement is incomplete");
  assert.equal(hasCompletedAllAchievements(allAchievementIds), true,
    "the title-flag reward becomes eligible when all 15 achievements are earned");

  const achievementPanel = overlaySource.match(
    /<ScrollView\s+style=\{styles\.achievementScroll\}[\s\S]*?accessibilityLabel="Achievement list"[\s\S]*?<\/ScrollView>/,
  )?.[0];

  assert.ok(achievementPanel, "the achievements and reward should share a scrollable panel");
  const rewardConditionIndex = achievementPanel.indexOf("{hasCompletedAllAchievements(earnedIds) && (");
  const achievementRowsIndex = achievementPanel.indexOf("{ACHIEVEMENTS.map((achievement) =>");
  assert.ok(rewardConditionIndex >= 0, "the title flag reward is guarded by full achievement completion");
  assert.ok(achievementRowsIndex > rewardConditionIndex, "completed-state title flags appear before achievement rows");
  assert.match(
    achievementPanel.slice(rewardConditionIndex, achievementRowsIndex),
    /<View style=\{\[styles\.flagRewardCard/,
    "the completion guard encloses the title flag card",
  );
  assert.match(achievementPanel, /disabled=\{!premiumFlagReady \|\| !prideUnlocked\}/);
  assert.match(achievementPanel, /Pride premium flag[\s\S]*?locked until \$\{PRIDE_FLAG_QUOTE_THRESHOLD\} Biden quotes are viewed/);
  assert.match(achievementPanel, /ACHIEVEMENTS\.map\(\(achievement\) =>[\s\S]*?achievement\.description/);
  assert.match(overlaySource, /panel: \{[^}]*maxHeight: '88%'/);
  assert.match(overlaySource, /achievementScroll: \{ flexShrink: 1 \}/);
  assert.match(overlaySource, /nestedScrollEnabled[\s\S]*?accessibilityLabel="Achievement list"/);

  const narrowViewportWidth = 320;
  const modalHorizontalPadding = 18;
  const panelPadding = 18;
  const rewardCardPadding = 12;
  const flagChoicePadding = 8;
  const usableGridWidth = narrowViewportWidth
    - modalHorizontalPadding * 2
    - panelPadding * 2
    - rewardCardPadding * 2
    - 2;
  const flagChoiceWidth = usableGridWidth * 0.48;
  assert.ok(flagChoiceWidth >= 86 + flagChoicePadding * 2 + 2,
    "the two-column title-flag choices fit at a 320px phone width");
});

test("premium title flags stay animated without a gold frame", () => {
  assert.match(premiumFlagBadgeSource, /const motionStyle = useAnimatedStyle/);
  assert.match(premiumFlagBadgeSource, /duration:\s*5_600/);
  assert.match(premiumFlagBadgeSource, /styles\.frame,[\s\S]*?motionStyle/,
    "the cloth motion should remain applied to the flag badge");
  assert.doesNotMatch(premiumFlagBadgeSource, /borderColor:\s*colors\.gold|borderWidth:\s*1|shadowColor:\s*colors\.gold/,
    "the flag artwork should not have a gold outline or glow");
});

test("premium flag artwork preserves its full image inside the animated frame", () => {
  const badgeSource = readSource("../components/PremiumFlagBadge.tsx");
  assert.match(badgeSource, /resizeMode="contain"/,
    "custom flag artwork should not be cropped to fill the frame");
  assert.match(badgeSource, /flagArtwork:\s*\{\s*width:\s*'92%',\s*height:\s*'88%'/,
    "the animated image should leave enough room for motion inside the clipping frame");
  assert.match(badgeSource, /alignItems:\s*'center',\s*justifyContent:\s*'center'/,
    "the full flag artwork should remain centered within its frame");
});

test("premium flag artwork stays complete in consistent gallery previews", () => {
  for (const flag of ALL_PREMIUM_FLAGS) {
    assert.match(
      premiumFlagBadgeSource,
      new RegExp(`['"]?${flag.artwork}['"]?\\s*:\\s*require\\(`),
      `${flag.name} artwork is available to the shared badge`,
    );
  }

  assert.match(premiumFlagBadgeSource, /resizeMode="contain"/,
    "the badge preserves each artwork's natural proportions");
  assert.doesNotMatch(premiumFlagBadgeSource, /scale:\s*1\.045/,
    "the flag is not persistently enlarged past its frame");
  assert.match(premiumFlagBadgeSource, /backgroundColor: colors\.steelShadow,[\s\S]*?motionStyle/,
    "subtle badge motion applies to the complete frame, not an enlarged image");

  assert.match(overlaySource, /const TITLE_FLAG_PREVIEW_SIZE = 96/);
  assert.match(overlaySource, /<PremiumFlagBadge flagId=\{flag\.id\} size=\{TITLE_FLAG_PREVIEW_SIZE\}/);
  assert.match(overlaySource, /<PremiumFlagBadge flagId=\{PRIDE_FLAG\.id\} size=\{TITLE_FLAG_PREVIEW_SIZE\}/);
  assert.match(overlaySource, /flagChoice: \{ width: '48%', minHeight: 132/);
  assert.match(overlaySource, /defaultFlagPreview: \{ width: TITLE_FLAG_PREVIEW_SIZE, height: 60/);
  assert.match(overlaySource, /pridePreview: \{ width: TITLE_FLAG_PREVIEW_SIZE, height: 60/);

  for (const viewportWidth of [320, 360, 375, 390]) {
    const usableGridWidth = viewportWidth - 18 * 2 - 18 * 2 - 12 * 2 - 2;
    const flagChoiceWidth = usableGridWidth * 0.48;
    assert.ok(flagChoiceWidth >= 96 + 2,
      `the 96px flag preview plus card border fits at ${viewportWidth}px`);
  }
});

test("title-flag choices wrap enlarged labels and remain selectable in the scrollable gallery", () => {
  const flagChoiceStyles = overlaySource.match(/flagChoice: \{[^}]+\}/)?.[0];
  const flagChoiceNameStyles = overlaySource.match(/flagChoiceName: \{[^}]+\}/)?.[0];

  assert.ok(flagChoiceStyles, "flag choices should retain a minimum tap target");
  assert.match(flagChoiceStyles, /minHeight: 132/,
    "the choice remains easy to tap at normal text sizes");
  assert.doesNotMatch(flagChoiceStyles, /height:/,
    "choices can grow vertically as enlarged names wrap");
  assert.match(flagChoiceNameStyles ?? "", /maxWidth: '100%'/,
    "the flag name stays within its card");
  assert.match(flagChoiceNameStyles ?? "", /flexShrink: 1/,
    "long names can wrap rather than push the selected marker outside the card");
  assert.match(flagChoiceNameStyles ?? "", /textAlign: 'center'/);
  const prideProgressStyles = overlaySource.match(/prideProgress: \{[^}]+\}/)?.[0] ?? "";
  assert.match(prideProgressStyles, /maxWidth: '100%'/,
    "the Pride unlock progress stays within its card at enlarged text sizes");
  assert.match(prideProgressStyles, /flexShrink: 1/,
    "the Pride unlock progress can wrap on compact phones");
  assert.doesNotMatch(prideProgressStyles, /lineHeight:/,
    "enlarged Pride progress text is not constrained by a fixed line height");

  const gallery = overlaySource.match(
    /<ScrollView\s+style=\{styles\.achievementScroll\}[\s\S]*?accessibilityLabel="Achievement list"[\s\S]*?<\/ScrollView>/,
  )?.[0];
  assert.ok(gallery, "the title-flag choices remain inside the scrollable panel");
  assert.match(gallery, /<Text allowFontScaling[\s\S]*?styles\.flagChoiceName/,
    "flag names honor enlarged system text");
  assert.match(gallery, /accessibilityState=\{\{ selected, disabled: !premiumFlagReady \}\}/,
    "selected state remains available to assistive technology");
  assert.match(gallery, /\{selected && <Feather name="check-circle"/,
    "selected choices keep a visible check marker after the wrapping label");
  assert.match(gallery, /onPress=\{\(\) => selectPremiumFlag\(flag\.id\)\}/,
    "wrapping text does not remove the flag selection action");

  for (const viewportWidth of [320, 360]) {
    for (const fontScale of [1, 1.5, 2]) {
      const usableGridWidth = viewportWidth - 18 * 2 - 18 * 2 - 12 * 2 - 2;
      const flagChoiceWidth = usableGridWidth * 0.48;
      assert.ok(flagChoiceWidth >= 96 + 2,
        `the preview and border fit at ${viewportWidth}px with ${fontScale}x text`);
    }
  }
});

test("achievement toasts use success haptics and the Final Seal uses medium impact", () => {
  assert.match(overlaySource, /const hapticsEnabled = brew\.hapticsEnabled/);
  assert.match(overlaySource, /Haptics\.notificationAsync\(Haptics\.NotificationFeedbackType\.Success\)/);
  assert.match(overlaySource, /Haptics\.impactAsync\(Haptics\.ImpactFeedbackStyle\.Medium\)/);
  assert.match(overlaySource, /toastHapticAchievementRef\.current === toastAchievement\.id/);
  assert.match(overlaySource, /Platform\.OS === 'web' \|\| !hapticsEnabled/);
  assert.match(overlaySource, /if \(!visible\) \{\s*hapticsPlayedRef\.current = false;\s*return;\s*\}[\s\S]*?Platform\.OS === 'web' \|\| !hapticsEnabled/);
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
