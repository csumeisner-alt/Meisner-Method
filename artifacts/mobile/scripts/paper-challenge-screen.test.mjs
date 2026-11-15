import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { removePendingPaperOrder } from "../lib/paperOrderDeletion.ts";

const screen = readFileSync(new URL("../app/paper.tsx", import.meta.url), "utf8");
const accountSwipeArea = readFileSync(new URL("../components/PaperAccountSwipeArea.tsx", import.meta.url), "utf8");
const orderSheet = readFileSync(new URL("../components/OrderSheet.tsx", import.meta.url), "utf8");
const orderEntry = readFileSync(new URL("../components/ProfessionalOrderEntry.tsx", import.meta.url), "utf8");
const orderReview = readFileSync(new URL("../components/OrderEntryReview.tsx", import.meta.url), "utf8");
const events = readFileSync(new URL("../components/PaperChallengeHistory.tsx", import.meta.url), "utf8");
const bottomTabBar = readFileSync(new URL("../components/BottomTabBar.tsx", import.meta.url), "utf8");
const challenge = readFileSync(new URL("../lib/paperChallenge.ts", import.meta.url), "utf8");
const badges = readFileSync(new URL("../components/PaperChallengeMilestoneBadges.tsx", import.meta.url), "utf8");
const shareCard = readFileSync(new URL("../components/PaperEventShareCard.tsx", import.meta.url), "utf8");
const leaderboard = readFileSync(new URL("../components/PaperChallengeLeaderboard.tsx", import.meta.url), "utf8");
const leaderboardProgress = readFileSync(new URL("../lib/eventArenaCompetitiveProgress.ts", import.meta.url), "utf8");
const eventArena = readFileSync(new URL("../components/EventArenaScreen.tsx", import.meta.url), "utf8");
const eventArenaOverview = readFileSync(new URL("../components/EventArenaOverview.tsx", import.meta.url), "utf8");
const eventCashCelebration = readFileSync(new URL("../components/EventCashReceivedCelebration.tsx", import.meta.url), "utf8");
const mobileRootLayout = readFileSync(new URL("../app/_layout.tsx", import.meta.url), "utf8");
const eventArenaTransfers = readFileSync(new URL("../lib/eventArenaTransfers.ts", import.meta.url), "utf8");
const eventArenaArtworkCatalog = readFileSync(new URL("../lib/eventArenaArtwork.ts", import.meta.url), "utf8");
const eventArenaApi = readFileSync(new URL("../../api-server/src/routes/eventArenaRoutes.ts", import.meta.url), "utf8");
const eventAccountDashboard = readFileSync(new URL("../components/PaperEventArenaDashboard.tsx", import.meta.url), "utf8");

