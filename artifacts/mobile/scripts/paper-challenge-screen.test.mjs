import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

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
const eventArena = readFileSync(new URL("../components/EventArenaScreen.tsx", import.meta.url), "utf8");
const eventArenaOverview = readFileSync(new URL("../components/EventArenaOverview.tsx", import.meta.url), "utf8");
const eventArenaTransfers = readFileSync(new URL("../lib/eventArenaTransfers.ts", import.meta.url), "utf8");
const eventArenaApi = readFileSync(new URL("../../api-server/src/routes/eventArenaRoutes.ts", import.meta.url), "utf8");

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
  assert.match(leaderboard, /X-Event-Arena-Installation-Id/);
  assert.match(leaderboard, /entry\.isCurrentUser/);
  assert.match(leaderboard, /paper-event-leaderboard-your-position/);
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
  assert.match(leaderboard, /open-paper-event-sharing-info[\s\S]*?edit-paper-event-leaderboard-alias/);
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
  assert.match(screen, /const isEventAcctResetLocked = isEventAcct\s*&& paperChallengeWindow\.phase === 'active'\s*&& paperChallenge\.enrollment\?\.accountId === acct\.id;/);
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