assert.match(events, /eventWindow\.phase === 'upcoming' \? eventWindow\.startAtMs : Date\.now\(\)/);
assert.match(events, /eventWindow\.phase === 'upcoming' \? null : PAPER_CHALLENGE_STARTING_BALANCE/);
assert.match(events, /currentWindow\.phase === 'active' \|\| currentWindow\.phase === 'upcoming'/);
assert.match(events, /grow a separate \$100,000 paper portfolio as much as possible/i);
assert.match(screen, /capturePaperChallengeBaseline\(currentEnrollment, startEquity\)/);
assert.match(screen, /updatePaperChallengeStore\(update/);
assert.match(challenge, /joinedAtMs: enrollment\.eventStartAtMs/);
assert.match(screen, /enrollment\.startEquity === null/);
assert.match(screen, /paperChallengeWindow\.phase === 'active' && paperChallengeRef\.current\.enrollment\?\.accountId === id/);
assert.match(events, /currentWindow\.phase === 'upcoming' && store\.enrollment\?\.startEquity === null/);
assert.match(events, /testID="withdraw-paper-challenge"/);
assert.match(events, /withdrawUpcomingPaperChallenge\(current, currentWindow\.id, nowMs\)/);
assert.match(events, /updatePaperChallengeStore\(\(current\)/);
assert.match(challenge, /nowMs >= enrollment\.eventStartAtMs/);
assert.match(screen, /testID=\{isEventAcct \? 'active-paper-event-account'/);
assert.match(screen, /FRESH \$100,000 · TRADE HERE TO COMPETE THIS WEEK/);
assert.match(screen, /testID="paper-event-account-badge"/);
assert.match(screen, /testID="paper-event-live-banner"/);
assert.match(screen, /LIVE EVENT · JOIN ANY TIME/);
assert.match(screen, /testID="dismiss-paper-event-recap"/);
assert.match(screen, /previousEnrollmentIdRef/);

test("Event Arena withdrawal confirms on web and reports save errors without changing the signup", () => {
  assert.match(eventArena, /if \(Platform\.OS === 'web'\) \{\s*setWithdrawError\(''\);\s*setWithdrawConfirmationOpen\(true\)/);
  assert.match(eventArena, /Alert\.alert\(\s*'Withdraw from this event\?'/);
  assert.match(eventArena, /testID="event-arena-withdraw-confirmation"/);
  assert.match(eventArena, /testID="event-arena-withdraw-keep"[\s\S]*?Keep Signup/);
  assert.match(eventArena, /testID="event-arena-withdraw-confirm"[\s\S]*?performWithdrawal\(\)/);
  assert.match(eventArena, /testID="event-arena-withdraw-error"[\s\S]*?Could not withdraw/);
  assert.match(eventArena, /try \{\s*await withdrawUpcomingSignup\(\);\s*setWithdrawConfirmationOpen\(false\);\s*\} catch \{\s*const message = 'Your event signup is unchanged\. Please try again\.';\s*if \(Platform\.OS === 'web'\) \{\s*setWithdrawError\(message\)/);
  assert.match(eventArena, /const updated = await updatePaperChallengeStore\([\s\S]*?\);\s*setStore\(updated\);/);
  assert.match(eventArena, /testID="event-arena-withdraw-confirm"[\s\S]*?disabled=\{saving\}[\s\S]*?onPress=\{\(\) => \{ void performWithdrawal\(\); \}\}/);
  assert.match(eventArena, /withdrawUpcomingPaperChallenge\(current, currentWindow\.id, nowMs\)/);
});

test("event enrollment enables sharing with compact privacy controls", () => {
  assert.match(eventArena, /<PaperChallengeLeaderboard/);
  assert.match(eventArena, /leaderboardOptedIn: true/);
  assert.match(eventArena, /Joining turns on leaderboard sharing/);
  assert.match(leaderboard, /getInstallationId\(\)/);
  assert.match(leaderboard, /currentEnrollment\.leaderboardOptedIn/);
  assert.match(leaderboard, /REFRESH_INTERVAL_MS = 120_000/);
  assert.match(leaderboard, /AppState\.addEventListener/);
  assert.match(leaderboard, /setInterval\(\(\) => \{ void refresh\(\); \}, REFRESH_INTERVAL_MS\)/);
  assert.match(leaderboard, /current\.enrollment\?\.eventId !== event\.id/);
  assert.match(leaderboard, /event-arena\/\$\{encodeURIComponent\(event\.id\)\}\/leaderboard/);
  assert.match(leaderboard, /useGetEventArenaLeaderboard/);
  assert.doesNotMatch(leaderboard, /getEventArenaLeaderboardHistory|paper-event-rank-history|Your event history|Self-reported rank and return snapshots|retry-paper-event-rank-history|displayedEventHistory|eventHistory/);
  assert.match(leaderboard, /X-Event-Arena-Installation-Id/);
  assert.match(leaderboard, /entry\.isCurrentUser/);
  assert.doesNotMatch(leaderboard, /paper-event-leaderboard-your-position/);
  assert.match(leaderboard, /entry\.isCurrentUser && <Text style=\{\{ color: colors\.gold/);
  assert.match(leaderboard, /testID="paper-event-average-cost-fallback"/);
  assert.match(leaderboard, /average cost was used for those positions in your score/);
  assert.match(leaderboard, /setAverageCostFallbackByEvent\(\(current\) => \(\{ \.\.\.current, \[event\.id\]: submission\.usesAverageCost \}\)\)/);
  assert.match(leaderboard, /position\.shares \* \(quotes\.get\(position\.symbol\.toUpperCase\(\)\) \?\? position\.avgCost\)/);
  assert.match(leaderboard, /submitEventArenaScore\(event\.id, submission\.payload\)/);
  assert.doesNotMatch(leaderboard, /averageCostFallbackByEvent\[entry\.|averageCostFallbackByEvent\[detail\./);
  assert.match(leaderboard, /paper-event-leaderboard-stale/);
  assert.match(leaderboard, /tradeCount/);
  assert.match(leaderboard, /profitLoss/);
  assert.match(leaderboard, /transaction\.accountId === enrollment\.accountId/);
  assert.match(leaderboard, /date >= event\.startAtMs/);
  assert.match(leaderboard, /date <= event\.endAtMs/);
  assert.match(leaderboard, /each current holding’s ticker and company name, estimated allocation percentage of your reported Event Arena equity, and Long or Short direction/);
  assert.match(leaderboard, /alias remains locked for this event/i);
  assert.match(leaderboard, /Opt-in is saved on this device; your score will retry when the connection is available/);
  assert.match(leaderboard, /Your alias is saved on this device; the leaderboard will retry the update/);
  assert.match(leaderboard, /method: 'DELETE'/);
  assert.match(leaderboard, /testID="open-paper-event-sharing-info"/);
  assert.match(leaderboard, /testID="paper-event-leaderboard-sharing-info"/);
  assert.match(leaderboard, /testID="opt-out-paper-event-leaderboard"/);
  assert.match(leaderboard, /testID="opt-in-paper-event-leaderboard"/);
  assert.match(leaderboard, /Public scores and holding details are removed 30 days after the event ends/);
  assert.match(leaderboard, /edit-paper-event-leaderboard-alias[\s\S]*?refresh-paper-event-leaderboard[\s\S]*?open-paper-event-sharing-info/);
  assert.doesNotMatch(leaderboard, /testID="paper-event-leaderboard-opt-in"/);
  assert.doesNotMatch(leaderboard, /DEMO_ENTRIES|toggle-paper-event-leaderboard-demo|VIEW DEMO EXAMPLE/);
  assert.match(leaderboard, /testID="paper-event-leaderboard-detail"/);
  assert.match(leaderboard, /holding\.companyName/);
  assert.match(leaderboard, /formatEventHoldingAllocation\(holding\.allocationPercent\)/);
  assert.match(leaderboard, /formatEventHoldingSide\(holding\.side\)/);
  assert.match(leaderboard, /calculateEventHoldingAllocationPercent/);
  assert.match(leaderboard, /Raw share counts, prices, cost basis, account identifiers, regular accounts, and trade history are never shared/);
  assert.match(leaderboard, /Last successful update:/);
  assert.match(leaderboard, /The leaderboard could not be loaded\. Please retry\./);
  assert.doesNotMatch(leaderboard, /weeksQuery\.error\.message|loadError\.message|submissionError\.message/);
  assert.match(leaderboard, /paper-event-leaderboard-current-event/);
  assert.doesNotMatch(leaderboard, /Past event weeks|leaderboard-week-picker|LeaderboardWeeks/);
  assert.match(eventArena, /\{ id: 'past', label: 'Past Events'/);
  assert.match(eventArena, /section === 'past' && renderPastEvents\(\)/);
  assert.match(eventArena, /const renderPastEventDetails = \(event: PaperChallengeSummary\)/);
  assert.match(eventArena, /<PortfolioLineChart[\s\S]*?points=\{equityHistory\}/);
  assert.match(eventArena, /event\.finalPositions/);
  assert.match(eventArena, /Completed trades/);
  assert.match(eventArena, /testID=\{`paper-event-trades-\$\{event\.eventId\}`\}/);
});

test("Event Arena section tabs stay readable and fit narrow phone widths", () => {
  const sectionTabsStart = eventArena.indexOf("{SECTIONS.map((item) => {");
  const sectionTabsEnd = eventArena.indexOf("</View>\n      </View>", sectionTabsStart);
  const sectionTabs = eventArena.slice(sectionTabsStart, sectionTabsEnd);

  assert.ok(sectionTabsStart >= 0 && sectionTabsEnd > sectionTabsStart);
  for (const [id, label] of [
    ["competition", "Competition"],
    ["leaderboard", "Leaderboard"],
    ["trades", "My Trades"],
    ["past", "Past Events"],
  ]) {
    assert.match(eventArena, new RegExp(`id: '${id}', label: '${label}'`));
  }
  assert.match(sectionTabs, /testID=\{`event-arena-tab-\$\{item\.id\}`\}/);
  assert.match(sectionTabs, /accessibilityRole="tab"/);
  assert.match(sectionTabs, /accessibilityState=\{\{ selected \}\}/);
  assert.match(sectionTabs, /accessibilityLabel=\{item\.label\}/);
  assert.match(sectionTabs, /onPress=\{\(\) => setSection\(item\.id\)\}/);
  assert.match(sectionTabs, /backgroundColor: selected \? colors\.primary : colors\.card/);
  assert.match(sectionTabs, /borderColor: selected \? colors\.primary : colors\.border/);
  assert.match(sectionTabs, /color=\{selected \? colors\.primaryForeground : colors\.mutedForeground\}/);
  assert.match(sectionTabs, /color: selected \? colors\.primaryForeground : colors\.foreground/);
  assert.match(sectionTabs, /alignItems: 'center', justifyContent: 'center'/);
  assert.match(sectionTabs, /flex: 1, minWidth: 0, minHeight: SECTION_TAB_MIN_HEIGHT/);
  assert.match(sectionTabs, /size=\{SECTION_TAB_ICON_SIZE\}/);
  assert.match(sectionTabs, /fontSize: SECTION_TAB_LABEL_SIZE/);
  assert.match(sectionTabs, /numberOfLines=\{1\} adjustsFontSizeToFit/);
  assert.match(sectionTabs, /textAlign: 'center'/);
  assert.match(eventArena, /const SECTION_TAB_MIN_HEIGHT = 60/);
  assert.match(eventArena, /const SECTION_TAB_ICON_SIZE = 18/);
  assert.match(eventArena, /const SECTION_TAB_LABEL_SIZE = 10/);
  assert.match(eventArena, /flexDirection: 'row', gap: SECTION_TAB_GAP/);
  assert.match(eventArena, /paddingHorizontal: 16, paddingBottom: 8/);
  assert.doesNotMatch(sectionTabs, /<ScrollView/);
  assert.equal((eventArena.match(/\{ id: '(?:competition|leaderboard|trades|past)', label:/g) ?? []).length, 4);

  const gap = Number(eventArena.match(/const SECTION_TAB_GAP = (\d+)/)?.[1]);
  const sidePadding = 16;
  for (const screenWidth of [320, 360, 390]) {
    const cardWidth = (screenWidth - sidePadding * 2 - gap * 3) / 4;
    const contentWidth = cardWidth - 4;
    assert.ok(contentWidth >= 60, `${screenWidth}px phone leaves room for each tab label and icon`);
  }

});

test("championship leaderboard shows real podium scores, event context, and below-podium standings", () => {
  const stadiumStart = leaderboard.indexOf("<ImageBackground");
  const stadiumEnd = leaderboard.indexOf("</ImageBackground>", stadiumStart);
  const stadium = leaderboard.slice(stadiumStart, stadiumEnd);

  assert.match(leaderboard, /getEventArenaPodiumSlots\(entries\)/);
  assert.match(leaderboard, /getEventArenaStandingsEntries\(entries\)/);
  assert.match(leaderboard, /getEventArenaStatus\(event\.startAtMs, event\.endAtMs, countdownNow\)/);
  assert.match(leaderboard, /eventStatus\.label\.toUpperCase\(\)/);
  assert.match(leaderboard, /getEventArenaReturnTone/);
  assert.ok(stadiumStart >= 0 && stadiumEnd > stadiumStart);
  assert.match(stadium, /CHAMPIONSHIP STANDINGS/);
  assert.match(stadium, /testID="edit-paper-event-leaderboard-alias"/);
  assert.match(stadium, /testID="refresh-paper-event-leaderboard"/);
  assert.match(stadium, /testID="open-paper-event-sharing-info"/);
  assert.match(stadium, /testID="paper-event-leaderboard-participant-count"[\s\S]*?name="users"[\s\S]*?competitor/);
  assert.match(stadium, /testID="paper-event-leaderboard-countdown"[\s\S]*?eventStatus\.countdown/);
  assert.match(stadium, /eventStatus\.phase !== 'ended' && \(/);
  assert.match(stadium, /eventStatus\.phase === 'active' && \([\s\S]*?paper-event-leaderboard-event-progress/);
  assert.doesNotMatch(stadium, /% complete|Event complete/);
  assert.doesNotMatch(leaderboard, /Event leaderboard/);
  assert.match(leaderboard, /const options: Intl\.DateTimeFormatOptions = \{ month: 'short', day: 'numeric', year: 'numeric' \}/);
  assert.match(leaderboard, /Updated \{timeLabel\(lastUpdated\)\}/);
  assert.match(leaderboard, /podiumSlots\[0\] && renderPodiumCard\(podiumSlots\[0\]\)/);
  assert.match(leaderboard, /podiumSlots\.slice\(1\)\.map\(\(slot\) => renderPodiumCard\(slot\)\)/);
  assert.match(leaderboard, /paper-event-podium-\$\{slot\.rank\}/);
  assert.match(leaderboard, /Compete for/);
  assert.match(leaderboard, /\{returnLabel\(entry\.returnPercent\)\}/);
  assert.match(leaderboard, /\{signedMoney\(entry\.profitLoss\)\}/);
  assert.match(leaderboard, /\{money\(entry\.equity\)\}/);
  assert.match(leaderboard, /\{money\(entry\.equity\)\} value/);
  assert.match(leaderboard, /\{signedMoney\(entry\.profitLoss\)\} P\/L/);
  assert.match(leaderboard, /testID="paper-event-leaderboard-current-user"/);
  assert.doesNotMatch(leaderboard, /paper-event-leaderboard-your-position/);
  assert.match(leaderboard, /YOUR POSITION/);
  assert.doesNotMatch(leaderboard, /YOUR LIVE POSITION/);
  assert.match(leaderboard, /\{ownEntry\.alias\}/);
  assert.match(leaderboard, /standingsEntries\.map\(\(entry\) => renderEntry\(entry as LeaderboardEntry\)\)/);
  assert.match(leaderboard, /entry\.isCurrentUser/);
  assert.match(leaderboard, /SELF-REPORTED · NOT INDEPENDENTLY VERIFIED/);
  assert.match(leaderboard, /Loading leaderboard…/);
  assert.match(leaderboard, /The leaderboard could not be loaded\. Please retry\./);
  assert.match(leaderboard, /retry-paper-event-leaderboard/);
  assert.match(leaderboard, /paper-event-leaderboard-stale/);
  assert.match(leaderboard, /refresh-empty-paper-event-leaderboard/);

  const headingIndex = stadium.indexOf("CHAMPIONSHIP STANDINGS");
  const countdownIndex = stadium.indexOf('testID="paper-event-leaderboard-countdown"');
  const datesIndex = stadium.indexOf("dateRangeLabel(event.startAtMs, event.endAtMs)");
  const participantCountIndex = stadium.indexOf('testID="paper-event-leaderboard-participant-count"');
  const podiumIndex = leaderboard.indexOf('testID="paper-event-leaderboard-podium"');
  const standingsIndex = leaderboard.indexOf('testID="paper-event-leaderboard-list"');
  const positionIndex = leaderboard.indexOf('testID="paper-event-leaderboard-current-user"');
  assert.ok(headingIndex >= 0 && countdownIndex > headingIndex);
  assert.ok(datesIndex > countdownIndex && participantCountIndex > datesIndex);
  assert.ok(podiumIndex > stadiumStart && standingsIndex > podiumIndex && positionIndex > standingsIndex);
});

test("the signed-in participant appears only in their actual ranked position", () => {
  assert.match(leaderboard, /getEventArenaOwnEntry\(entries, optedIn\)/);
  assert.match(leaderboard, /borderColor: entry\.isCurrentUser \? colors\.gold : colors\.border/);
  assert.match(leaderboard, /backgroundColor: entry\.isCurrentUser \? `\$\{colors\.gold\}10` : 'rgba\(255,255,255,0\.025\)'/);
  assert.match(leaderboard, /entry\.isCurrentUser && \(/);
  assert.match(leaderboard, /entry\.isCurrentUser && <Text style=\{\{ color: colors\.gold/);
  assert.doesNotMatch(leaderboard, /Rank #\{ownEntry\.rank\}/);
});

test("competitive progress stays tied to successful event responses and readable mobile cards", () => {
  assert.match(leaderboard, /leaderboardQuery\.dataUpdatedAt/);
  assert.match(leaderboard, /lastResponse\?\.eventId === event\.id \? lastResponse\.entries : null/);
  assert.match(leaderboard, /previousEntries: LeaderboardEntry\[\] \| null/);
  assert.match(leaderboard, /getEventArenaCompetitiveChanges\(rankComparison\.previousEntries, entries\)/);
  assert.match(leaderboardProgress, /tradeCount >= 25/);
  assert.match(leaderboard, /getEventArenaNextRankReturnGap\(entry, entries\)/);
  assert.match(leaderboard, /testID="paper-event-next-rank-gap"/);
  assert.match(leaderboard, /testID="paper-event-leaderboard-event-progress"/);
  assert.match(leaderboard, /getEventArenaWindowProgress\(event\.startAtMs, event\.endAtMs, countdownNow\)/);
  assert.match(leaderboard, /Self-reported rank movement/);
  assert.match(leaderboard, /useReduceMotion\(\)/);
  assert.match(leaderboard, /duration: 280/);
  assert.match(leaderboard, /duration: 340/);
  assert.match(leaderboard, /opacity: reduceMotion \? 1/);
  assert.match(leaderboard, /flexWrap: 'wrap'/);
  assert.match(leaderboard, /minWidth: 0/);
  assert.match(leaderboard, /const compactPodium = windowWidth <= 360/);
  assert.match(leaderboard, /const widePodium = windowWidth >= 520/);
  assert.match(leaderboard, /renderPodiumCard\(podiumSlots\[1\]\)[\s\S]*?renderPodiumCard\(podiumSlots\[0\]\)[\s\S]*?renderPodiumCard\(podiumSlots\[2\]\)/);
  assert.match(leaderboard, /maxWidth: 1000/);
  assert.match(leaderboard, /fontSize: isChampion \? compactPodium \? 20 : 23 : compactPodium \? 14 : 16/);
  assert.match(leaderboard, /fontSize: isChampion \? compactPodium \? 30 : 36 : compactPodium \? 22 : 26/);

  // Existing endpoint, ordering, disclosure, and retry/stale-data paths stay intact.
  assert.match(leaderboard, /useGetEventArenaLeaderboard\(event\.id/);
  assert.match(leaderboard, /getEventArenaPodiumSlots\(entries\)/);
  assert.match(leaderboard, /standingsEntries\.map\(\(entry\) => renderEntry\(entry as LeaderboardEntry\)\)/);
  assert.match(leaderboard, /SELF-REPORTED · NOT INDEPENDENTLY VERIFIED/);
  assert.match(leaderboard, /The leaderboard could not be loaded\. Please retry\./);
  assert.match(leaderboard, /paper-event-leaderboard-stale/);
});

test("leaderboard names and large values remain readable and announced on compact phones", () => {
  const renderEntryStart = leaderboard.indexOf("const renderEntry =");
  const renderPodiumStart = leaderboard.indexOf("const renderPodiumCard =", renderEntryStart);
  const positionStart = leaderboard.indexOf('testID="paper-event-leaderboard-current-user"');
  const standingsStart = leaderboard.indexOf('testID="paper-event-leaderboard-list"');
  const renderEntry = leaderboard.slice(renderEntryStart, renderPodiumStart);
  const renderPodium = leaderboard.slice(
    renderPodiumStart,
    leaderboard.indexOf("\n  const openCashTransfer", renderPodiumStart),
  );
  const positionPanel = leaderboard.slice(positionStart, leaderboard.indexOf("{loadError && entries.length > 0", positionStart));

  assert.ok(renderEntryStart >= 0 && renderPodiumStart > renderEntryStart);
  assert.ok(standingsStart >= 0 && positionStart > standingsStart);
  assert.match(renderEntry, /accessibilityLabel=\{`Rank \$\{entry\.rank\}, \$\{entry\.alias\}[\s\S]*?account value \$\{money\(entry\.equity\)\}[\s\S]*?profit or loss \$\{signedMoney\(entry\.profitLoss\)\}[\s\S]*?\$\{returnLabel\(entry\.returnPercent\)\} return/);
  assert.match(renderPodium, /accessibilityLabel=\{entry[\s\S]*?Rank \$\{entry\.rank\} of \$\{entries\.length\}[\s\S]*?competition return \$\{returnLabel\(entry\.returnPercent\)\}[\s\S]*?current equity \$\{money\(entry\.equity\)\}[\s\S]*?profit or loss \$\{signedMoney\(entry\.profitLoss\)\}/);
  assert.match(renderPodium, /allowFontScaling numberOfLines=\{1\} adjustsFontSizeToFit minimumFontScale=\{0\.7\}[\s\S]*?\{entry\.alias\}/);
  assert.match(renderPodium, /RANK \{entry\.rank\} OF \{entries\.length\}/);
  assert.match(renderPodium, /COMPETITION RETURN[\s\S]*?\{returnLabel\(entry\.returnPercent\)\}/);
  assert.match(renderPodium, /CURRENT EQUITY[\s\S]*?\{money\(entry\.equity\)\}/);
  assert.match(renderPodium, /DOLLAR P\/L[\s\S]*?\{signedMoney\(entry\.profitLoss\)\}/);
  assert.match(renderPodium, /color: profitLossColor\(entry\.profitLoss\)/);
  assert.doesNotMatch(renderPodium, /CHAMPION|RUNNER-UP|THIRD PLACE/);
  assert.match(renderPodium, /onPress=\{\(\) => \{ if \(entry\) setDetail\(entry as LeaderboardEntry\); \}\}/);
  assert.match(renderEntry, /color: profitLossColor\(entry\.profitLoss\)/);
  assert.match(leaderboard, /<View accessible[\s\S]*?testID="paper-event-leaderboard-current-user"[\s\S]*?accessibilityLabel=\{`Your leaderboard position is rank \$\{ownEntry\.rank\}, \$\{ownEntry\.alias\}\.`\}/);
  assert.match(positionPanel, /allowFontScaling adjustsFontSizeToFit minimumFontScale=\{0\.7\} numberOfLines=\{1\}[\s\S]*?\{ownEntry\.alias\}/);
  assert.doesNotMatch(positionPanel, /money\(ownEntry\.equity\)|returnLabel\(ownEntry\.returnPercent\)|signedMoney\(ownEntry\.profitLoss\)/);

  const scrollPadding = Number(leaderboard.match(/contentContainerStyle=\{\{[^}]*padding: (\d+)/)?.[1]);
  const podiumPadding = Number(leaderboard.match(/padding: compactPodium \? (\d+) : (\d+)/)?.[1]);
  const listPadding = Number(leaderboard.match(/paddingHorizontal: (\d+), paddingTop: 13, paddingBottom: 4, borderRadius: 18/)?.[1]);
  const rankWidth = Number(renderEntry.match(/width: (\d+),\s*color: colors\.mutedForeground/)?.[1]);
  const rowGap = Number(renderEntry.match(/gap: (\d+),\s*minHeight: 68/)?.[1]);
  const metricsPercent = Number(renderEntry.match(/maxWidth: '(\d+)%'/)?.[1]) / 100;
  assert.ok([scrollPadding, podiumPadding, listPadding, rankWidth, rowGap, metricsPercent].every(Number.isFinite));

  for (const width of [320, 360, 390]) {
    const compact = width <= 360;
    const scrollContent = width - 2 * scrollPadding;
    const podiumInner = scrollContent - 2 * (compact ? podiumPadding : 17);
    const sidePodiumWidth = (podiumInner - 7) / 2;
    const rowContent = width - 2 * scrollPadding - 2 * listPadding;
    const metricsWidth = rowContent * metricsPercent;
    const aliasWidth = rowContent - rankWidth - rowGap - metricsWidth;

    assert.ok(sidePodiumWidth >= 120, `${width}px leaves usable space for both medal positions`);
    assert.ok(metricsWidth >= 90, `${width}px leaves room for large financial values`);
    assert.ok(aliasWidth >= 80, `${width}px leaves room for participant names`);
  }
});

test("participant score detail uses selected-entry values without changing leaderboard sections", () => {
  const detailStart = leaderboard.indexOf('<View testID="paper-event-leaderboard-detail"');
  const detailEnd = leaderboard.indexOf("</ScrollView>\n          ) : (", detailStart);
  const detail = leaderboard.slice(detailStart, detailEnd);

  assert.ok(detailStart >= 0 && detailEnd > detailStart);
  assert.match(detail, /\{detail\.rank\}/);
  assert.match(detail, /\{detail\.alias\}/);
  assert.match(detail, /\{returnLabel\(detail\.returnPercent\)\}/);
  assert.match(detail, /\{money\(detail\.equity\)\}/);
  assert.match(detail, /\{signedMoney\(detail\.profitLoss\)\}/);
  assert.match(detail, /\{detail\.tradeCount == null \? 'Not available' : detail\.tradeCount\}/);
  assert.match(detail, /\{timeLabel\(detail\.updatedAt\)\}/);
  assert.match(detail, /visibleHoldings\.map\(\(holding\) =>/);
  assert.match(detail, /paper-event-holdings-toggle/);
  assert.match(detail, /accessibilityState=\{\{ expanded: holdingsExpanded \}\}/);
  assert.match(detail, /Show all \$\{detail\.holdings\.length\} holdings/);
  assert.match(detail, /holding\.symbol/);
  assert.match(detail, /holding\.companyName/);
  assert.match(detail, /formatEventHoldingAllocation\(holding\.allocationPercent\)/);
  assert.match(detail, /formatEventHoldingSide\(holding\.side\)/);
  assert.match(detail, /allowFontScaling/);
  assert.match(detail, /flexWrap: 'wrap'/);
  assert.match(leaderboard, /contentContainerStyle=\{\{ width: '100%', maxWidth: 820/);
  assert.match(detail, /testID="paper-event-detail-privacy"[\s\S]*?Self-reported and unverified[\s\S]*?trade history are not shared/);
  assert.match(detail, /testID="event-arena-send-cash"[\s\S]*?onPress=\{openCashTransfer\}/);
  assert.match(leaderboard, /accessibilityLabel="Back to leaderboard" onPress=\{\(\) => setDetail\(null\)\}/);
  assert.match(leaderboard, /accessibilityLabel="Close leaderboard" onPress=\{\(\) => \{ setOpen\(false\); setDetail\(null\); \}\}/);

  // The detail branch is separate; the championship podium, standings, and own-position
  // presentation continue to render through the existing leaderboard code paths.
  assert.match(leaderboard, /podiumSlots\[0\] && renderPodiumCard\(podiumSlots\[0\]\)/);
  assert.match(leaderboard, /podiumSlots\.slice\(1\)\.map\(\(slot\) => renderPodiumCard\(slot\)\)/);
  assert.match(leaderboard, /standingsEntries\.map\(\(entry\) => renderEntry\(entry as LeaderboardEntry\)\)/);
  assert.match(leaderboard, /testID="paper-event-leaderboard-current-user"/);
  assert.match(leaderboard, /testID="paper-event-leaderboard-podium"/);
  assert.match(leaderboard, /testID="paper-event-leaderboard-list"/);
});

test("leaderboard header scrolls with its content and clears the fixed bottom tabs", () => {
  const mainScrollStart = leaderboard.indexOf("<ScrollView style={{ flex: 1, minHeight: 0 }} contentContainerStyle={{ width: '100%', maxWidth: 1000");
  const mainScrollEnd = leaderboard.indexOf("</ScrollView>", mainScrollStart);
  const mainScroll = leaderboard.slice(mainScrollStart, mainScrollEnd);
  const eventContentStart = eventArena.indexOf("{section === 'leaderboard' && (");
  const eventContentEnd = eventArena.indexOf("{section === 'trades'", eventContentStart);

  assert.ok(mainScrollStart >= 0 && mainScrollEnd > mainScrollStart);
  assert.doesNotMatch(mainScroll, /renderLeaderboardHeader\(\)/);
  assert.match(mainScroll, /testID="paper-event-leaderboard-podium"/);
  assert.match(mainScroll, /testID="paper-event-leaderboard-current-user"/);
  assert.doesNotMatch(mainScroll, /paper-event-rank-history/);
  assert.match(mainScroll, /paddingBottom: embedded \? 28/);
  assert.match(leaderboard, /style=\{\{ flex: 1, minHeight: 0, backgroundColor: colors\.background/);
  assert.match(eventArena, /<View style=\{\{ flex: 1, minHeight: 0 \}\}>/);
  assert.ok(eventContentStart >= 0 && eventContentEnd > eventContentStart);
  assert.match(eventArena.slice(eventContentStart, eventContentEnd), /embedded/);
  assert.match(eventArena, /<BottomTabBar \/>/);
});

test("milestone badges and event controls stay readable with larger system text", () => {
  assert.match(challenge, /'first-event': 'FIRST EVENT'/);
  assert.match(challenge, /'positive-finish': 'IN THE GREEN'/);
  assert.match(challenge, /'personal-best': 'PERSONAL BEST'/);
  assert.match(badges, /width: '100%'/);
  assert.match(badges, /flexWrap: 'wrap'/);
  assert.match(badges, /maxWidth: '100%'/);
  assert.match(badges, /flexShrink: 1/);
  assert.match(badges, /allowFontScaling/);
  assert.match(badges, /minWidth: 0/);
  assert.doesNotMatch(badges, /lineHeight:/, "milestone line height must grow with the system font");
  assert.match(badges, /fontSize: compact \? 10 : 11/);
  assert.match(shareCard, /width: '100%', maxWidth: 360, minWidth: 0/);
  assert.match(shareCard, /source=\{EVENT_ARENA_ARTWORK_SOURCES\[event\.artworkId \?\? LEGACY_PAPER_CHALLENGE_ARTWORK_ID\]\}/);
  assert.match(shareCard, /testID=\{`paper-event-share-artwork-\$\{event\.eventId\}`\}/);
  assert.match(shareCard, /testID=\{`paper-event-share-card-\$\{event\.eventId\}`\}/);
  assert.match(shareCard, /backgroundColor: 'rgba\(7,12,20,0\.62\)'/);
  assert.match(shareCard, /PaperChallengeMilestoneBadges milestones=\{milestones\}/);
  assert.match(shareCard, /event\.finalRank != null && Number\.isInteger\(event\.finalRank\) && event\.finalRank > 0/);
  assert.match(shareCard, /FINAL RANK/);
  assert.match(shareCard, /accessibilityLabel=\{`Final rank: \$\{event\.finalRank\}`\}/);
  assert.match(shareCard, /testID=\{`paper-event-share-rank-\$\{event\.eventId\}`\}/);
  assert.match(shareCard, /flexWrap: 'wrap'/);
  assert.match(shareCard, /borderColor: 'rgba\(255,218,128,0\.5\)'/);
  assert.match(shareCard, /backgroundColor: 'rgba\(255,218,128,0\.12\)'/);
  assert.match(shareCard, /color: '#FFE8AE', fontFamily: 'Inter_700Bold', fontSize: 15/);
  assert.match(shareCard, /<Text allowFontScaling style=\{\{ color: '#F3D68A'/);
  assert.match(shareCard, /#\{event\.finalRank\}/);
  assert.match(shareCard, /\{money\(event\.startEquity\)\}/);
  assert.match(shareCard, /\{money\(event\.endEquity\)\}/);
  assert.match(shareCard, /useWindowDimensions/);
  assert.match(shareCard, /fontScale >= 1\.3/);
  assert.match(shareCard, /flexDirection: largeText \? 'column' : 'row'/);
  assert.match(shareCard, /maxWidth: '100%'/);
  assert.match(shareCard, /allowFontScaling/);
  for (const label of ["'first-event': 'FIRST EVENT'", "'positive-finish': 'IN THE GREEN'", "'personal-best': 'PERSONAL BEST'"]) {
    assert.ok(challenge.includes(label), `missing readable milestone label: ${label}`);
  }

  const recapCardIndex = screen.indexOf("<PaperEventShareCard");
  const recapScrollIndex = screen.lastIndexOf("<ScrollView contentContainerStyle={{ flexGrow: 1, alignItems: 'center'");
  const recapDoneIndex = screen.indexOf('testID="dismiss-paper-event-recap"');
  assert.ok(recapScrollIndex >= 0 && recapScrollIndex < recapCardIndex);
  assert.ok(recapCardIndex < recapDoneIndex, "the recap action remains outside the scrollable result card");
  assert.match(screen, /paddingVertical: 16/);

  const historyBadgeIndex = events.indexOf('<PaperChallengeMilestoneBadges milestones={getPaperChallengeMilestones(event, store.history)} compact />');
  const historyShareActionIndex = events.indexOf('testID={`share-paper-event-${event.eventId}`}');
  assert.ok(historyShareActionIndex >= 0 && historyShareActionIndex < historyBadgeIndex);
  assert.match(events, /contentContainerStyle=\{\{ padding: 18, paddingBottom:/);
  assert.match(events, /flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8/);
  assert.match(events, /flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8, marginTop: 6/);
  assert.match(events, /accessibilityLabel=\{`Share \$\{dateRange\(event\.eventStartAtMs, event\.eventEndAtMs\)\} event summary`\}/);
  assert.doesNotMatch(events, /<ScrollView style=\{\{ flex: 1 \}\} showsVerticalScrollIndicator=\{false\}>/);
  assert.match(events, /<PaperEventShareCard/);

  const previewScrollIndex = events.lastIndexOf('<ScrollView contentContainerStyle={{ flexGrow: 1, alignItems: \'center\'');
  const shareImageActionIndex = events.indexOf('testID="share-paper-event-image-confirm"');
  assert.ok(previewScrollIndex >= 0 && previewScrollIndex < shareImageActionIndex);
});

test("account dashboard selects, scopes, and persists the active paper account", () => {
  assert.match(screen, /visibleAccounts\.map\(\(acct\)/);
  assert.match(screen, /acct\.id === activeId/);
  assert.match(screen, /positions\.filter\(p => p\.accountId === activeId\)/);
  assert.match(screen, /transactions\.filter\(t => t\.accountId === activeId\)/);
  assert.match(screen, /orders\.filter\(o => o\.accountId === activeId\)/);
  assert.match(screen, /await flushCache\([\s\S]*lotsRef\.current, id\)/);
  assert.match(screen, /getCoveredAccountValueHistory\(\s*currentAccountSnapshots,\s*account\.id,\s*range\.ms/);
  assert.match(screen, /mergeAccountValueHistory\(tradeHistory, currentAccountSnapshots, account\.id\)/);
  assert.match(screen, /PAPER_VALUE_SNAPSHOT_INTERVAL_MS = 60 \* 60_000/);
  assert.match(screen, /PAPER_VALUE_SNAPSHOT_KEY/);
  assert.match(screen, /testID=\{isEventAcct \? 'active-paper-event-account'/);
  assert.match(screen, /\{ id: 'history',\s+label: 'Trade History'/);
  assert.match(screen, /testID=\{`paper-tab-\$\{tab\.id\}`\}/);
  assert.doesNotMatch(screen, /historyAgeMs >= range\.ms/);
  assert.match(orderEntry, /testID="order-sheet-active-account"/);
  assert.match(orderEntry, /SETTLED B\.P\./);
  assert.match(orderReview, /CAPTURED ACCOUNT/);
});

test("Paper Trading keeps all views in readable groups and reserves space for actions", () => {
  const overviewStart = screen.indexOf("const renderOverview = () => {");
  const overviewEnd = screen.indexOf("const renderAnalytics = () => {", overviewStart);
  const overview = screen.slice(overviewStart, overviewEnd);
  const positionsStart = screen.indexOf("const renderPositions = () => {");
  const positionsEnd = screen.indexOf("const renderOverview = () => {", positionsStart);
  const positions = screen.slice(positionsStart, positionsEnd);

  assert.match(screen, /\{ id: 'portfolio', label: 'Portfolio'.*tabs: \['overview', 'positions'\] \}/);
  assert.match(screen, /useState<TabId>\('positions'\)/);
  assert.match(screen, /\{ id: 'activity', label: 'Activity'.*tabs: \['orders', 'history'\] \}/);
  assert.match(screen, /\{ id: 'insights', label: 'Insights'.*tabs: \['analytics', 'dividends', 'growth'\] \}/);
  assert.match(screen, /paper-tab-group-\$\{group\.id\}/);
  assert.match(screen, /activeGroupTabs\.map\(\(tab\)/);
  assert.match(screen, /\{ id: 'overview',\s+label: 'Overview'/);
  assert.match(screen, /\{ id: 'positions',\s+label: 'Positions'/);
  assert.match(screen, /tabs: \['overview', 'positions'\]/);
  assert.match(screen, /testID="paper-trading-buy-action"/);
  assert.doesNotMatch(screen, /position: 'absolute',\s*right: 20,\s*bottom: 108/);
  assert.match(screen, /contentContainerStyle=\{\{ paddingBottom: 16, paddingTop: 10 \}\}/);
  assert.match(screen, /testID="paper-trading-buy-action"[\s\S]*?openBuyModal/);
  assert.doesNotMatch(overview, /INVESTED VALUE|AVAILABLE CASH|OPEN POSITIONS|TOTAL RETURN/);
  assert.doesNotMatch(positions, /contentSectionHeader|contentSectionTitle|sectionCount/);
  assert.match(positions, /No open positions/);
  assert.match(positions, /Tap Buy to place your first paper trade/);
  assert.doesNotMatch(screen, /paper-portfolio-overview-metrics/);
  assert.match(screen, /BUYING POWER/);
  assert.match(screen, /testID="paper-account-total-return"[\s\S]*?pctFmt\(totalReturn\)/);
  assert.match(screen, /testID="paper-account-buying-power"[\s\S]*?\$fmt\(account\?\.cash \?\? 0\)/);
  assert.match(screen, /const totalReturn = \(\(portfolioValue - INITIAL_BALANCE\) \/ INITIAL_BALANCE\) \* 100/);
  assert.match(screen, /const portfolioValue = account \? computePaperEquity\(account, myPositions, quotes\) : 0/);
  assert.match(screen, /heroStats:[\s\S]*?flexDirection: 'row'[\s\S]*?gap: 8/);
  assert.match(screen, /const \{ width: screenWidth, fontScale \} = useWindowDimensions\(\)/);
  assert.match(screen, /screenWidth <= 360 \|\| fontScale >= 1\.3/);
  assert.match(screen, /styles\.heroStatsCompact/);
  assert.match(screen, /heroStatsCompact: \{ flexDirection: 'column'/);
  assert.equal((screen.match(/allowFontScaling style=\{\[styles\.heroStatValue/g) ?? []).length, 3);
  assert.equal((screen.match(/allowFontScaling style=\{\[styles\.heroStatLabel/g) ?? []).length, 3);
  assert.match(screen, /allowFontScaling style=\{styles\.buyActionTitle\}/);
  assert.match(screen, /allowFontScaling style=\{styles\.buyActionHint\}/);
  assert.match(screen, /const renderOverview = \(\) => \{[\s\S]*?ACCOUNT PERFORMANCE/);
  assert.match(screen, /testID="paper-account-total-return"[\s\S]*?adjustsFontSizeToFit/);
  assert.match(screen, /testID="paper-account-buying-power"[\s\S]*?adjustsFontSizeToFit/);
  assert.match(screen, /const DIM = '#a2a8b2'/);
  for (const [tab, renderer] of [
    ["overview", "renderOverview"],
    ["positions", "renderPositions"],
    ["orders", "renderOrders"],
    ["history", "renderHistory"],
    ["analytics", "renderAnalytics"],
    ["dividends", "renderDividends"],
    ["growth", "renderGrowth"],
  ]) {
    assert.ok(screen.includes(`{activeTab === '${tab}' && ${renderer}()}`), `${tab} remains reachable`);
  }
  assert.match(screen, /posMktVal/);
  assert.match(screen, /posMetaRow/);
  assert.match(screen, /ACTUAL DIVIDENDS RECEIVED/);
  assert.match(screen, /Estimated from current holdings; this is not income already received/);
  assert.match(screen, /Not a forecast or actual return/);
  assert.match(bottomTabBar, /Platform\.OS === 'web' \? 34 : insets\.bottom/);
  assert.match(bottomTabBar, /useWindowDimensions/);
  assert.match(bottomTabBar, /lineHeight: 11 \* fontScale/);
  assert.doesNotMatch(bottomTabBar, /numberOfLines=\{1\}/);
  assert.match(bottomTabBar, /fontSize: 9/);
  assert.match(bottomTabBar, /accessibilityLabel="Event Arena"/);
  assert.match(bottomTabBar, /EVENT\{"\\n"\}ARENA/);
});

test("Positions count sits in its accessible Portfolio tab and fits compact phones", () => {
  const portfolioTabsStart = screen.indexOf("{activeTabGroup.id === 'portfolio' ? (");
  const portfolioTabsEnd = screen.indexOf("{/* Content */}", portfolioTabsStart);
  const portfolioTabs = screen.slice(portfolioTabsStart, portfolioTabsEnd);
  const positionsStart = screen.indexOf("const renderPositions = () => {");
  const positionsEnd = screen.indexOf("const renderOverview = () => {", positionsStart);
  const positions = screen.slice(positionsStart, positionsEnd);

  assert.ok(portfolioTabsStart >= 0 && portfolioTabsEnd > portfolioTabsStart);
  assert.match(portfolioTabs, /<View style=\{\[styles\.subTabBar, styles\.portfolioSubTabBar\]\} accessibilityRole="tablist">/);
  assert.match(portfolioTabs, /testID=\{`paper-tab-\$\{tab\.id\}`\}/);
  assert.match(portfolioTabs, /accessibilityRole="tab"/);
  assert.match(portfolioTabs, /accessibilityState=\{\{ selected \}\}/);
  assert.match(portfolioTabs, /accessibilityLabel=\{tab\.id === 'positions' \? `Positions, \$\{myPositions\.length\} open` : tab\.label\}/);
  assert.match(portfolioTabs, /tab\.id === 'positions' && selected && \([\s\S]*?testID="paper-positions-count"[\s\S]*?\{myPositions\.length\}/);
  assert.match(portfolioTabs, /selected && \(tab\.id === 'positions' \? styles\.positionsTabLabelActive : styles\.tabLabelActive\)/);
  assert.match(positions, /No open positions/);
  assert.match(screen, /positions\.filter\(p => p\.accountId === activeId\)/);
  assert.match(screen, /portfolioSubTabBar: \{ flexDirection: 'row', alignItems: 'stretch' \}/);
  assert.match(screen, /portfolioTabBtn: \{ flex: 1, minWidth: 0, flexDirection: 'row'/);
  assert.match(screen, /positionsTabLabelActive: \{ color: '#fff' \}/);
  assert.match(screen, /allowFontScaling\s+style=\{styles\.sectionCount\}/);
});

test("paper dashboard switches accounts from the summary or selector and keeps account management", () => {
  assert.match(screen, /testID="paper-account-hero"/);
  assert.match(screen, /testID="paper-account-switch"/);
  assert.match(screen, /accessibilityLabel="Switch paper trading account"/);
  assert.match(screen, />SWITCH</);
  assert.match(screen, /onPress=\{\(\) => setShowAccountManagement\(true\)\}/);
  assert.match(screen, /<PaperAccountSwipeArea[\s\S]*?accounts=\{visibleAccounts\}[\s\S]*?activeId=\{activeId\}/);
  assert.match(accountSwipeArea, /Math\.abs\(gesture\.dx\) > 12 && Math\.abs\(gesture\.dx\) > Math\.abs\(gesture\.dy\) \* 1\.2/);
  assert.match(accountSwipeArea, /getAdjacentPaperAccountId\(current\.accounts, current\.activeId, gesture\.dx < 0 \? 1 : -1\)/);
  assert.match(accountSwipeArea, /Math\.abs\(gesture\.dx\) < 40/);
  assert.match(accountSwipeArea, /Math\.abs\(gesture\.dx\) <= Math\.abs\(gesture\.dy\) \* 1\.2/);
  assert.match(accountSwipeArea, /Platform\.OS !== 'web'[\s\S]*?Haptics\.impactAsync\(Haptics\.ImpactFeedbackStyle\.Light\)\.catch/);
  assert.match(screen, /testID="paper-account-position-indicator"/);
  assert.match(screen, /testID=\{`paper-account-indicator-\$\{index\}`\}/);
  assert.match(screen, /heroAccountName/);
  assert.match(screen, /heroEquity/);
  assert.match(screen, /TODAY’S P\/L/);
  assert.match(screen, /BUYING POWER/);
  assert.match(screen, /testID="paper-account-management"/);
  assert.match(screen, /visible=\{showAccountManagement\}/);
  assert.match(screen, /testID="paper-account-management-list"/);
  assert.match(screen, /Choose an account or swipe the summary/);
  assert.match(screen, /\['Tiger', 'Borg', 'Fireball'\]/);
  assert.match(screen, /'Event Arena'/);
  assert.match(screen, /accountChoiceValues/);
  assert.match(screen, /activeAccountBadgeText}>ACTIVE/);
  assert.match(screen, /testID=\{`select-paper-account-\$\{acct\.id\}`\}/);
  assert.match(screen, /accessibilityState=\{\{ selected: isActive \}\}/);
  assert.match(screen, /setShowAccountManagement\(false\);[\s\S]*?setRenameId\(''\);[\s\S]*?void switchAccount\(acct\.id\)/);
  assert.match(screen, /onPress=\{\(\) => \{\s*const eventAccount = visibleAccounts\.find/);
  assert.doesNotMatch(screen, /paper-account-choice-/);
  assert.match(screen, /Math\.max\(insets\.bottom, 22\)/);
  assert.match(screen, /testID=\{`rename-paper-account-\$\{acct\.id\}`\}/);
  assert.match(screen, /testID=\{`rename-paper-account-input-\$\{acct\.id\}`\}/);
  assert.match(screen, /testID=\{`reset-paper-account-\$\{acct\.id\}`\}/);
  assert.match(screen, /const isArchivedEventAccount = isEventAcct\s*&& paperChallenge\.history\.some\(\(event\) => event\.accountId === acct\.id\);/);
  assert.match(screen, /const isEventAcctResetLocked = isArchivedEventAccount \|\| \(isEventAcct/);
  assert.match(screen, /COMPLETED EVENT · READ-ONLY RESULTS/);
  assert.match(screen, /Completed Event Arena accounts are read-only/);
  assert.match(screen, /visibleEventAccountId = paperChallenge\.enrollment\?\.accountId\s*\?\? paperChallenge\.history\[0\]\?\.accountId/);
  assert.match(screen, /accessibilityState=\{\{ disabled: isEventAcctResetLocked \}\}/);
  assert.match(screen, /disabled=\{isEventAcctResetLocked\}/);
  assert.match(screen, /Reset unavailable until the active event ends/);
  assert.match(screen, /ACTIVE EVENT · RESET LOCKED UNTIL EVENT ENDS/);
  assert.match(screen, /if \(paperChallengeWindow\.phase === 'active' && paperChallengeRef\.current\.enrollment\?\.accountId === id\)/);
  assert.match(screen, /onSubmitEditing=\{\(\) => \{ void renameAccount\(acct\.id, renameDraft\); setRenameId\(''\); \}\}/);
  assert.match(screen, /onBlur=\{\(\) => \{ void renameAccount\(acct\.id, renameDraft\); setRenameId\(''\); \}\}/);
  assert.match(screen, /Alert\.alert\(\s*'Reset Account',\s*`Reset "\$\{acct\.name\}" to \$100,000\? All positions and trade history will be lost\.`/);
  assert.match(screen, /\{ text: 'Cancel', style: 'cancel' \}/);
  assert.match(screen, /onPress: \(\) => \{ void resetAccount\(acct\.id\); \}/);
  assert.match(screen, /resetPaperAccountData\(\{/);
  assert.match(screen, /testID=\{`paper-tab-group-\$\{group\.id\}`\}/);
  assert.match(screen, /id: 'portfolio', label: 'Portfolio'/);
  assert.match(screen, /id: 'activity', label: 'Activity'/);
  assert.match(screen, /id: 'insights', label: 'Insights'/);
  assert.match(screen, /testID="paper-trading-buy-action"[\s\S]*?Trade[\s\S]*?openBuyModal/);
  assert.doesNotMatch(screen, /\(activeTab === 'overview' \|\| activeTab === 'positions' \|\| activeTab === 'orders'\) && \(\s*<View style=\{styles\.buyActionWrap\}/);
  assert.match(screen, /positions\.filter\(p => p\.accountId === activeId\)/);
  assert.match(screen, /myPositions\.map/);
  assert.match(screen, /renderOverview/);
  assert.match(screen, /renderOrders/);
  assert.match(screen, /renderHistory/);
  assert.match(screen, /renderAnalytics/);
  assert.match(screen, /renderDividends/);
  assert.match(screen, /renderGrowth/);
  assert.match(screen, /label: 'Orders'/);
  assert.match(screen, /label: 'Trade History'/);
  assert.match(screen, /ACCOUNT PERFORMANCE/);
  assert.match(screen, /pos\.companyName/);
  assert.match(screen, /pos\.shares\} sh ·/);
  assert.match(screen, /isShortPosition\(pos\) \? 'Entry' : 'Avg'/);
  assert.match(screen, /isShortPosition\(pos\) \? 'LIABILITY' : 'MARKET VALUE'/);
  assert.match(screen, /MARKET VALUE/);
  assert.match(screen, /pctFmt\(pnlPct\)/);
  assert.match(screen, /SELL \{pos\.symbol\}/);
});

test("Event Arena account uses saved event results and links to the existing leaderboard", () => {
  assert.match(screen, /<PaperEventArenaDashboard/);
  assert.match(screen, /paperChallenge\.history\.find\(\(event\) => event\.accountId === account\?\.id\)/);
  assert.match(screen, /pathname: '\/event-arena',\s*params: \{ section: 'leaderboard', eventId: selectedEventId \}/);
  assert.match(eventArena, /requestedSection === 'leaderboard'\) setSection\('leaderboard'\)/);
  assert.match(eventAccountDashboard, /useGetEventArenaLeaderboard\(eventId/);
  assert.match(eventAccountDashboard, /entry\.isCurrentUser/);
  assert.match(eventAccountDashboard, /summary\?\.finalRank/);
  assert.match(eventAccountDashboard, /entries\.length === 1 \? 'participant' : 'participants'/);
  assert.match(eventAccountDashboard, /COMP P\/L/);
  assert.match(eventAccountDashboard, /'RETURN'/);
  assert.match(eventAccountDashboard, /BUYING POWER/);
  assert.match(eventAccountDashboard, /'STARTS IN' : phase === 'active' \? 'TIME LEFT'/);
  assert.match(eventAccountDashboard, /VIEW LEADERBOARD/);
  assert.doesNotMatch(eventAccountDashboard, /TODAY’S P\/L/);
  assert.match(eventAccountDashboard, /flexDirection: 'row', gap: 5, marginTop: 7/);
  assert.match(eventAccountDashboard, /minHeight: 34/);
  assert.match(eventAccountDashboard, /minWidth: 0/);
  assert.match(screen, /eventChampionshipSwitchButton: \{ minHeight: 30/);
  assert.match(screen, /eventChampionshipHero:[\s\S]*?paddingTop: 8,[\s\S]*?paddingBottom: 6/);
});

test("position and order cards are compact without removing their essential values or actions", () => {
  assert.match(screen, /posCard:[\s\S]*?paddingVertical: 4[\s\S]*?paddingHorizontal: 9/);
  assert.match(screen, /orderCard:[\s\S]*?padding: 11/);
  assert.match(screen, /gap: 4, paddingHorizontal: 16/);
  assert.match(screen, /gap: 10, paddingHorizontal: 16/);
  assert.match(screen, /testID=\{`paper-position-\$\{pos\.id\}`\}/);
  assert.match(screen, /pos\.shares\} sh ·/);
  assert.match(screen, /isShortPosition\(pos\) \? 'Entry' : 'Avg'/);
  assert.match(screen, /isShortPosition\(pos\) \? 'LIABILITY' : 'MARKET VALUE'/);
  assert.match(screen, /MARKET VALUE/);
  assert.match(screen, /pctFmt\(pnlPct\)/);
  assert.match(screen, /testID=\{`paper-order-\$\{o\.id\}`\}/);
  assert.match(screen, /o\.status\.toUpperCase\(\)/);
  assert.match(screen, /testID=\{`edit-order-\$\{o\.id\}`\}/);
  assert.match(screen, /testID=\{`delete-order-\$\{o\.id\}`\}/);
  assert.match(screen, /o\.status === 'pending'/);
  assert.match(screen, /style=\{\{ flex: 1, minWidth: 0, paddingRight: 8 \}\}/);
  assert.match(screen, /flexWrap: 'wrap', gap: 10, marginBottom: 4/);
});

test("pending order deletion confirms on web and remains account-scoped and persistent", () => {
  assert.match(screen, /if \(Platform\.OS === 'web'\) \{\s*setDeleteConfirmationOrder\(order\);\s*return;\s*\}/);
  assert.match(screen, /testID="paper-order-delete-confirmation"/);
  assert.match(screen, /testID="cancel-delete-paper-order"[\s\S]*?setDeleteConfirmationOrder\(null\)/);
  assert.match(screen, /testID="confirm-delete-paper-order"[\s\S]*?onPress=\{confirmDeleteOrder\}/);
  assert.match(screen, /const confirmDeleteOrder = \(\) => \{\s*const order = deleteConfirmationOrder;\s*setDeleteConfirmationOrder\(null\);\s*if \(order\) void deleteOrder\(order\);\s*\}/);
  assert.match(screen, /testID=\{`delete-order-\$\{o\.id\}`\}[\s\S]*?onPress=\{\(\) => requestDeleteOrder\(o\)\}/);
  assert.match(screen, /if \(order\.status !== 'pending' \|\| order\.accountId !== activeIdRef\.current\) return;/);
  assert.match(screen, /removePendingPaperOrder\(ordersRef\.current, order, activeIdRef\.current\)/);
  assert.match(screen, /if \(!updatedOrders\) return;\s*await saveOrders\(updatedOrders\)/);
  assert.match(screen, /Alert\.alert\('Delete Order', `Delete pending \$\{order\.side\} \$\{order\.shares\} \$\{order\.symbol\}\?`, \[\s*\{ text: 'No', style: 'cancel' \},\s*\{ text: 'Delete Order', style: 'destructive', onPress: \(\) => \{ void deleteOrder\(order\); \} \},\s*\]\)/);
  assert.match(screen, /orders\.filter\(o => o\.accountId === activeId\)/);
  assert.match(screen, /o\.status === 'pending' && \(/);
});

test("cancelling the web delete prompt only closes it without deleting an order", () => {
  const cancelStart = screen.indexOf('testID="cancel-delete-paper-order"');
  const cancelEnd = screen.indexOf("</TouchableOpacity>", cancelStart);
  const cancelAction = screen.slice(cancelStart, cancelEnd);

  assert.ok(cancelStart >= 0 && cancelEnd > cancelStart);
  assert.match(cancelAction, /onPress=\{\(\) => setDeleteConfirmationOrder\(null\)\}/);
  assert.doesNotMatch(cancelAction, /deleteOrder|saveOrders|confirmDeleteOrder/);
});

test("confirmed pending-order removal preserves unrelated orders and rejects stale or ineligible orders", () => {
  const selected = { id: "selected", accountId: "account-a", status: "pending" };
  const orders = [
    selected,
    { id: "other-pending", accountId: "account-a", status: "pending" },
    { id: "same-id-other-account", accountId: "account-b", status: "pending" },
    { id: "already-filled", accountId: "account-a", status: "filled" },
    { id: "already-cancelled", accountId: "account-a", status: "cancelled" },
    { id: "completed", accountId: "account-a", status: "completed" },
  ];

  assert.deepEqual(
    removePendingPaperOrder(orders, selected, "account-a"),
    orders.slice(1),
    "confirmation removes only the selected pending order",
  );
  assert.equal(removePendingPaperOrder(orders, selected, "account-b"), null);
  assert.equal(
    removePendingPaperOrder(orders, { ...selected, status: "filled" }, "account-a"),
    null,
  );
  assert.equal(
    removePendingPaperOrder(orders, { ...selected, status: "cancelled" }, "account-a"),
    null,
  );
  assert.equal(
    removePendingPaperOrder(orders, { ...selected, status: "completed" }, "account-a"),
    null,
  );
});

test("paper order review captures account identity and guards duplicate submissions", () => {
  assert.match(orderEntry, /accountId: account\.id/);
  assert.match(orderEntry, /setReview\(\{\s*args,\s*quoteState,\s*accountName: account\.name/);
  assert.match(orderEntry, /submittingRef\.current/);
  assert.match(orderReview, /testID="paper-order-review"/);
  assert.match(orderReview, /testID="paper-order-submit"/);
  assert.match(orderEntry, /testID=\{`paper-order-side-\$\{item\}`\}/);
  assert.match(orderEntry, /testID="paper-order-search-stock"/);
  assert.match(orderEntry, /testID="paper-order-refresh-quote"/);
  assert.match(orderReview, /Order pending/);
  assert.match(screen, /const accountId = args\.accountId/);
  assert.match(screen, /currentAccounts\.find\(\(item\) => item\.id === accountId\)/);
  assert.match(screen, /accountPositions = currentPositions\.filter\(\(position\) => position\.accountId === accountId\)/);
  assert.match(screen, /if \(!fillResult\.ok\) return \{ status: 'rejected'/);
  assert.match(screen, /status: 'filled',[\s\S]*fillPrice/);
  assert.match(screen, /status: 'pending',[\s\S]*was saved to/);
});

test("order-entry controls stay flexible for narrow screens and the Android keyboard", () => {
  assert.match(orderEntry, /keyboardType="decimal-pad"/);
  assert.match(orderEntry, /keyboardDismissMode=\{Platform\.OS === 'ios' \? 'interactive' : 'on-drag'\}/);
  assert.match(orderEntry, /keyboardShouldPersistTaps="handled"/);
  assert.match(orderEntry, /minWidth: 0/);
  assert.match(orderEntry, /flex: 1/);
  assert.match(orderEntry, /presentationStyle="fullScreen"/);
  assert.match(orderEntry, /KeyboardAwareScrollViewCompat/);
  assert.match(orderEntry, /Limit orders are not guaranteed to fill/);
  assert.match(orderReview, /limit order may remain pending and is not guaranteed to fill/i);
});

test("completed Event Arena records retain trades and distinguish missing legacy records", () => {
  assert.match(challenge, /transactions: eventTransactions\.map/);
  assert.match(events, /toggle-paper-event-trades-/);
  assert.match(events, /paper-event-trades-/);
  assert.match(events, /event\.transactions === undefined/);
  assert.match(events, /archiveTrades === undefined/);
});

test("Event Arena cash transfers stay event-only, confirmed, private, and idempotent", () => {
  assert.match(leaderboard, /participantToken: string/);
  assert.match(leaderboard, /detail\.participantToken/);
  assert.match(leaderboard, /event\.phase === 'active'/);
  assert.match(leaderboard, /!detail\.isCurrentUser/);
  assert.match(leaderboard, /testID="event-arena-send-cash"/);
  assert.match(leaderboard, /testID="event-arena-pending-order-warning"/);
  assert.match(leaderboard, /testID="event-arena-cash-transfer-order-impact"/);
  assert.match(leaderboard, /event_arena_pending_transfer:\$\{event\.id\}/);
  assert.match(leaderboard, /testID="event-arena-cash-transfer-success"/);
  assert.match(eventArena, /recipientParticipantToken: args\.recipientParticipantToken/);
  assert.match(eventArena, /direction: 'sent'/);
  assert.match(eventArena, /event-arena-cash-notifications/);
  assert.match(eventArena, /direction: 'received'/);
  assert.match(eventArena, /X-Event-Arena-Mark-Read/);
  assert.match(eventArenaTransfers, /eventArenaAppliedTransferIds/);
  assert.match(eventArena, /onOpenNotifications/);
  assert.match(eventArena, /testID=\{`event-arena-cash-notification-/);
  assert.match(eventArena, /EVENT_ARENA_CASH_HISTORY_RETENTION_MS/);
  assert.match(eventArena, /testID=\{`event-arena-open-cash-history-\$\{event\.eventId\}`\}/);
  assert.match(eventArena, /refreshCashNotifications\(true, eventId\)/);
  assert.match(eventArena, /setCashHistoryEventId\(eventId\)/);
  assert.match(eventArena, /if \(isCurrentEvent && currentEnrollment\)/);
  assert.match(eventArena, /Event \{cashHistoryEventId\}/);
  assert.match(eventArenaOverview, /testID="event-arena-cash-notifications"/);
  assert.match(eventArenaOverview, /testID="event-arena-refresh"/);
  assert.match(eventArenaApi, /event_arena_cash_transfers/);
});

test("incoming event cash is celebrated on app open and acknowledged per transfer", () => {
  assert.match(mobileRootLayout, /<EventCashReceivedCelebration \/>/);
  assert.match(eventCashCelebration, /loadPaperChallengeStore/);
  assert.match(eventCashCelebration, /AppState\.addEventListener\('change'/);
  assert.match(eventCashCelebration, /'X-Event-Arena-Mark-Read': 'false'/);
  assert.match(eventCashCelebration, /notifications\.filter\(\(item\) => !item\.readAt\)/);
  assert.match(eventCashCelebration, /applyEventCashTransfer\([\s\S]*?direction: 'received'/);
  assert.match(eventCashCelebration, /testID="event-cash-received-celebration"/);
  assert.match(eventCashCelebration, /event-cash-received-amount/);
  assert.match(eventCashCelebration, /Someone backed your run/);
  assert.match(eventCashCelebration, /transfers\/read/);
  assert.match(eventCashCelebration, /transferIds: receipt\.notifications\.map\(\(item\) => item\.id\)/);
  assert.match(eventArenaApi, /router\.post\("\/event-arena\/:eventId\/transfers\/read"/);
});

test("all five live Event Arena backgrounds keep podium names and values readable", () => {
  const artworks = [
    ["stadium", "event-arena-stadium.jpg"],
    ["neon-nightclub", "event-arena-neon-nightclub.jpg"],
    ["mountain-summit", "event-arena-mountain-summit.jpg"],
    ["red-showdown", "event-arena-red-showdown.jpg"],
    ["green-stock-exchange", "event-arena-green-stock-exchange.jpg"],
  ];
  assert.equal((eventArenaArtworkCatalog.match(/require\('\.\.\/assets\/event-arena-[^']+\.jpg'\)/g) ?? []).length, 5);

  assert.match(leaderboard, /source=\{EVENT_ARENA_ARTWORK_SOURCES\[event\.artworkId \?\? LEGACY_PAPER_CHALLENGE_ARTWORK_ID\]\}/);
  assert.match(leaderboard, /resizeMode="cover"/);
  assert.match(leaderboard, /event-arena-leaderboard-artwork-\$\{event\.id\}/);
  const artworkStart = leaderboard.indexOf("<ImageBackground");
  const artworkEnd = leaderboard.indexOf("</ImageBackground>", artworkStart);
  const artworkContainer = leaderboard.slice(artworkStart, artworkEnd);
  assert.ok(artworkStart >= 0 && artworkEnd > artworkStart);
  assert.match(artworkContainer, /backgroundColor: '#101720'/);
  assert.match(artworkContainer, /imageStyle=\{\{ borderRadius: 24, opacity: 0\.96 \}\}/);
  assert.match(artworkContainer, /backgroundColor: 'rgba\(7,12,20,0\.18\)'/);
  assert.match(artworkContainer, /<LinearGradient/);
  assert.match(artworkContainer, /testID="paper-event-leaderboard-podium"/);
  const standingsStart = leaderboard.indexOf('<View testID="paper-event-leaderboard-list"');
  assert.ok(standingsStart > artworkEnd, "full standings remain on their solid card below the artwork");
  assert.match(leaderboard.slice(standingsStart, standingsStart + 260), /backgroundColor: colors\.card/);
  assert.match(eventArena, /artworkId: event\.artworkId/);
  assert.match(eventArena, /EVENT_ARENA_ARTWORK_SOURCES\[event\.artworkId \?\? LEGACY_PAPER_CHALLENGE_ARTWORK_ID\]/);
  assert.match(events, /EVENT_ARENA_ARTWORK_SOURCES\[event\.artworkId \?\? LEGACY_PAPER_CHALLENGE_ARTWORK_ID\]/);

  const composite = (foreground, background, alpha) => foreground.map(
    (channel, index) => channel * alpha + background[index] * (1 - alpha),
  );
  const luminance = (rgb) => rgb
    .map((channel) => {
      const value = channel / 255;
      return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
    })
    .reduce((sum, channel, index) => sum + channel * [0.2126, 0.7152, 0.0722][index], 0);
  const contrast = (first, second) => {
    const values = [luminance(first), luminance(second)].sort((a, b) => b - a);
    return (values[0] + 0.05) / (values[1] + 0.05);
  };

  for (const [id, asset] of artworks) {
    assert.match(eventArenaArtworkCatalog, new RegExp(`['"]?${id}['"]?: require\\('../assets/${asset.replaceAll(".", "\\.")}'\\)`));
    const path = new URL(`../assets/${asset}`, import.meta.url);
    const bytes = readFileSync(path);
    assert.equal(bytes[0], 0xff, `${asset} is a bundled JPEG`);
    assert.equal(bytes[1], 0xd8, `${asset} is a bundled JPEG`);
    assert.ok(bytes.byteLength > 0, `${asset} is present in the mobile bundle`);

    // A pure-white image pixel is the brightest possible backdrop, so this
    // checks each selected asset against a conservative maximum-luminance case.
    const underlying = composite([255, 255, 255], [16, 23, 32], 0.96);
    const scrimmed = composite([7, 12, 20], underlying, 0.18);
    for (const [cardColor, opacity] of [
      [[13, 17, 23], 0.76],
      [[13, 19, 29], 0.73],
      [[26, 23, 15], 0.88],
    ]) {
      const cardSurface = composite(cardColor, scrimmed, opacity);
      assert.ok(contrast([255, 255, 255], cardSurface) >= 4.5, `${id} podium text keeps strong contrast on the brightest possible image pixel`);
    }
  }

  assert.match(leaderboard, /rgba\(25,139,218,0\.22\)/);
  assert.match(leaderboard, /rgba\(255,218,128,0\.18\)/);
  assert.match(leaderboard, /isChampion \? 'rgba\(13,17,23,0\.76\)' : 'rgba\(13,19,29,0\.73\)'/);
  assert.match(leaderboard, /const compactPodium = windowWidth <= 360/);
  assert.match(leaderboard, /useWindowDimensions\(\)/);
  assert.match(leaderboard, /slot\.rank === 1[\s\S]*?\{ color: '#E5BF63' \}/);
  assert.match(leaderboard, /slot\.rank === 2[\s\S]*?\{ color: '#C9D4DF' \}/);
  assert.match(leaderboard, /: \{ color: '#D99A72' \}/);
  assert.match(leaderboard, /width: compactPodium \? 78 : 96/);
  assert.match(leaderboard, /podiumEntranceEventRef\.current === event\.id/);
  assert.match(leaderboard, /if \(reduceMotion\) \{\s*podiumEntranceValueRef\.current\.setValue\(1\)/);
  assert.match(leaderboard, /ownEntry\?\.rank === 2[\s\S]*?label: 'RUNNER-UP', color: '#C5D0DC'/);
  assert.match(leaderboard, /ownEntry\?\.rank === 3[\s\S]*?label: 'THIRD PLACE', color: '#D39470'/);
  assert.match(leaderboard, /renderPodiumCard\(podiumSlots\[0\]\)/);
  assert.match(leaderboard, /\{money\(entry\.equity\)\}/);
  assert.match(leaderboard, /\{returnLabel\(entry\.returnPercent\)\}/);
  assert.match(leaderboard, /\{signedMoney\(entry\.profitLoss\)\}/);
  const podiumStart = leaderboard.indexOf("const renderPodiumCard =");
  const podiumEnd = leaderboard.indexOf("\n  const openCashTransfer", podiumStart);
  const podium = leaderboard.slice(podiumStart, podiumEnd);
  assert.doesNotMatch(podium, /CHAMPION|RUNNER-UP|THIRD PLACE/);
  assert.match(podium, /allowFontScaling numberOfLines=\{1\} adjustsFontSizeToFit minimumFontScale=\{0\.7\}[\s\S]*?\{entry\.alias\}/);
  assert.match(podium, /allowFontScaling numberOfLines=\{1\} adjustsFontSizeToFit minimumFontScale=\{0\.65\}[\s\S]*?\{money\(entry\.equity\)\}/);
  assert.match(podium, /allowFontScaling numberOfLines=\{1\} adjustsFontSizeToFit minimumFontScale=\{0\.65\}[\s\S]*?\{signedMoney\(entry\.profitLoss\)\}/);
});
