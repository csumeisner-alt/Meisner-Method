import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { QueryClient } from "@tanstack/react-query";
import { removePendingPaperOrder } from "../lib/paperOrderDeletion.ts";
import { getEventArenaHeaderColumnWidth } from "../lib/eventArenaHeaderLayout.ts";
import {
  shouldRenderLightningRoundInvitationButton,
  shouldShowLightningRoundInvitationAction,
} from "../lib/lightningRoundInvitation.ts";
import { getPaperTabNavigationAction } from "../lib/paperTabNavigation.ts";
import {
  canRefreshEventArenaLeaderboard,
  isSelectedLeaderboardEntryMissing,
  resolveSelectedLeaderboardEntry,
} from "../lib/eventArenaLeaderboardRefresh.ts";

const screen = readFileSync(new URL("../app/(tabs)/paper.tsx", import.meta.url), "utf8");
const accountSwipeArea = readFileSync(new URL("../components/PaperAccountSwipeArea.tsx", import.meta.url), "utf8");
const paperLayout = readFileSync(new URL("../components/PaperPortfolioLayout.tsx", import.meta.url), "utf8");
const orderSheet = readFileSync(new URL("../components/OrderSheet.tsx", import.meta.url), "utf8");
const orderEntry = readFileSync(new URL("../components/ProfessionalOrderEntry.tsx", import.meta.url), "utf8");
const orderReview = readFileSync(new URL("../components/OrderEntryReview.tsx", import.meta.url), "utf8");
const events = readFileSync(new URL("../components/PaperChallengeHistory.tsx", import.meta.url), "utf8");
const bottomTabBar = readFileSync(new URL("../components/BottomTabBar.tsx", import.meta.url), "utf8");
const challenge = readFileSync(new URL("../lib/paperChallenge.ts", import.meta.url), "utf8");
const eventLiveNotice = readFileSync(new URL("../components/PaperEventLiveNotice.tsx", import.meta.url), "utf8");
const lightningPreparation = readFileSync(new URL("../lib/lightningRoundPreparation.ts", import.meta.url), "utf8");
const badges = readFileSync(new URL("../components/PaperChallengeMilestoneBadges.tsx", import.meta.url), "utf8");
const shareCard = readFileSync(new URL("../components/PaperEventShareCard.tsx", import.meta.url), "utf8");
const leaderboard = readFileSync(new URL("../components/PaperChallengeLeaderboard.tsx", import.meta.url), "utf8");
const leaderboardProgress = readFileSync(new URL("../lib/eventArenaCompetitiveProgress.ts", import.meta.url), "utf8");
const eventArena = readFileSync(new URL("../components/EventArenaScreen.tsx", import.meta.url), "utf8");
const eventArenaReminderControls = readFileSync(new URL("../components/EventArenaReminderControls.tsx", import.meta.url), "utf8");
const eventArenaReminders = readFileSync(new URL("../lib/eventArenaReminders.ts", import.meta.url), "utf8");
const lightningInvitation = readFileSync(new URL("../components/LightningRoundInvitation.tsx", import.meta.url), "utf8");
const eventArenaOverview = readFileSync(new URL("../components/EventArenaOverview.tsx", import.meta.url), "utf8");
const eventCashCelebration = readFileSync(new URL("../components/EventCashReceivedCelebration.tsx", import.meta.url), "utf8");
const eventArenaTransferLockNotice = readFileSync(new URL("../components/EventArenaTransferLockNotice.tsx", import.meta.url), "utf8");
const mobileRootLayout = readFileSync(new URL("../app/_layout.tsx", import.meta.url), "utf8");
const mobileTabsLayout = readFileSync(new URL("../app/(tabs)/_layout.tsx", import.meta.url), "utf8");
const eventArenaTransfers = readFileSync(new URL("../lib/eventArenaTransfers.ts", import.meta.url), "utf8");
const eventArenaArtworkCatalog = readFileSync(new URL("../lib/eventArenaArtwork.ts", import.meta.url), "utf8");
const leaderboardMockup = readFileSync(new URL("../../mockup-sandbox/src/components/mockups/leaderboard-story/AllSevenLeaderboards.tsx", import.meta.url), "utf8");
const pennyLeaderboardPreview = readFileSync(new URL("../../mockup-sandbox/src/components/mockups/leaderboard-story/PennyStockMayhem.tsx", import.meta.url), "utf8");
const endEventStoryMockup = readFileSync(new URL("../../mockup-sandbox/src/components/mockups/event-arena-end-story/EndOfEventStory.tsx", import.meta.url), "utf8");
const eventArenaApi = readFileSync(new URL("../../api-server/src/routes/eventArenaRoutes.ts", import.meta.url), "utf8");
const alertWorker = readFileSync(new URL("../../api-server/src/alert-worker.ts", import.meta.url), "utf8");
const eventAccountDashboard = readFileSync(new URL("../components/PaperEventArenaDashboard.tsx", import.meta.url), "utf8");
const lightningRound = readFileSync(new URL("../components/LightningRoundScreen.tsx", import.meta.url), "utf8");
const lightningRoute = readFileSync(new URL("../app/lightning-round.tsx", import.meta.url), "utf8");
const lightningHeader = readFileSync(new URL("../components/LightningRoundHeader.tsx", import.meta.url), "utf8");

assert.match(events, /eventWindow\.phase === 'upcoming' \? eventWindow\.startAtMs : Date\.now\(\)/);
assert.match(events, /startEquity: eventWindow\.phase === 'upcoming' \? null : configuration\.startingBalance/);
assert.match(events, /currentWindow\.phase === 'active' \|\| currentWindow\.phase === 'upcoming'/);
assert.match(events, /grow a separate \$\$\{\(currentWindow\.startingBalance \?\? PAPER_CHALLENGE_STARTING_BALANCE\)\.toLocaleString\('en-US'\)\} paper portfolio as much as possible/i);
assert.match(screen, /capturePaperChallengeBaseline\(item, startEquity\)/);
assert.match(screen, /updatePaperChallengeStore\(update/);
assert.match(challenge, /joinedAtMs: enrollment\.eventStartAtMs/);
assert.match(screen, /enrollment\.startEquity === null/);
assert.match(screen, /getPaperChallengeEnrollmentForAccount\(paperChallengeRef\.current, id\)/);
assert.match(screen, /activeEnrollment && Date\.now\(\) < activeEnrollment\.eventEndAtMs/);
assert.match(events, /currentWindow\.phase === 'upcoming' && store\.enrollment\?\.startEquity === null/);
assert.match(events, /testID="withdraw-paper-challenge"/);
assert.match(events, /withdrawUpcomingPaperChallenge\(current, currentWindow\.id, nowMs\)/);
assert.match(events, /updatePaperChallengeStore\(\(current\)/);
assert.match(challenge, /nowMs >= enrollment\.eventStartAtMs/);
assert.match(screen, /testID=\{isEventAcct \? 'active-paper-event-account'/);
assert.match(eventLiveNotice, /GREEN BULL CHAMPIONSHIP · \$500,000 STARTING CAPITAL/);
assert.match(eventLiveNotice, /EVENT ARENA · \$\$\{/);
assert.match(screen, /testID="paper-event-account-badge"/);
assert.match(screen, /<PaperEventLiveNotice[\s\S]*?enrollment=\{activeChallengeEnrollment\}/);
assert.match(eventLiveNotice, /getPaperEventLiveNoticeDismissalKey\(enrollment\.accountId, enrollment\.eventId\)/);
assert.match(eventLiveNotice, /isDismissiblePaperEventLiveNotice\(enrollment\.eventType\)/);
assert.match(eventLiveNotice, /loadPaperEventLiveNoticeDismissal\(AsyncStorage, dismissalKey\)/);
assert.match(eventLiveNotice, /persistPaperEventLiveNoticeDismissal\(AsyncStorage, dismissalKey\)/);
assert.match(eventLiveNotice, /shouldShowPaperEventLiveNotice\(enrollment\.eventType, isEventAccountActive\)/);
assert.match(eventLiveNotice, /if \(!shouldDisplayNotice \|\| !showNotice\) return null/);
assert.match(eventLiveNotice, /testID="paper-event-live-banner"/);
assert.match(eventLiveNotice, /testID="dismiss-paper-event-live-banner"[\s\S]*?accessibilityLabel="Dismiss Event Arena live notice"[\s\S]*?width: 44, height: 44/);
assert.match(eventLiveNotice, /duration: 180/);
assert.match(screen, /testID="paper-account-hero"[\s\S]*?<PaperEventArenaDashboard/);
assert.ok(screen.indexOf('testID="paper-account-hero"') < screen.indexOf('<PaperEventLiveNotice'));
assert.doesNotMatch(eventLiveNotice, /activePaperEvent|PAPER_CHALLENGE_STORAGE_KEY|installationId/);
assert.match(eventLiveNotice, /LIGHTNING ROUND IS LIVE/);
assert.match(screen, /testID="dismiss-paper-event-recap"/);
assert.match(screen, /previousEnrollmentIdsRef/);

test("Paper Trading shows the local cache before waiting for Event Arena sync", () => {
  const initStart = screen.indexOf("const init = useCallback(async (backgroundRefresh = false, allowDeviceSync = true) =>");
  const initEnd = screen.indexOf("\n  }, [apiFetch, pushEventArenaSnapshot]);", initStart);
  const init = screen.slice(initStart, initEnd);

  assert.ok(initStart >= 0 && initEnd > initStart);
  assert.ok(init.indexOf("readPaperCache()") < init.indexOf("setLoaded(true)"));
  assert.ok(init.indexOf("setLoaded(true)") < init.indexOf("apiFetch<EventArenaDeviceSyncResponse>"));
  assert.match(init, /if \(!backgroundRefresh\) setLoaded\(false\)/);
  assert.match(init, /const syncPromise = \(async \(\) => \{[\s\S]*?apiFetch<EventArenaDeviceSyncResponse>/);
  assert.match(init, /if \(await AsyncStorage\.getItem\(EVENT_ARENA_DEVICE_DIRTY_KEY\)[\s\S]*?return;/);
});

test("main tabs keep their mounted screens and Paper Trading's selected account", () => {
  assert.equal(getPaperTabNavigationAction("/paper", "/event-arena"), "navigate");
  assert.equal(getPaperTabNavigationAction("/event-arena", "/paper"), "navigate");
  assert.equal(getPaperTabNavigationAction("/paper", "/paper"), "none");
  assert.equal(getPaperTabNavigationAction("/portfolio", "/event-arena"), "navigate");
  assert.equal(getPaperTabNavigationAction("/", "/picks"), "navigate");

  assert.match(bottomTabBar, /const plan = getMainTabNavigationPlan\(pathname, path\)/);
  assert.match(bottomTabBar, /router\.navigate\(plan\.href\)/);
  assert.doesNotMatch(bottomTabBar, /router\.(push|replace)\(/);
  assert.match(mobileRootLayout, /<Stack\.Screen name="\(tabs\)"/);
  assert.doesNotMatch(mobileRootLayout, /dangerouslySingular/);
  for (const route of ["index", "picks", "paper", "portfolio", "event-arena"]) {
    assert.ok(mobileTabsLayout.includes(`<Tabs.Screen name="${route}"`));
  }
  assert.match(screen, /const cachedActiveId = cached\.accounts\.some\(\(item\) => item\.id === preferredActiveId\)/);
  assert.match(screen, /didFocusOnceRef\.current && loadedRef\.current/);
  assert.match(screen, /initRef\.current\(true, allowDeviceSync\)/);
  assert.match(screen, /PAPER_FOCUS_REFRESH_MIN_INTERVAL_MS/);
  assert.doesNotMatch(screen, /fetchQuotesRef\.current/);
  assert.match(screen, /testID="paper-loading-account-skeleton"/);
  assert.match(screen, /testID="paper-loading-positions-skeleton"/);
  assert.match(screen, /testID="paper-refresh-indicator"/);
  assert.doesNotMatch(screen, /Some prices may be outdated or unavailable|paper-quote-refresh-error/);
});

test("Event Arena does not refetch cash history on its one-second clock", () => {
  const refreshStart = eventArena.indexOf("const refreshCashNotifications = useCallback");
  const refreshEnd = eventArena.indexOf("\n  const openCashHistory", refreshStart);
  const refresh = eventArena.slice(refreshStart, refreshEnd);
  assert.ok(refreshStart >= 0 && refreshEnd > refreshStart);
  assert.match(refresh, /nowRef\.current/);
  assert.doesNotMatch(refresh, /\bnow, refreshAccountData/);
  assert.match(eventArena, /useFocusEffect\(useCallback\(\(\) => \{[\s\S]*?setNow\(Date\.now\(\)\)[\s\S]*?setInterval\(\(\) => setNow\(Date\.now\(\)\), 1_000\)/);
  assert.match(eventArena, /EVENT_ARENA_CASH_REFRESH_INTERVAL_MS/);
  assert.match(eventArena, /loading=\{!accountDataReady \|\| storeState === 'loading'\}/);
});

test("Paper Trading refreshes quotes incrementally without replacing failed values", () => {
  assert.match(screen, /const refresh = async \(\) => \{[\s\S]*?if \(symbols\.length === 0\)/);
  assert.match(screen, /requestPaperPreloadQuote\(sym, forceRefresh\)/);
  assert.match(screen, /const shared = mergePaperPreloadQuotes\(\{ \[sym\]: quote \}\);[\s\S]*?setQuotes\(shared\.quotes\)/);
  assert.match(screen, /const results = await Promise\.allSettled\([\s\S]*?const next: Record<string, LiveQuote> = \{\}[\s\S]*?if \(r\.status === 'fulfilled'\) next\[r\.value\.sym\] = r\.value\.quote/);
  assert.match(screen, /const myPositions = positions\.filter\(p => p\.accountId === activeId\)/);
  assert.match(screen, /const currentAccount = currentAccounts\.find\(\(item\) => item\.id === accountId\)/);
});

test("market orders use a valid available quote after refresh or from the latest local estimate", () => {
  const orderStart = screen.indexOf("const handleConfirmOrder = async");
  const orderEnd = screen.indexOf("\n  };", orderStart);
  const orderHandler = screen.slice(orderStart, orderEnd);
  assert.ok(orderStart >= 0 && orderEnd > orderStart);
  assert.match(screen, /Network\.addNetworkStateListener/);
  assert.match(screen, /didNetworkReconnect\(knownOffline, offline\)/);
  assert.match(screen, /if \(reconnected && appIsActive\) \{[\s\S]*?refresh\(true\);[\s\S]*?fetchInactiveAccountCardQuotes\(true\)/);
  assert.doesNotMatch(screen, /Some prices may be outdated or unavailable|paper-quote-refresh-error/);
  assert.match(orderHandler, /const currentAccounts = accountsRef\.current/);
  assert.match(orderHandler, /const currentPositions = positionsRef\.current/);
  assert.match(orderHandler, /requestPaperPreloadQuote\(sym, true\)/);
  assert.match(orderHandler, /const marketOrderReferencePrice = currentQuote\.price/);
  assert.match(orderHandler, /const cachedQuote = quotes\[sym\]/);
  assert.doesNotMatch(orderHandler, /quote changed after review|provider quote is stale\. Refresh it/);
  assert.doesNotMatch(orderHandler, /getPaperPortfolioPreloadState\(\)\.portfolios/);
  assert.match(screen, /const q = newQuotes\[order\.symbol\];[\s\S]*?canEvaluatePendingOrderQuote\(order, q\)/);
});

test("active Lightning Round fills use the server event account and retain event identity", () => {
  const orderStart = screen.indexOf("const handleConfirmOrder = async");
  const orderEnd = screen.indexOf("\n  };", orderStart);
  const orderHandler = screen.slice(orderStart, orderEnd);
  assert.ok(orderStart >= 0 && orderEnd > orderStart);
  assert.match(orderHandler, /lightningRoundEventId: lightningEnrollment\.eventId/);
  assert.match(orderHandler, /\/api\/event-arena\/lightning-round\/\$\{encodeURIComponent\(lightningEnrollment\.eventId\)\}\/orders/);
  assert.match(orderHandler, /X-Event-Arena-Installation-Id': installationId/);
  assert.match(orderHandler, /updatedAccount = serverFill\.account/);
  assert.match(orderHandler, /newTransaction = serverFill\.transaction/);
  assert.match(orderHandler, /updatedOrders = \[[\s\S]*?serverFill\.order/);
  assert.match(screen, /const activeLightningEnrollment =[\s\S]*?startEquity !== null/);
  assert.match(screen, /requestLightningRoundFill\(activeLightningEnrollment\.eventId, eventOrder\)/);
  assert.match(screen, /lightningOrderSubmissionIdsRef\.current\.size > 0/);
  assert.match(screen, /status: 'cancelled' as const, rejectionReason: error\.message/);

  const routeStart = screen.indexOf("const handledChallengeRouteRef");
  const routeEnd = screen.indexOf("\n  }, [accounts,", routeStart);
  const challengeRoute = screen.slice(routeStart, routeEnd);
  assert.ok(routeStart >= 0 && routeEnd > routeStart);
  assert.match(challengeRoute, /if \(!isFocused\) \{\s*handledChallengeRouteRef\.current = null/);
  assert.match(screen.slice(routeEnd, routeEnd + 100), /isFocused, loaded, routeParams\.challengeAccountId/);
});

test("Event Arena hides stale-price disclosures and refreshes after network recovery", () => {
  assert.match(eventArena, /Network\.addNetworkStateListener/);
  assert.match(eventArena, /didNetworkReconnect\(knownOffline, offline\)/);
  assert.match(eventArena, /if \(accountRefreshForceQueuedRef\.current\)[\s\S]*?refreshAccountDataRef\.current\(true\)/);
  assert.doesNotMatch(eventArena, /Event Arena prices may be outdated|quoteRefreshWarning/);
  assert.match(eventArena, /Event account data could not be refreshed/);
  assert.match(eventArena, /store\.lightningEnrollment\]\)/);
});

test("Portfolio Overview label is centered without changing the Positions count layout", () => {
  const portfolioTabsStart = paperLayout.indexOf("export function PaperPortfolioNavigation");
  const portfolioTabsEnd = paperLayout.indexOf("export function PaperPositionRow", portfolioTabsStart);
  const portfolioTabs = paperLayout.slice(portfolioTabsStart, portfolioTabsEnd);
  assert.ok(portfolioTabsStart >= 0 && portfolioTabsEnd > portfolioTabsStart);
  assert.match(portfolioTabs, /tab\.id === 'overview' && styles\.overviewTabLabel/);
  assert.match(paperLayout, /overviewTabLabel: \{ flex: 1 \}/);
  assert.match(paperLayout, /portfolioTabLabel: \{ flexShrink: 1, minWidth: 0, textAlign: 'center' as const \}/);
  assert.match(portfolioTabs, /accessibilityLabel=\{tab\.id === 'positions' \? `Positions, \$\{positionsCount\} open` : tab\.label\}/);
  assert.match(portfolioTabs, /testID="paper-positions-count"[\s\S]*?\{positionsCount\}/);
  assert.match(portfolioTabs, /onPress=\{\(\) => onSelectTab\(tab\.id\)\}/);
});

test("Event Arena first-place podium keeps its card treatment without a separate top accent", () => {
  const podiumStart = leaderboard.indexOf("const renderPodiumCard =");
  const podiumEnd = leaderboard.indexOf("\n  const openCashTransfer", podiumStart);
  const podium = leaderboard.slice(podiumStart, podiumEnd);
  assert.ok(podiumStart >= 0 && podiumEnd > podiumStart);
  assert.match(podium, /borderWidth: entry\?\.isCurrentUser \? 2 : 1/);
  assert.match(podium, /borderColor: entry\?\.isCurrentUser \? colors\.gold : entry \? `\$\{medal\.color\}D0`/);
  assert.match(podium, /\['rgba\(229,191,99,0\.30\)'/);
  assert.doesNotMatch(podium, /height: 4, borderTopLeftRadius: 24, borderTopRightRadius: 24/);
});

test("Lightning Round uses an existing Event Arena account and preserves its archive", () => {
  assert.doesNotMatch(screen, /testID="paper-lightning-account-unavailable"/);
  assert.doesNotMatch(screen, /Join Lightning Round to activate its separate portfolio/);
  assert.match(lightningRoute, /<LightningRoundScreen \/>/);
  assert.match(mobileRootLayout, /<Stack\.Screen name="lightning-round"/);
  assert.match(lightningInvitation, /testID="open-lightning-round"/);
  assert.match(lightningRound, /event-arena\/lightning-round\/prepare[\s\S]*?method: 'POST'/);
  assert.match(lightningRound, /payload\.available === false/);
  assert.match(lightningRound, /payload\.message \|\| 'No eligible Lightning Round dates are currently available\.'/);
  assert.match(lightningRound, /findPreparedLightningRoundWindow\(preparedEvents, now\)/);
  assert.doesNotMatch(lightningRound, /getLightningRoundWindow\(now\)/);
  assert.match(lightningRound, /getOrCreateLightningEventArenaAccount\(/);
  assert.match(lightningRound, /accounts: accountSelection\.created\s*\?/);
  assert.match(lightningRound, /resets your shared Event Arena account to \$100,000/);
  assert.match(lightningRound, /resetLightningSharedAccountSnapshot\(/);
  assert.match(lightningRound, /sharedAccountResetEventId: window\.id/);
  assert.match(lightningRound, /RESET ACCOUNT & JOIN/);
  assert.match(lightningRound, /RESET & PREPARE ORDERS/);
  assert.match(screen, /isLightningRoundAccountThemeActive\(/);
  assert.match(screen, /testID="paper-lightning-shared-card-background"/);
  assert.match(screen, /isActiveLightningEvent \|\| account\?\.id\.startsWith\('paper-lightning:'\)/);
  assert.match(screen, /isActiveLightningEvent && styles\.lightningRoundEventHero/);
  assert.match(lightningRound, /activeId: accountId/);
  assert.doesNotMatch(lightningRound, /LIGHTNING_ACCOUNT_ID|paper-lightning:\$\{eventId\}/);
  assert.match(lightningRound, /eventId: window\.id/);
  assert.match(lightningRound, /startingBalance: LIGHTNING_ROUND_STARTING_BALANCE/);
  assert.match(lightningRound, /rankingDirection: 'highest-return'/);
  assert.match(lightningRound, /eventType: 'lightning-round'/);
  assert.match(lightningRound, /NEXT ROUND STARTS IN/);
  assert.match(lightningRound, /TIME LEFT IN THIS ROUND/);
  assert.match(lightningRound, /Event notifications in Event Arena settings can remind you when an eligible round opens/);
  assert.match(events, /<EventArenaReminderControls compact \/>/);
  assert.match(eventArenaReminderControls, /Three reminders per event and eligible Lightning Round/);
  assert.match(lightningRound, /ACCOUNT EQUITY/);
  assert.match(lightningRound, /DOLLAR P\/L/);
  assert.match(lightningRound, /PARTICIPANT/);
  assert.match(lightningRound, /Past Lightning Rounds/);
  assert.match(lightningRound, /getLightningRoundSeasonSummary\(store\.history, now\)/);
  assert.match(lightningRound, /testID="lightning-round-season-summary"/);
  assert.match(lightningRound, /weekly records below stay separate/);
  assert.match(lightningRound, /PaperEventShareCard event=\{event\}/);
  assert.match(events, /getLightningRoundSeasonSummary\(store\.history, now\)/);
  assert.match(events, /testID="paper-event-lightning-season-summary"/);
  assert.match(events, /Open any event below to review its original result, artwork, and equity history/);
  assert.match(lightningRound, /getLightningRoundEventTransactions\(/);
  assert.match(lightningRound, /getLightningRoundEventTransactions\(\s*accountData\.transactions,\s*enrollment\.eventId,\s*enrollment\.accountId/);
  assert.match(lightningRound, /getLightningRoundEventPortfolio\(/);
  assert.match(lightningRound, /challengeAccountId: enrollment\?\.accountId/);
  assert.match(lightningRound, /formatProviderPriceSource/);
  assert.match(lightningRound, /Provider time unavailable/);
  assert.doesNotMatch(lightningRound, /ensurePaperChallengeAccount/);
  assert.match(lightningRound, /persistPaperChallengeFinalization/);
  assert.match(lightningRound, /lightning-round-archive-status/);
  assert.match(lightningRound, /Final standings are waiting for prices/);
  assert.match(lightningRound, /waiting for closing prices before it can publish final standings/);
  assert.match(lightningRound, /RETRY FINAL PRICES/);
  assert.match(lightningRound, /submitPaperChallengeScoreNow/);
  assert.match(lightningRound, /tab === 'leaderboard' && \(/);
  assert.match(leaderboard, /updatePaperChallengeEnrollment\(/);
  assert.match(leaderboard, /!isLightningRound/);
  assert.match(challenge, /lightningEnrollment\?: PaperChallengeEnrollment \| null/);
  assert.match(challenge, /isPaperChallengeAccountId/);
  assert.match(challenge, /eventType === 'lightning-round' \? 'lightningEnrollment' : 'enrollment'/);
  assert.match(challenge, /startAtMs \+ DAY_MS/);
  assert.match(eventAccountDashboard, /\$100,000 START · 24 HOURS · HIGHEST RETURN WINS/);
  assert.match(eventArenaApi, /prepareLightningRoundEvents/);
  assert.match(eventArenaApi, /lightning-round-arena/);
  assert.match(alertWorker, /async function prepareScheduledLightningRounds\(\): Promise<void>[\s\S]*?prepareLightningRoundEvents\(pool\)/);
  assert.match(alertWorker, /while \(true\) \{\s*await prepareScheduledLightningRounds\(\)/);
  assert.match(alertWorker, /processDueLightningRoundOrders/);
  assert.match(eventArenaApi, /event_arena_lightning_participants/);

  const standardArtworkList = challenge.match(/export const PAPER_CHALLENGE_ARTWORK_IDS = \[([\s\S]*?)\] as const/)?.[1] ?? '';
  assert.match(standardArtworkList, /'green-stock-exchange'/);
  assert.doesNotMatch(standardArtworkList, /lightning-round-arena/);
});

test("unavailable final quotes remain retryable and Event Arena refresh reloads prices", () => {
  const missingQuotesStart = lightningRound.indexOf("if (missingSymbols.length > 0)");
  const missingQuotesEnd = lightningRound.indexOf("\n    }", missingQuotesStart);
  assert.ok(missingQuotesStart >= 0 && missingQuotesEnd > missingQuotesStart);
  assert.match(lightningRound.slice(missingQuotesStart, missingQuotesEnd), /setArchiveWaitingMessage\(/);
  assert.match(lightningRound.slice(missingQuotesStart, missingQuotesEnd), /setArchiveError\(''\)/);
  assert.doesNotMatch(lightningRound.slice(missingQuotesStart, missingQuotesEnd), /archiveAttemptedEventRef\.current = enrollment\.eventId/);

  const refreshCallback = eventArena.slice(eventArena.indexOf("onRefresh={() => {"), eventArena.indexOf("\n        onOpenTrades", eventArena.indexOf("onRefresh={() => {")));
  assert.match(refreshCallback, /readStore\(\)/);
  assert.match(refreshCallback, /refreshAccountData\(\)/);
});

test("Lightning Round promotion reuses the account card and opens its existing screen", () => {
  assert.match(screen, /findLightningRoundWindow\(challengeNow - 24 \* 60 \* 60 \* 1000\)/);
  assert.match(screen, /onOpenLightningRound=\{\(\) => router\.push\('\/lightning-round'\)\}/);
  assert.match(eventAccountDashboard, /getLightningRoundCardPromotionPhase\(lightningRoundPromotionWindow, now\)/);
  assert.match(eventAccountDashboard, /EVENT_ARENA_ARTWORK_SOURCES\['lightning-round-arena'\]/);
  assert.match(eventAccountDashboard, /testID="paper-open-lightning-round-promotion"/);
  assert.match(eventAccountDashboard, /JOIN EVENT/);
  assert.match(eventAccountDashboard, /VIEW EVENT/);
  assert.match(eventAccountDashboard, /<ImageBackground[\s\S]*?source=\{EVENT_ARENA_ARTWORK_SOURCES\['lightning-round-arena'\]\}[\s\S]*?backgroundColor: 'rgba\(2,15,43,0\.48\)'/);
  assert.match(eventAccountDashboard, /testID="paper-event-view-leaderboard"/);
  assert.match(eventAccountDashboard, /testID="paper-event-account-equity"/);
});

test("Event Arena header invitation uses the prepared schedule and existing Lightning Round route", () => {
  assert.match(eventArena, /<LightningRoundInvitation[\s\S]*?onOpen=\{\(\) => router\.push\('\/lightning-round'\)\}/);
  assert.match(lightningInvitation, /event-arena\/lightning-round\/prepare[\s\S]*?method: 'POST'/);
  assert.match(lightningInvitation, /findPreparedLightningRoundInvitationWindow\(preparedEvents, now\)/);
  assert.match(lightningInvitation, /markLightningRoundInvitationSeen\(/);
  assert.match(lightningInvitation, /enrollmentReady && phase/);
  assert.match(lightningInvitation, /useReduceMotionPreference/);
  assert.match(lightningInvitation, /duration: 2_200/);
  assert.match(lightningInvitation, /flexShrink: 0/);
  assert.match(lightningInvitation, /minHeight: 50/);
  assert.match(lightningInvitation, /24-HOUR CHAMPIONSHIP/);
  assert.match(lightningInvitation, /LIGHTNING ROUND/);
});

test("Event Arena header keeps its alias aligned and omits the invitation outside eligibility", () => {
  const headerRowStart = eventArena.indexOf('testID="event-arena-header-row"');
  const invitationStart = eventArena.indexOf("<LightningRoundInvitation", headerRowStart);
  const tabsStart = eventArena.indexOf('testID="event-arena-section-tabs"', invitationStart);
  assert.ok(headerRowStart >= 0 && invitationStart > headerRowStart && tabsStart > invitationStart);
  const header = eventArena.slice(headerRowStart, tabsStart);
  assert.match(header, /accessibilityLabel="Go back"/);
  assert.match(header, /Event Arena<\/Text>[\s\S]*?Competition hub/);
  assert.match(header, /<LightningRoundInvitation[\s\S]*?alias=\{participantAlias \|\| ''\}/);
  assert.doesNotMatch(header, /paddingVertical: 7|marginTop: [1-9]\d{1,}/);
  assert.match(eventArena, /paddingBottom: 4, borderBottomWidth/);
  assert.match(eventArena, /paddingTop: 4 \}\}>\s*\{SECTIONS\.map/);
  assert.match(lightningInvitation, /if \(!shouldRenderLightningRoundInvitationButton\(enrollmentReady, phase, schedule !== null\) \|\| !phase \|\| !schedule\) \{\s*return <Alias alias=\{alias\} width=\{width\} \/>;\s*\}/);
  assert.doesNotMatch(lightningInvitation, /return \(\s*<View style=\{styles\.row\}>\s*<Alias/);
  assert.match(lightningInvitation, /<TouchableOpacity[\s\S]*?testID="open-lightning-round"/);
  assert.match(lightningInvitation, /<View style=\{\[styles\.headerActions,[\s\S]*?<Alias alias=\{alias\} width=\{width\} \/>[\s\S]*?<Animated\.View/);
  assert.match(lightningInvitation, /getEventArenaHeaderColumnWidth\(width\)/);
  assert.match(lightningInvitation, /shouldShowLightningRoundInvitationAction\(width\)/);
  assert.match(lightningInvitation, /\{showAction \? \([\s\S]*?styles\.action[\s\S]*?\) : null\}/);
  assert.match(lightningInvitation, /headerActions: \{[\s\S]*?flexShrink: 0[\s\S]*?alignItems: 'flex-end'/);
  const eligibleRenderStart = lightningInvitation.indexOf('<View style={[styles.headerActions');
  const eligibleRenderEnd = lightningInvitation.indexOf('</View>\n  );', eligibleRenderStart);
  const eligibleRender = lightningInvitation.slice(eligibleRenderStart, eligibleRenderEnd);
  assert.equal((eligibleRender.match(/<Alias alias=\{alias\} width=\{width\} \/>/g) ?? []).length, 1);
  assert.equal(shouldRenderLightningRoundInvitationButton(true, 'preparation', true), true);
  assert.equal(shouldRenderLightningRoundInvitationButton(true, 'active', true), true);
  assert.equal(shouldRenderLightningRoundInvitationButton(true, null, true), false);
  assert.equal(shouldRenderLightningRoundInvitationButton(false, 'active', true), false);
  assert.equal(shouldRenderLightningRoundInvitationButton(true, 'active', false), false);
  assert.equal(shouldShowLightningRoundInvitationAction(320), false);
  assert.equal(shouldShowLightningRoundInvitationAction(360), false);
  assert.equal(shouldShowLightningRoundInvitationAction(400), false);
  assert.equal(shouldShowLightningRoundInvitationAction(420), true);
  assert.equal(shouldShowLightningRoundInvitationAction(568), true);

  for (const screenWidth of [320, 360, 390, 430]) {
    const contentWidth = screenWidth - 32;
    const titleWidth = contentWidth - 44 - 8 - getEventArenaHeaderColumnWidth(screenWidth);
    assert.ok(titleWidth >= 88, `${screenWidth}px leaves room for the title beside the invitation`);
  }
});

test("Event Arena back always opens Paper Trading positions and selects its saved enrollment account", () => {
  const headerStart = eventArena.indexOf('testID="event-arena-header-row"');
  const headerEnd = eventArena.indexOf('testID="event-arena-section-tabs"', headerStart);
  const header = eventArena.slice(headerStart, headerEnd);
  const accountRouteStart = screen.indexOf("const handledChallengeRouteRef = useRef<string | null>(null);");
  const accountRouteEnd = screen.indexOf("\n  const renameAccount", accountRouteStart);
  const accountRoute = screen.slice(accountRouteStart, accountRouteEnd);

  assert.ok(headerStart >= 0 && headerEnd > headerStart);
  assert.match(header, /accessibilityLabel="Go back"[\s\S]*?router\.navigate\(\{\s*pathname: '\/paper'/);
  assert.match(header, /tab: 'positions'/);
  assert.match(header, /\.\.\.\(enrollment \? \{ challengeAccountId: enrollment\.accountId \} : \{\}\)/);
  assert.doesNotMatch(header, /router\.back\(\)/);

  assert.match(screen, /useLocalSearchParams<\{ challengeAccountId\?: string; tab\?: string \}>\(\)/);
  assert.match(screen, /if \(loaded && routeParams\.tab === 'positions'\) setActiveTab\('positions'\)/);
  assert.match(accountRoute, /if \(!loaded \|\| !requestedId \|\| handledChallengeRouteRef\.current === requestedId\) return/);
  assert.match(accountRoute, /if \(!accounts\.some\(\(item\) => item\.id === requestedId\)\) return/);
  assert.match(accountRoute, /if \(activeIdRef\.current !== requestedId\) void switchAccount\(requestedId\)/);
  assert.doesNotMatch(accountRoute, /ensurePaperChallengeAccount|resetPaperAccountData|saveAll/);
});

test("Lightning Round championship header preserves accessible actions and bundled individual emblems", () => {
  assert.match(lightningRound, /onBack=\{\(\) => router\.back\(\)\}/);
  assert.match(lightningRound, /onArchive=\{\(\) => changeTab\('past'\)\}/);
  assert.match(lightningRound, /testID=\{`lightning-round-tab-\$\{item\.id\}`\}/);
  assert.match(lightningRound, /emblem=\{LIGHTNING_EMBLEMS\[item\.id\]\}/);
  assert.match(lightningRound, /selected=\{tab === item\.id\}/);
  assert.match(lightningRound, /onPress=\{\(\) => changeTab\(item\.id\)\}/);
  assert.match(lightningHeader, /title = 'LIGHTNING ROUND'/);
  assert.match(lightningHeader, /accessibilityRole="header"/);
  assert.match(lightningHeader, /accessibilityLabel="Go back" onPress=\{onBack\}/);
  assert.match(lightningHeader, /accessibilityLabel="Open Past Events" onPress=\{onArchive\}/);
  assert.match(lightningHeader, /width: 44, height: 44/);
  assert.match(lightningHeader, /accessibilityRole="tab"/);
  assert.match(lightningHeader, /accessibilityLabel=\{label\}/);
  assert.match(lightningHeader, /accessibilityState=\{\{ selected \}\}/);
  assert.match(lightningHeader, /aria-selected=\{selected\}/);
  assert.match(lightningHeader, /<Text style=\{\[styles\.tabLabel,[\s\S]*?\{label\}<\/Text>/);
  assert.match(lightningHeader, /useReduceMotion\(\)/);
  assert.match(lightningHeader, /return \(\) => animation\.stop\(\)/);
  for (const name of ["round", "leaderboard", "trades", "past"]) {
    const image = readFileSync(new URL(`../assets/lightning-round-emblems/${name}.png`, import.meta.url));
    assert.deepEqual([...image.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
    assert.equal(image.readUInt32BE(16), 192);
    assert.equal(image.readUInt32BE(20), 192);
    assert.ok(image.byteLength < 60_000, `${name} stays optimized for mobile`);
    assert.ok(lightningHeader.includes(`require('../assets/lightning-round-emblems/${name}.png')`));
  }
  assert.doesNotMatch(lightningHeader, /https?:|c612e031/);
});

test("Lightning Round account summary uses the supplied bolt emblem", () => {
  const summaryStart = lightningRound.indexOf('testID="lightning-round-account-summary"');
  const accountTitle = lightningRound.indexOf('Your Lightning Round account', summaryStart);
  assert.ok(summaryStart >= 0 && accountTitle > summaryStart);
  const accountHeader = lightningRound.slice(summaryStart, accountTitle);
  assert.match(accountHeader, /testID="lightning-round-account-icon"/);
  assert.match(accountHeader, /require\('\.\.\/assets\/lightning-round-emblems\/account-bolt\.png'\)/);
  assert.doesNotMatch(accountHeader, /Feather name="award"/);

  const image = readFileSync(new URL("../assets/lightning-round-emblems/account-bolt.png", import.meta.url));
  assert.deepEqual([...image.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
  assert.equal(image.readUInt32BE(16), 256);
  assert.equal(image.readUInt32BE(20), 256);
  assert.ok(image.byteLength < 150_000);
});

test("Lightning Round requests a display name and joins the shared account", () => {
  assert.match(challenge, /getLatestLightningRoundAlias/);
  assert.match(lightningRound, /getLatestLightningRoundAlias\(store\.history\)/);
  assert.match(lightningRound, /testID="lightning-round-reuse-alias"/);
  assert.match(lightningRound, /Choose a competition display name/);
  assert.match(lightningRound, /Reuse your previous display name\?/);
  assert.match(lightningRound, /USE PREVIOUS ROUND’S ALIAS/);
  assert.match(lightningRound, /onPress=\{\(\) => \{ setAlias\(previousLightningAlias\); setJoinError\(''\); \}\}/);

  const nextEnrollmentStart = lightningRound.indexOf("const nextEnrollment: PaperChallengeEnrollment =");
  const nextEnrollmentEnd = lightningRound.indexOf("await AsyncStorage.setItem(PAPER_CACHE_KEY", nextEnrollmentStart);
  const nextEnrollment = lightningRound.slice(nextEnrollmentStart, nextEnrollmentEnd);
  assert.match(nextEnrollment, /accountId,/);
  assert.match(nextEnrollment, /accountName: existingAccount\.name/);
  assert.match(nextEnrollment, /leaderboardAlias: alias\.trim\(\)/);
  assert.match(nextEnrollment, /leaderboardOptedIn: true/);
  assert.doesNotMatch(nextEnrollment, /previousLightningAlias|store\.history/);
  assert.match(lightningRound, /router\.dismissTo\(\{ pathname: '\/paper', params: \{ challengeAccountId: accountId \} \}\)/);
});

test("declining the trade-entry offer cancels it, while enrollment uses the existing join flow", () => {
  assert.match(lightningPreparation, /shouldOfferLightningRoundTradeEnrollment/);
  assert.match(lightningPreparation, /args\.accountId\.startsWith\('paper-event:'\)/);
  assert.match(lightningPreparation, /args\.event\.eventType === 'lightning-round'/);
  assert.match(lightningPreparation, /args\.enrollment\?\.eventId !== args\.event\.id/);
  assert.match(screen, /findPreparedLightningRoundWindow\(payload\.events, nowMs\)/);
  assert.match(screen, /shouldOfferLightningRoundTradeEnrollment\(\{[\s\S]*?accountId: requestedAccountId/);
  assert.match(screen, /LIGHTNING ROUND IS APPROACHING!/);
  assert.match(screen, /24 hours\. One champion\./);
  assert.match(screen, /Use your existing Event Arena paper account\. The highest percentage return wins\./);
  assert.match(screen, /During preparation, you must join before trading in this account\. NOT NOW cancels this trade attempt\./);
  assert.match(screen, /EVENT STARTS IN/);
  assert.match(screen, /STARTING CAPITAL[\s\S]*?\$100,000/);
  assert.match(screen, /DURATION[\s\S]*?24 hours/);
  assert.match(screen, /WINNER[\s\S]*?Highest % return/);
  const dismissStart = screen.indexOf("const dismissLightningTradeOffer = () => {");
  const dismissEnd = screen.indexOf("\n  };", dismissStart);
  const dismiss = screen.slice(dismissStart, dismissEnd);
  assert.ok(dismissStart >= 0 && dismissEnd > dismissStart);
  assert.match(dismiss, /setLightningTradeOfferWindow\(null\)/);
  assert.doesNotMatch(dismiss, /continueTrade|pendingTradeEntryRef|setShowTradeModal|setShowOrderSheet/);
  assert.doesNotMatch(screen, /pendingTradeEntryRef|continuePendingTradeEntry/);
  assert.match(screen, /onRequestClose=\{dismissLightningTradeOffer\}/);
  assert.match(screen, /accessibilityLabel="Dismiss Lightning Round enrollment offer"[\s\S]*?onPress=\{dismissLightningTradeOffer\}/);
  assert.match(screen, /testID="not-now-lightning-round-from-trade"[\s\S]*?onPress=\{dismissLightningTradeOffer\}/);
  assert.match(screen, /testID="join-lightning-round-from-trade"[\s\S]*?router\.push\(\{ pathname: '\/lightning-round', params: \{ join: 'trade' \} \}\)/);
  assert.match(screen, /router\.push\(\{ pathname: '\/lightning-round', params: \{ join: 'trade' \} \}\)/);
  assert.match(screen, /const openBuyModal = \(\) => \{\s*requestTradeEntry\(/);
  assert.match(screen, /const openSellModal = \(pos: PaperPosition\) => \{\s*requestTradeEntry\(/);
  assert.match(screen, /const openCoverModal = \(pos: PaperPosition\) => \{\s*requestTradeEntry\(/);
  assert.match(lightningRound, /routeParams\.join !== 'trade'/);
  assert.match(lightningRound, /setJoinOpen\(true\)/);
  assert.match(lightningRound, /leaderboardAlias: alias\.trim\(\)/);
  assert.match(lightningRound, /router\.dismissTo\(\{ pathname: '\/paper', params: \{ challengeAccountId: accountId \} \}\)/);
  assert.match(lightningRound, /joiningRef\.current/);
  assert.match(lightningRound, /current\.lightningEnrollment\s*\?\s*current/);
});

test("Lightning Round preparation exposes qualification, order edits, and final-order confirmation", () => {
  assert.match(screen, /ONE MORE STEP TO ENTER!/);
  assert.match(screen, /YOU'RE QUALIFIED — YOUR MARKET ORDER IS QUEUED\./);
  assert.match(screen, /NOT QUALIFIED — ADD AT LEAST ONE ACTIVE MARKET ORDER\./);
  assert.match(screen, /PENDING — EXECUTES AT EVENT START/);
  assert.match(screen, /actual execution price may differ/i);
  assert.match(screen, /LEAVE LIGHTNING ROUND\?/);
  assert.match(screen, /KEEP MY ORDER/);
  assert.match(screen, /CANCEL ORDER & LEAVE/);
  assert.match(screen, /cancelLightningRoundStagedOrders\(/);
  assert.match(screen, /isLightningRoundPreparationOpen\(/);
  assert.match(screen, /canExecuteLightningRoundStagedOrder\(/);
  const stagedSubmitStart = screen.indexOf("if (preparingLightningOrder && lightningEnrollment) {");
  const stagedSubmitEnd = screen.indexOf("let currentQuote: LiveQuote | undefined;", stagedSubmitStart);
  const stagedSubmit = screen.slice(stagedSubmitStart, stagedSubmitEnd);
  assert.ok(stagedSubmitStart >= 0 && stagedSubmitEnd > stagedSubmitStart);
  assert.match(stagedSubmit, /await saveOrders\(updatedOrders\)/);
  assert.doesNotMatch(stagedSubmit, /saveAll\(|savePositions\(|saveTransactions\(/);

  const finalCancelStart = screen.indexOf("const confirmFinalLightningCancellation = async () =>");
  const finalCancelEnd = screen.indexOf("const editOrder =", finalCancelStart);
  const finalCancel = screen.slice(finalCancelStart, finalCancelEnd);
  assert.ok(finalCancelStart >= 0 && finalCancelEnd > finalCancelStart);
  assert.match(finalCancel, /await saveOrders\(cancelledOrders\)[\s\S]*?lightningEnrollment: null/);
  assert.doesNotMatch(finalCancel, /history:/);

  const deleteRequestStart = screen.indexOf("const requestDeleteOrder = (order: PaperOrder) =>");
  const deleteRequestEnd = screen.indexOf("const confirmDeleteOrder", deleteRequestStart);
  const deleteRequest = screen.slice(deleteRequestStart, deleteRequestEnd);
  assert.match(deleteRequest, /otherValidOrders\.length > 0/);
  assert.match(deleteRequest, /setFinalLightningCancelOrder\(order\)/);
  assert.match(screen, /testID="lightning-round-leave-error"/);
  assert.match(eventLiveNotice, /testID="lightning-round-entry-failure"/);

  const evaluatorStart = screen.indexOf("const evaluatePendingOrders = useCallback(");
  const evaluatorEnd = screen.indexOf("const fetchQuotes = useCallback(", evaluatorStart);
  const evaluator = screen.slice(evaluatorStart, evaluatorEnd);
  assert.match(evaluator, /canExecuteLightningRoundStagedOrder\(order, matchingLightningEnrollment, Date\.now\(\)\)/);
  assert.match(evaluator, /if \(isStagedLightningOrder\) \{[\s\S]*?server worker, not this foreground loop, owns staged fills\.[\s\S]*?Avoid a second foreground fill after the server has started processing\.[\s\S]*?continue;\s*\}/);
  assert.match(evaluator, /if \(!q\) continue;[\s\S]*?canEvaluatePendingOrderQuote\(order, q\)/);
  assert.match(evaluator, /status: 'cancelled' as const, rejectionReason: executionRiskError/);
  assert.match(evaluator, /status: 'cancelled' as const, rejectionReason: fillResult\.reason/);
});

test("the full Paper screen scrolls while prepared orders and all five main tabs stay reachable", () => {
  assert.match(screen, /const lightningPreparedOrders = lightningEnrollmentForDisplay\?\.accountId === activeId[\s\S]*?lightningRoundEventId === lightningEnrollmentForDisplay\.eventId/);
  const mainScrollStart = screen.indexOf('<ScrollView\n        testID="paper-content"');
  const mainScrollEnd = screen.indexOf('</ScrollView>', mainScrollStart);
  const mainScroll = screen.slice(mainScrollStart, mainScrollEnd);
  const tradeAction = screen.indexOf('<PaperTradingAction', mainScrollEnd);
  const bottomBar = screen.indexOf('<BottomTabBar />', tradeAction);
  assert.ok(mainScrollStart >= 0 && mainScrollEnd > mainScrollStart);
  assert.match(mainScroll, /showsVerticalScrollIndicator=\{false\}/);
  assert.ok(mainScrollStart < screen.indexOf('{/* Header */', mainScrollStart));
  assert.ok(mainScrollStart < screen.indexOf('testID="lightning-round-preparation-banner"', mainScrollStart));
  assert.ok(mainScrollEnd > screen.indexOf('<PaperPortfolioNavigation'));
  assert.ok(mainScrollEnd > screen.indexOf("activeTab === 'growth'"));
  assert.ok(tradeAction > mainScrollEnd && bottomBar > tradeAction);

  const orderListStart = screen.indexOf('testID="lightning-round-prepared-order-list"');
  const orderListEnd = screen.indexOf('<PaperEventLiveNotice', orderListStart);
  const orderList = screen.slice(orderListStart, orderListEnd);
  assert.match(orderList, /lightningPreparedOrders\.map\(\(order\)/);
  assert.doesNotMatch(orderList, /<ScrollView|maxHeight|nestedScrollEnabled/);

  for (const testID of [
    'bottom-tab-analyze',
    'bottom-tab-top-picks',
    'bottom-tab-paper',
    'bottom-tab-portfolio',
    'bottom-tab-event-arena',
  ]) {
    assert.ok(bottomTabBar.includes(testID), `The fixed main tab bar must include ${testID}.`);
  }
});

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
  assert.match(leaderboard, /getEventArenaParticipantId\(AsyncStorage, getInstallationId\)/);
  assert.match(leaderboard, /currentEnrollment\.leaderboardOptedIn/);
  assert.match(leaderboard, /REFRESH_INTERVAL_MS = 120_000/);
  assert.match(leaderboard, /AppState\.addEventListener/);
  assert.match(leaderboard, /setInterval\(\(\) => \{ void refresh\(\); \}, REFRESH_INTERVAL_MS\)/);
  assert.match(leaderboard, /updatePaperChallengeEnrollment\(/);
  assert.match(leaderboard, /event-arena\/\$\{encodeURIComponent\(event\.id\)\}\/leaderboard/);
  assert.match(leaderboard, /useGetEventArenaLeaderboard/);
  assert.match(leaderboard, /isPreStartRegistration = !isLightningRound && event\.phase === 'upcoming' && !account/);
  assert.match(leaderboard, /buildPreStartEventArenaScore\(\{[\s\S]*?installationId: await getEventArenaParticipantId/);
  assert.match(leaderboard, /testID="paper-event-registration-status"[\s\S]*?YOU’RE REGISTERED[\s\S]*?Your Event Portfolio opens when the event starts/);
  assert.doesNotMatch(leaderboard, /getEventArenaLeaderboardHistory|paper-event-rank-history|Your event history|Self-reported rank and return snapshots|retry-paper-event-rank-history|displayedEventHistory|eventHistory/);
  assert.match(leaderboard, /X-Event-Arena-Installation-Id/);
  assert.match(leaderboard, /entry\.isCurrentUser/);
  assert.doesNotMatch(leaderboard, /paper-event-leaderboard-your-position/);
  assert.match(leaderboard, /entry\.isCurrentUser && <Text style=\{\{ color: colors\.gold/);
  assert.match(leaderboard, /testID="paper-event-average-cost-fallback"/);
  assert.match(leaderboard, /average cost was used for those positions in your score/);
  assert.match(leaderboard, /setAverageCostFallbackByEvent\(\(current\) => \(\{ \.\.\.current, \[event\.id\]: submission\.usesAverageCost \}\)\)/);
  assert.match(leaderboard, /getEventArenaAccountEquity/);
  assert.match(leaderboard, /Object\.fromEntries\(quotes\)/);
  assert.match(leaderboard, /Current quotes are unavailable for your event account/);
  assert.match(leaderboard, /startingBalance: enrollment\.startingBalance \?\? event\.startingBalance/);
assert.match(leaderboard, /GREEN BULL CHAMPIONSHIP/);
assert.match(leaderboard, /STARTING CAPITAL/);
  assert.match(leaderboard, /submitEventArenaScore\(event\.id, submission\.payload\)/);
  assert.doesNotMatch(leaderboard, /averageCostFallbackByEvent\[entry\.|averageCostFallbackByEvent\[detail\./);
  assert.match(leaderboard, /paper-event-leaderboard-stale/);
  assert.match(leaderboard, /tradeCount/);
  assert.match(leaderboard, /profitLoss/);
  assert.match(leaderboard, /transaction\.accountId === enrollment\.accountId/);
  assert.match(leaderboard, /date >= event\.startAtMs/);
  assert.match(leaderboard, /date <= event\.endAtMs/);
  assert.match(leaderboard, /estimated allocation percentage of your \{isLightningRound \? 'event-only portfolio' : 'reported Event Arena equity'\}, and Long or Short direction/);
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

test("Event Arena podium sharing shows account values without a repeated self-reported box", () => {
  const cardStart = leaderboard.indexOf("function EventArenaPodiumShareCard(");
  const cardEnd = leaderboard.indexOf("\nasync function buildEventSubmission", cardStart);
  const shareCardSource = leaderboard.slice(cardStart, cardEnd);

  assert.match(leaderboard, /testID="share-paper-event-podium"/);
  assert.match(leaderboard, /testID="share-paper-event-podium-confirm"/);
  assert.match(leaderboard, /Platform\.OS !== 'web' && entries\.length > 0[\s\S]*?testID="share-paper-event-podium"/);
  assert.match(leaderboard, /<ViewShot[\s\S]*?options=\{\{ format: 'png', quality: 1 \}\}[\s\S]*?EventArenaPodiumShareCard event=\{event\} slots=\{podiumSlots\}/);
  assert.match(leaderboard, /const uri = await viewShot\.capture\?\.\(\);[\s\S]*?NativeShare\.default\.open\(\{[\s\S]*?url: uri,[\s\S]*?type: 'image\/png',[\s\S]*?message: getPodiumShareCaption\(event\)/);
  assert.match(leaderboard, /Meisner Method · \$\{getPodiumEventName\(event\)\} · \$\{dateRangeLabel\(event\.startAtMs, event\.endAtMs\)\}/);
  assert.match(leaderboard, /Scores are self-reported and not independently verified\./);
  assert.match(leaderboard, /failOnCancel: false/);
  const captionStart = leaderboard.indexOf('function getPodiumShareCaption');
  const captionEnd = leaderboard.indexOf('\nfunction getEventEnrollment', captionStart);
  const captionSource = leaderboard.slice(captionStart, captionEnd);
  assert.doesNotMatch(captionSource, /account|position|cash|balance|symbol|holding|trade history/i);
  assert.match(shareCardSource, /EVENT_ARENA_ARTWORK_SOURCES\[event\.artworkId \?\? LEGACY_PAPER_CHALLENGE_ARTWORK_ID\]/);
  assert.match(shareCardSource, /testID="paper-event-penny-stock-podium-share-hero"/);
  assert.match(shareCardSource, /<PennyMayhemTitle compact \/>[\s\S]*?<PennyMayhemNameplate compact \/>/);
  assert.doesNotMatch(shareCardSource, /mm-mark-foreground\.png/);
  assert.match(shareCardSource, /event-arena-penny-stock-mayhem-premium\.jpg/);
  assert.match(shareCardSource, /MEISNER METHOD · PENNY STOCK MAYHEM/);
  assert.match(shareCardSource, /event\.eventType === 'lightning-round'[\s\S]*?'MEISNER METHOD · LIGHTNING ROUND'/);
  assert.match(shareCardSource, /\{slot\.entry\?\.alias \?\? 'Waiting for competitor'\}/);
  assert.match(shareCardSource, /\$\{money\(slot\.entry\.equity\)\} value/);
  assert.match(shareCardSource, /\{returnLabel\(slot\.entry\.returnPercent\)\}/);
  assert.doesNotMatch(shareCardSource, /SELF-REPORTED SCORE|SELF-REPORTED · NOT VERIFIED/);
  assert.match(shareCardSource, /event\.eventType === 'lightning-round' && \([\s\S]*?SERVER-CALCULATED · EVENT FILLS ONLY/);
  assert.doesNotMatch(shareCardSource, /accountId|participantToken|installationId|holdings|transactions|tradeCount|avgCost|shares/);
});

test("Event Arena trade rows emphasize totals and show colored realized profit or loss", () => {
  const tradesStart = eventArena.indexOf("const renderTrades = () =>");
  const tradesEnd = eventArena.indexOf("\n  const renderCompetition =", tradesStart);
  const tradesSource = eventArena.slice(tradesStart, tradesEnd);

  assert.match(tradesSource, /fontSize: 14 \}\}>\{money\(transaction\.total\)\}/);
  assert.match(tradesSource, /transaction\.realizedPnL === undefined[\s\S]*?transaction\.realizedPnL - \(transaction\.fee \?\? 0\)/);
  assert.match(tradesSource, /const isClosingTrade = transaction\.action === 'SELL' \|\| transaction\.action === 'BUY_TO_COVER'/);
  assert.match(tradesSource, /net >= 0 \? colors\.buyColor : colors\.sellColor/);
  assert.match(tradesSource, /net == null \? 'P\/L unavailable' : `P\/L \$\{net >= 0 \? '\+' : ''\}\$\{money\(net\)\}`/);
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
  assert.match(sectionTabs, /testID=\{`event-arena-tab-image-\$\{item\.id\}`\}/);
  assert.match(sectionTabs, /source=\{EVENT_ARENA_SECTION_ICON_SOURCES\[sectionTabTheme\]\[item\.id\]\}/);
  assert.match(sectionTabs, /!\s*isNeonGucciTheme && \(/);
  assert.doesNotMatch(sectionTabs, /<Feather name=\{item\.icon\}/);
  assert.match(sectionTabs, /backgroundColor: selected \? colors\.primary : colors\.card/);
  assert.match(sectionTabs, /borderColor: selected \? colors\.primary : colors\.border/);
  assert.match(sectionTabs, /color: selected \? colors\.primaryForeground : colors\.foreground/);
  assert.match(sectionTabs, /alignItems: 'center', justifyContent: 'center'/);
  assert.match(sectionTabs, /flex: 1, minWidth: 0, minHeight: SECTION_TAB_MIN_HEIGHT/);
  assert.match(sectionTabs, /width: SECTION_TAB_ICON_SIZE, height: SECTION_TAB_ICON_SIZE/);
  assert.match(sectionTabs, /height: SECTION_TAB_NEON_ART_HEIGHT/);
  assert.match(sectionTabs, /fontSize: SECTION_TAB_LABEL_SIZE/);
  assert.match(sectionTabs, /numberOfLines=\{1\} adjustsFontSizeToFit/);
  assert.match(sectionTabs, /textAlign: 'center'/);
  assert.match(eventArena, /const SECTION_TAB_MIN_HEIGHT = 60/);
  assert.match(eventArena, /const SECTION_TAB_ICON_SIZE = 36/);
  assert.match(eventArena, /const SECTION_TAB_NEON_ART_HEIGHT = 56/);
  assert.match(eventArena, /const SECTION_TAB_LABEL_SIZE = 10/);
  assert.match(eventArena, /flexDirection: 'row', gap: SECTION_TAB_GAP/);
  assert.match(eventArena, /paddingHorizontal: 16, paddingBottom: 4/);
  assert.doesNotMatch(sectionTabs, /<ScrollView/);
  assert.equal((eventArena.match(/\{ id: '(?:competition|leaderboard|trades|past)', label:/g) ?? []).length, 4);
  const sectionIds = ['competition', 'leaderboard', 'trades', 'past'];
  for (const [theme, prefix] of [['default', 'default'], ['patriot', 'patriot'], ['neonGucci', 'neon-gucci']]) {
    for (const sectionId of sectionIds) {
      const imagePath = `../assets/event-arena-section-tabs/${prefix}-${sectionId}.png`;
      const image = readFileSync(new URL(imagePath, import.meta.url));
      assert.deepEqual([...image.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
      assert.equal(image.readUInt32BE(16), theme === 'neonGucci' ? 256 : 192);
      assert.equal(image.readUInt32BE(20), theme === 'neonGucci' ? 113 : 192);
      assert.ok(image.byteLength < 100_000, `${theme} ${sectionId} artwork stays optimized for mobile`);
      assert.ok(eventArena.includes(`require('../assets/event-arena-section-tabs/${prefix}-${sectionId}.png')`));
    }
  }

  const gap = Number(eventArena.match(/const SECTION_TAB_GAP = (\d+)/)?.[1]);
  const sidePadding = 16;
  for (const screenWidth of [320, 360, 390]) {
    const cardWidth = (screenWidth - sidePadding * 2 - gap * 3) / 4;
    const contentWidth = cardWidth - 4;
    assert.ok(contentWidth >= 60, `${screenWidth}px phone leaves room for each tab label and icon`);
  }

});

test("Event Arena header and all four tabs remain separated in landscape and split-screen sizes", () => {
  const sectionTabsStart = eventArena.indexOf('testID="event-arena-section-tabs"');
  const bottomTabsStart = eventArena.indexOf("<BottomTabBar />", sectionTabsStart);
  const headerSource = eventArena.slice(eventArena.indexOf('testID="event-arena-header-row"'), sectionTabsStart);
  const tabsSource = eventArena.slice(sectionTabsStart, bottomTabsStart);
  const cases = [
    { label: "compact landscape", width: 568, height: 320, topInset: 24, bottomInset: 0 },
    { label: "split-screen", width: 400, height: 480, topInset: 24, bottomInset: 0 },
    { label: "narrow split-screen", width: 320, height: 480, topInset: 24, bottomInset: 0 },
  ];

  assert.ok(sectionTabsStart >= 0 && bottomTabsStart > sectionTabsStart);
  assert.match(headerSource, /<Text numberOfLines=\{1\} adjustsFontSizeToFit minimumFontScale=\{0\.75\}[\s\S]*?>Event Arena<\/Text>/);
  assert.match(headerSource, /<LightningRoundInvitation[\s\S]*?alias=\{participantAlias \|\| ''\}/);
  assert.match(tabsSource, /testID="event-arena-section-tabs" style=\{\{ flexDirection: 'row'/);
  assert.match(lightningInvitation, /headerDim: \{[\s\S]*?position: 'absolute'[\s\S]*?\}/);
  assert.match(lightningInvitation, /<Animated\.View pointerEvents="none" style=\{\[styles\.headerDim/);
  assert.match(lightningInvitation, /<Animated\.View pointerEvents="none" style=\{\[styles\.energySweep/);
  assert.match(lightningInvitation, /<Animated\.View pointerEvents="none" style=\{\[styles\.borderPulse/);
  assert.match(eventArena, /style=\{\{ flex: 1, minHeight: 0 \}\}/);

  const gap = Number(eventArena.match(/const SECTION_TAB_GAP = (\d+)/)?.[1]);
  const minTabHeight = Number(eventArena.match(/const SECTION_TAB_MIN_HEIGHT = (\d+)/)?.[1]);
  for (const { label, width, height, topInset, bottomInset } of cases) {
    const rightColumnWidth = getEventArenaHeaderColumnWidth(width);
    const titleColumnWidth = width - 32 - 44 - 8 - rightColumnWidth;
    const aliasWidth = Math.max(54, Math.min(116, width * 0.2));
    const tabWidth = (width - 32 - gap * 3) / 4;
    const headerHeight = 73;
    const tabsHeight = 4 + minTabHeight;
    const bottomBarHeight = 66;
    const availableContentHeight = height - topInset - bottomInset - headerHeight - tabsHeight - bottomBarHeight;

    assert.ok(Number.isFinite(gap) && Number.isFinite(minTabHeight));
    assert.ok(titleColumnWidth >= 88, `${label} keeps the title separate from the alias`);
    assert.ok(aliasWidth <= rightColumnWidth, `${label} keeps the alias inside its own header column`);
    assert.ok(tabWidth - 4 >= 60, `${label} keeps all four tab targets wide enough`);
    assert.equal(shouldShowLightningRoundInvitationAction(width), width >= 420);
    if (width >= 420) {
      assert.ok(rightColumnWidth - 103 >= 72, `${label} keeps invitation title space beside the action`);
    }
    assert.ok(availableContentHeight > 0, `${label} keeps the header and tab row above the bottom bar`);
    assert.equal((tabsSource.match(/testID=\{`event-arena-tab-\$\{item\.id\}`\}/g) ?? []).length, 1);
    assert.match(tabsSource, /flex: 1, minWidth: 0, minHeight: SECTION_TAB_MIN_HEIGHT/);
  }
});

test("championship leaderboard shows real podium scores, event context, and below-podium standings", () => {
  const stadiumMarker = leaderboard.indexOf("testID={isOneStockChallenge ? 'paper-event-one-stock-hero-art'");
  const stadiumStart = leaderboard.indexOf("<ImageBackground", stadiumMarker);
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

test("regular event leaderboards submit private account snapshots and force manual refreshes", () => {
  assert.match(leaderboard, /valuationSnapshot:\s*\{/);
  assert.match(leaderboard, /unsettledCash:\s*Number\.isFinite\(account\.unsettledCash\)/);
  assert.match(leaderboard, /shortCollateral:\s*Number\.isFinite\(account\.shortCollateral\)/);
  assert.match(leaderboard, /positions:\s*positions\.map\(\(position\)/);
  assert.match(leaderboard, /const refresh = useCallback\(async \(forceSubmission = false\)/);
  assert.match(leaderboard, /forceRefresh\s*\}/);
  assert.match(leaderboard, /testID="refresh-paper-event-leaderboard"[\s\S]*?refresh\(true\)/);
  assert.match(leaderboard, /scoreSource:\s*'participant' \| 'server'/);
  assert.match(leaderboard, /SERVER-VALUED/);
  assert.match(leaderboard, /setInterval\(\(\) => \{ void refresh\(\); \}, REFRESH_INTERVAL_MS\)/);
});

test("Android Lightning leaderboard refreshes both server scores and selected participant details", () => {
  const refreshStart = leaderboard.indexOf("const refresh = useCallback(async (forceSubmission = false)");
  const refreshEnd = leaderboard.indexOf("\n  }, [appIsActive,", refreshStart);
  const refreshFlow = leaderboard.slice(refreshStart, refreshEnd);
  const refreshEffectStart = leaderboard.indexOf("useEffect(() => {\n    if (!canRefreshEventArenaLeaderboard({ visible, appIsActive, installationIdReady })) return;", refreshEnd);
  const refreshEffectEnd = leaderboard.indexOf("\n  const optIn =", refreshEffectStart);
  const refreshEffect = leaderboard.slice(refreshEffectStart, refreshEffectEnd);

  assert.ok(refreshStart >= 0 && refreshEnd > refreshStart);
  assert.ok(refreshEffectStart >= 0 && refreshEffectEnd > refreshEffectStart);
  assert.match(leaderboard, /AppState\.addEventListener\('change', \(state\) => setAppIsActive\(state === 'active'\)\)/);
  assert.match(refreshEffect, /if \(!canRefreshEventArenaLeaderboard\(\{ visible, appIsActive, installationIdReady \}\)\) return/);
  assert.match(refreshEffect, /void refresh\(\)/);
  assert.match(refreshEffect, /setInterval\(\(\) => \{ void refresh\(\); \}, REFRESH_INTERVAL_MS\)/);
  assert.match(refreshEffect, /return \(\) => clearInterval\(timer\)/);
  assert.match(refreshEffect, /\[appIsActive, installationIdReady, refresh, visible\]/);
  assert.match(refreshFlow, /canRefreshEventArenaLeaderboard\(\{ visible, appIsActive, installationIdReady \}\)/);
  assert.match(refreshFlow, /await leaderboardQuery\.refetch\(\{ throwOnError: true \}\)/);
  assert.match(refreshFlow, /setRefreshing\(false\)[\s\S]*?refreshingRef\.current = false/);
  assert.match(leaderboard, /const detail = resolveSelectedLeaderboardEntry\(entries, selectedDetail\)/);
  assert.match(leaderboard, /const detailMissingFromLatestStandings = isSelectedLeaderboardEntryMissing\(/);
  assert.match(leaderboard, /testID="paper-event-detail-unavailable"[\s\S]*?not current server data/);
  assert.match(leaderboard, /detailMissingFromLatestStandings\s*\?\s*'SAVED ACCOUNT VALUE'/);
  assert.match(leaderboard, /detailMissingFromLatestStandings\s*\?\s*'Saved holdings'\s*:\s*'Current holdings'/);
  assert.match(leaderboard, /detailMissingFromLatestStandings \? 'YOUR LAST SAVED SCORE' : 'YOUR SCORE'/);
  assert.match(leaderboard, /!detailMissingFromLatestStandings/);
  assert.match(leaderboard, /const detailStaleWarning = leaderboardRefreshFailed[\s\S]*?detailMissingFromLatestStandings/);
  assert.match(leaderboard, /detail\.scoreSource === 'server' \? 'SERVER-VALUED' : 'DEVICE UPDATE'/);
  assert.match(leaderboard, /testID="paper-event-detail-equity"[\s\S]*?money\(detail\.equity\)/);
  assert.match(leaderboard, /Current holdings[\s\S]*?holding\.marketValue == null \? 'Value unavailable' : money\(holding\.marketValue\)/);
  assert.match(leaderboard, /isEventArenaScoreStale\(\{[\s\S]*?scoreSource: detail\.scoreSource,[\s\S]*?isLightningRound/);
  assert.match(leaderboard, /testID="paper-event-detail-freshness"[\s\S]*?STALE SCORE/);
  assert.match(leaderboard, /The current server score is unavailable; showing the last saved score/);
});

test("Android leaderboard pauses while inactive and resumes with the selected server entry", () => {
  const selected = {
    participantToken: "participant-a",
    rank: 2,
    equity: 99_578,
    cashBalance: 90_000,
    scoreSource: "participant",
    holdings: [{ symbol: "SPXL", marketValue: 4_578 }],
  };
  const refreshed = {
    participantToken: "participant-a",
    rank: 1,
    equity: 100_900,
    cashBalance: 98_500,
    scoreSource: "server",
    holdings: [{ symbol: "NVDA", marketValue: 2_400 }],
  };

  assert.equal(canRefreshEventArenaLeaderboard({
    visible: true,
    appIsActive: false,
    installationIdReady: true,
  }), false);
  assert.equal(canRefreshEventArenaLeaderboard({
    visible: true,
    appIsActive: true,
    installationIdReady: true,
  }), true);
  assert.equal(canRefreshEventArenaLeaderboard({
    visible: false,
    appIsActive: true,
    installationIdReady: true,
  }), false);
  assert.equal(resolveSelectedLeaderboardEntry([], selected)?.scoreSource, "participant");
  assert.equal(resolveSelectedLeaderboardEntry([], selected)?.holdings[0]?.symbol, "SPXL");
  assert.equal(isSelectedLeaderboardEntryMissing([], selected, false), false);
  assert.equal(isSelectedLeaderboardEntryMissing([], selected, true), true);
  assert.equal(isSelectedLeaderboardEntryMissing([selected], selected, true), false);
  const lastServerEntry = { ...selected, scoreSource: "server" };
  assert.equal(isSelectedLeaderboardEntryMissing([], lastServerEntry, true), true);
  assert.equal(resolveSelectedLeaderboardEntry([], lastServerEntry)?.scoreSource, "server");
  assert.deepEqual(resolveSelectedLeaderboardEntry([refreshed], selected), refreshed);
  assert.equal(resolveSelectedLeaderboardEntry([refreshed], selected)?.rank, 1);
  assert.equal(resolveSelectedLeaderboardEntry([refreshed], selected)?.equity, 100_900);
  assert.equal(resolveSelectedLeaderboardEntry([refreshed], selected)?.cashBalance, 98_500);
  assert.equal(resolveSelectedLeaderboardEntry([refreshed], selected)?.holdings[0]?.symbol, "NVDA");
  assert.equal(resolveSelectedLeaderboardEntry([refreshed], selected)?.holdings.some((holding) => holding.symbol === "SPXL"), false);
  assert.equal(resolveSelectedLeaderboardEntry([refreshed], selected)?.holdings[0]?.marketValue, 2_400);
  assert.equal(resolveSelectedLeaderboardEntry([], selected), selected);
});

test("a failed resume refresh keeps the last standings and retry updates selected details", async () => {
  const selected = {
    participantToken: "participant-a",
    rank: 2,
    equity: 99_578,
    scoreSource: "participant",
  };
  const refreshed = {
    participantToken: "participant-a",
    rank: 1,
    equity: 100_900,
    scoreSource: "server",
  };
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const queryKey = ["event-arena-leaderboard", "resume-recovery-test"];
  const lastSuccessfulResponse = { entries: [selected] };

  try {
    await queryClient.fetchQuery({
      queryKey,
      queryFn: async () => lastSuccessfulResponse,
    });
    await assert.rejects(
      queryClient.fetchQuery({
        queryKey,
        queryFn: async () => { throw new Error("temporary request failure"); },
      }),
      /temporary request failure/,
    );

    const retainedResponse = queryClient.getQueryData(queryKey);
    assert.deepEqual(retainedResponse, lastSuccessfulResponse);
    assert.equal(
      resolveSelectedLeaderboardEntry(retainedResponse.entries, selected)?.equity,
      99_578,
    );
    assert.ok(queryClient.getQueryState(queryKey)?.error);

    const recoveredResponse = await queryClient.fetchQuery({
      queryKey,
      queryFn: async () => ({ entries: [refreshed] }),
    });
    assert.equal(
      resolveSelectedLeaderboardEntry(recoveredResponse.entries, selected)?.scoreSource,
      "server",
    );
    assert.equal(
      resolveSelectedLeaderboardEntry(recoveredResponse.entries, selected)?.rank,
      1,
    );
    assert.equal(
      resolveSelectedLeaderboardEntry(recoveredResponse.entries, selected)?.equity,
      100_900,
    );

    assert.match(leaderboard, /const entries = leaderboardQuery\.data\?\.entries \?\? \[\]/);
    assert.match(leaderboard, /const leaderboardRefreshFailed = Boolean\(leaderboardQuery\.error && leaderboardQuery\.data\)/);
    assert.match(leaderboard, /leaderboardRefreshFailed \|\| detailMissingFromLatestStandings/);
    assert.match(leaderboard, /The latest leaderboard refresh failed[\s\S]*?may be stale/);
    assert.match(leaderboard, /Refresh failed · showing the last successful rankings/);
    assert.match(leaderboard, /testID="retry-paper-event-leaderboard"[\s\S]*?void refresh\(true\)/);
    assert.match(leaderboard, /await leaderboardQuery\.refetch\(\{ throwOnError: true \}\)/);
  } finally {
    queryClient.clear();
  }
});

test("One-Stock empty-state contrast and larger controls do not alter other event styling", () => {
  assert.match(leaderboard, /width: isOneStockChallenge \? 44 : 36[\s\S]*?height: isOneStockChallenge \? 44 : 36/);
  assert.match(leaderboard, /testID="paper-event-leaderboard-loading"[\s\S]*?backgroundColor: isOneStockChallenge \? 'rgba\(8,13,21,0\.92\)' : 'rgba\(8,13,21,0\.84\)'/);
  assert.match(leaderboard, /testID="paper-event-leaderboard-error"[\s\S]*?backgroundColor: isOneStockChallenge \? 'rgba\(7,13,20,0\.94\)' : colors\.card/);
  assert.match(leaderboard, /testID="paper-event-leaderboard-empty"[\s\S]*?backgroundColor: isOneStockChallenge \? 'rgba\(7,13,20,0\.92\)' : 'rgba\(7,13,20,0\.8\)'/);
  assert.match(leaderboard, /minHeight: isOneStockChallenge \? 44 : undefined/);
  assert.match(leaderboard, /minWidth: isOneStockChallenge \? 44 : undefined/);
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
  assert.match(renderPodium, /isBearMarketMayhem && isChampion \? 'ANTI-CHAMPION' : `RANK \$\{entry\.rank\} OF \$\{entries\.length\}`/);
  assert.match(renderPodium, /isBearMarketMayhem \? 'LOSS RETURN' : 'COMPETITION RETURN'[\s\S]*?\{returnLabel\(entry\.returnPercent\)\}/);
  assert.match(renderPodium, /CURRENT EQUITY[\s\S]*?\{money\(entry\.equity\)\}/);
  assert.match(renderPodium, /DOLLAR P\/L[\s\S]*?\{signedMoney\(entry\.profitLoss\)\}/);
  assert.match(renderPodium, /color: profitLossColor\(entry\.profitLoss\)/);
  assert.match(renderPodium, /isOneStockChallenge && \([\s\S]*?one-stock-podium-holding-\$\{slot\.rank\}[\s\S]*?oneStockHolding\?\.symbol \?\? 'HOLDING CASH'[\s\S]*?\{oneStockPositionValue\}[\s\S]*?\{money\(entry\.cashBalance\)\}/);
  assert.match(renderPodium, /isOneStockChallenge \? `, current holding \$\{oneStockHolding\?\.symbol \?\? 'cash'\}[\s\S]*?cash remaining \$\{money\(entry\.cashBalance\)\}` : ''/);
  assert.match(renderPodium, /isBearMarketMayhem && isChampion \? 'ANTI-CHAMPION'/);
  assert.doesNotMatch(renderPodium, /RUNNER-UP|THIRD PLACE/);
  assert.match(leaderboard, /THE BIGGEST LOSER WINS/);
  assert.match(leaderboard, /LOWEST PERCENTAGE RETURN RANKS FIRST/);
  assert.match(leaderboard, /BEAR MARKET MAYHEM/);
  assert.match(leaderboard, /ANTI-CHAMPION/);
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

test("participant score detail follows refreshed entries and explains Lightning data freshness", () => {
  const detailStart = leaderboard.indexOf('<View testID="paper-event-leaderboard-detail"');
  const detailEnd = leaderboard.indexOf("</ScrollView>\n          ) : (", detailStart);
  const detail = leaderboard.slice(detailStart, detailEnd);

  assert.match(leaderboard, /const detail = resolveSelectedLeaderboardEntry\(entries, selectedDetail\)/);
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
  assert.match(detail, /holding\.marketValue == null \? 'Value unavailable' : money\(holding\.marketValue\)/);
  assert.match(detail, /formatEventHoldingSide\(holding\.side\)/);
  assert.match(detail, /SERVER-VALUED/);
  assert.match(detail, /STALE SCORE/);
  assert.match(leaderboard, /The current server score is unavailable; showing the last saved score/);
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
  const mainContentWidth = leaderboard.indexOf("maxWidth: 1000");
  const mainScrollStart = leaderboard.lastIndexOf("<ScrollView", mainContentWidth);
  const mainScrollEnd = leaderboard.indexOf("</ScrollView>", mainScrollStart);
  const mainScroll = leaderboard.slice(mainScrollStart, mainScrollEnd);
  const eventContentStart = eventArena.indexOf("{section === 'leaderboard' && (");
  const eventContentEnd = eventArena.indexOf("{section === 'trades'", eventContentStart);

  assert.ok(mainScrollStart >= 0 && mainScrollEnd > mainScrollStart);
  assert.doesNotMatch(mainScroll, /renderLeaderboardHeader\(\)/);
  assert.match(mainScroll, /showsVerticalScrollIndicator=\{false\}/);
  assert.doesNotMatch(mainScroll, /scrollEnabled=\{false\}/);
  const detailContentWidth = leaderboard.indexOf("maxWidth: 820");
  const detailScrollStart = leaderboard.lastIndexOf("<ScrollView", detailContentWidth);
  const detailScrollEnd = leaderboard.indexOf("</ScrollView>", detailScrollStart);
  assert.match(leaderboard.slice(detailScrollStart, detailScrollEnd), /showsVerticalScrollIndicator=\{false\}/);
  assert.match(mainScroll, /testID="paper-event-leaderboard-podium"/);
  assert.match(mainScroll, /testID="paper-event-leaderboard-current-user"/);
  assert.doesNotMatch(mainScroll, /paper-event-rank-history/);
  const podiumHeadingStart = leaderboard.indexOf('testID="paper-event-leaderboard-podium"');
  const podiumHeadingEnd = leaderboard.indexOf('<Animated.View', podiumHeadingStart);
  const podiumHeading = leaderboard.slice(podiumHeadingStart, podiumHeadingEnd);
  assert.match(podiumHeading, /flexWrap: 'wrap'/);
  assert.match(podiumHeading, /justifyContent: 'center'/);
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
  assert.match(shareCard, /backgroundColor: isBearMarketMayhem \? 'rgba\(28,8,13,0\.82\)' : 'rgba\(7,12,20,0\.62\)'/);
  assert.match(shareCard, /PaperChallengeMilestoneBadges milestones=\{milestones\}/);
  assert.match(shareCard, /event\.finalRank != null && Number\.isInteger\(event\.finalRank\) && event\.finalRank > 0/);
  assert.match(shareCard, /FINAL RANK/);
  assert.match(shareCard, /accessibilityLabel=\{isBearMarketMayhem && event\.finalRank === 1/);
  assert.match(shareCard, /testID=\{`paper-event-share-rank-\$\{event\.eventId\}`\}/);
  assert.match(shareCard, /flexWrap: 'wrap'/);
  assert.match(shareCard, /borderColor: isBearMarketMayhem \? 'rgba\(240,82,93,0\.62\)' : 'rgba\(255,218,128,0\.5\)'/);
  assert.match(shareCard, /backgroundColor: isBearMarketMayhem \? 'rgba\(240,82,93,0\.14\)' : 'rgba\(255,218,128,0\.12\)'/);
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
  assert.match(screen, /orders\s*\.filter\(o => o\.accountId === activeId\)/);
  assert.match(screen, /getCoveredAccountValueHistory\(\s*currentAccountSnapshots,\s*account\.id,\s*range\.ms/);
  assert.match(screen, /mergeAccountValueHistory\(tradeHistory, currentAccountSnapshots, account\.id\)/);
  assert.match(screen, /PAPER_VALUE_SNAPSHOT_INTERVAL_MS = 60 \* 60_000/);
  assert.match(screen, /PAPER_VALUE_SNAPSHOT_KEY/);
  assert.match(screen, /testID=\{isEventAcct \? 'active-paper-event-account'/);
  assert.match(screen, /\{ id: 'history',\s+label: 'Trade History'/);
  assert.match(paperLayout, /testID=\{`paper-tab-\$\{tab\.id\}`\}/);
  assert.doesNotMatch(screen, /historyAgeMs >= range\.ms/);
  assert.match(orderEntry, /testID="order-sheet-active-account"/);
  assert.match(orderEntry, /SETTLED B\.P\./);
  assert.match(orderReview, /CAPTURED ACCOUNT/);
});

test("account switching saves the selection without queuing a general Event Arena snapshot", () => {
  const pushStart = screen.indexOf("const pushEventArenaSnapshot = useCallback(");
  const pushEnd = screen.indexOf("pushEventArenaSnapshotRef.current = pushEventArenaSnapshot;", pushStart);
  const flushStart = screen.indexOf("const flushCache = useCallback(");
  const flushEnd = screen.indexOf("\n  }, [apiFetch, pushEventArenaSnapshot]);", flushStart);
  const switchStart = screen.indexOf("const switchAccount = async (id: string) => {");
  const switchEnd = screen.indexOf("\n  };\n\n  const handledChallengeRouteRef", switchStart);
  const pushEventArenaSnapshot = screen.slice(pushStart, pushEnd);
  const flushCache = screen.slice(flushStart, flushEnd);
  const switchAccount = screen.slice(switchStart, switchEnd);

  assert.ok(pushStart >= 0 && pushEnd > pushStart);
  assert.ok(flushStart >= 0 && flushEnd > flushStart);
  assert.ok(switchStart >= 0 && switchEnd > switchStart);
  assert.match(pushEventArenaSnapshot, /if \(!eventArenaDeviceSyncEnabledRef\.current\) return Promise\.resolve\(\)/);
  assert.match(flushCache, /options\.syncGeneralDeviceSnapshot !== false/);
  assert.match(flushCache, /if \(syncGeneralDeviceSnapshot && eventArenaDeviceSyncEnabledRef\.current\)/);
  assert.match(flushCache, /if \(syncGeneralDeviceSnapshot\) \{\s*await pushEventArenaSnapshot/);
  assert.match(flushCache, /await writePaperCache\(\{ accounts: accts, positions: pos, transactions: txns, orders: ords, lots: ls, activeId: aid \}\)/);
  assert.match(flushCache, /enrollmentAccountId: enrollment\.accountId,\s*selectedAccountId: aid/);
  assert.match(flushCache, /positions: pos\.filter\(\(item\) => item\.accountId === enrollment\.accountId\)/);
  assert.match(flushCache, /transactions: txns\.filter\(\(item\) => item\.accountId === enrollment\.accountId\)/);
  assert.match(flushCache, /orders: ords\.filter\(\(item\) => item\.accountId === enrollment\.accountId\)/);
  assert.match(switchAccount, /await flushCache\([\s\S]*\{\s*syncGeneralDeviceSnapshot: false\s*\},\s*\)/);
  assert.doesNotMatch(switchAccount, /pushEventArenaSnapshot/);
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
  assert.match(paperLayout, /paper-tab-group-\$\{group\.id\}/);
  assert.match(paperLayout, /activeGroupTabs\.map\(\(tab\)/);
  assert.match(screen, /\{ id: 'overview',\s+label: 'Overview'/);
  assert.match(screen, /\{ id: 'positions',\s+label: 'Positions'/);
  assert.match(screen, /tabs: \['overview', 'positions'\]/);
  assert.match(paperLayout, /testID="paper-trading-buy-action"/);
  assert.doesNotMatch(screen, /position: 'absolute',\s*right: 20,\s*bottom: 108/);
  assert.match(screen, /contentContainerStyle=\{\{ paddingBottom: 24, paddingTop: 10 \}\}/);
  assert.match(screen, /<PaperTradingAction[\s\S]*?onPress=\{openBuyModal\}/);
  assert.doesNotMatch(overview, /INVESTED VALUE|AVAILABLE CASH|OPEN POSITIONS|TOTAL RETURN/);
  assert.doesNotMatch(positions, /contentSectionHeader|contentSectionTitle|sectionCount/);
  assert.match(positions, /No open positions/);
  assert.match(positions, /Tap Buy to place your first paper trade/);
  assert.doesNotMatch(screen, /paper-portfolio-overview-metrics/);
  assert.match(paperLayout, /BUYING POWER/);
  assert.match(paperLayout, /testID="paper-account-total-return"[\s\S]*?\{totalReturnText\}/);
  assert.match(screen, /buyingPower=\{account\?\.cash \?\? 0\}/);
  assert.match(screen, /const totalReturn = \(\(portfolioValue - activeAccountStartingBalance\) \/ activeAccountStartingBalance\) \* 100/);
  assert.match(screen, /const portfolioValue = account \? computePaperEquity\(account, myPositions, quotes\) : 0/);
  assert.match(paperLayout, /heroStats:[\s\S]*?flexDirection: 'row'[\s\S]*?gap: 6/);
  assert.match(paperLayout, /const \{ width, fontScale \} = useWindowDimensions\(\)/);
  assert.match(paperLayout, /const compactStats = fontScale >= 1\.3/);
  assert.match(paperLayout, /heroStatsCompact: \{[\s\S]*?flexDirection: 'column'[\s\S]*?gap: 2/);
  for (const metric of ["paper-account-today-pnl", "paper-account-total-return", "paper-account-buying-power"]) {
    assert.match(paperLayout, new RegExp(`testID="${metric}"`));
  }
  assert.match(paperLayout, /allowFontScaling style=\{styles\.buyActionTitle\}/);
  assert.match(paperLayout, /allowFontScaling style=\{styles\.buyActionHint\}/);
  assert.match(screen, /const renderOverview = \(\) => \{[\s\S]*?ACCOUNT PERFORMANCE/);
  assert.match(paperLayout, /testID="paper-account-total-return"[\s\S]*?adjustsFontSizeToFit/);
  assert.match(paperLayout, /testID="paper-account-buying-power"[\s\S]*?adjustsFontSizeToFit/);
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
  assert.match(paperLayout, /posMktVal/);
  assert.match(paperLayout, /posMetaRow/);
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
  const portfolioTabsStart = paperLayout.indexOf("export function PaperPortfolioNavigation");
  const portfolioTabsEnd = paperLayout.indexOf("export function PaperPositionRow", portfolioTabsStart);
  const portfolioTabs = paperLayout.slice(portfolioTabsStart, portfolioTabsEnd);
  const positionsStart = screen.indexOf("const renderPositions = () => {");
  const positionsEnd = screen.indexOf("const renderOverview = () => {", positionsStart);
  const positions = screen.slice(positionsStart, positionsEnd);

  assert.ok(portfolioTabsStart >= 0 && portfolioTabsEnd > portfolioTabsStart);
  assert.match(portfolioTabs, /<View style=\{\[styles\.subTabBar, styles\.portfolioSubTabBar\]\} accessibilityRole="tablist">/);
  assert.match(portfolioTabs, /testID=\{`paper-tab-\$\{tab\.id\}`\}/);
  assert.match(portfolioTabs, /accessibilityRole="tab"/);
  assert.match(portfolioTabs, /accessibilityState=\{\{ selected \}\}/);
  assert.match(portfolioTabs, /accessibilityLabel=\{tab\.id === 'positions' \? `Positions, \$\{positionsCount\} open` : tab\.label\}/);
  assert.match(portfolioTabs, /tab\.id === 'positions' && selected && \([\s\S]*?testID="paper-positions-count"[\s\S]*?\{positionsCount\}/);
  assert.match(portfolioTabs, /selected && \(tab\.id === 'positions' \? styles\.positionsTabLabelActive : styles\.tabLabelActive\)/);
  assert.match(positions, /No open positions/);
  assert.match(screen, /positions\.filter\(p => p\.accountId === activeId\)/);
  assert.match(paperLayout, /portfolioSubTabBar: \{ flexDirection: 'row' as const, alignItems: 'stretch' as const \}/);
  assert.match(paperLayout, /portfolioTabBtn: \{[\s\S]*?flex: 1,[\s\S]*?minWidth: 0/);
  assert.match(paperLayout, /positionsTabLabelActive: \{ color: '#fff' \}/);
  assert.match(paperLayout, /allowFontScaling\s+style=\{styles\.sectionCount\}/);
});

test("Portfolio navigation uses a smaller footprint while keeping usable touch targets", () => {
  assert.match(paperLayout, /primaryTab: \{[\s\S]*?minHeight: 40,[\s\S]*?justifyContent: 'center' as const/);
  assert.match(paperLayout, /portfolioTabBtn: \{[\s\S]*?minWidth: 0/);
  assert.match(paperLayout, /subTabBar: \{ paddingHorizontal: 16, paddingTop: 4, paddingBottom: 6, gap: 6 \}/);
  assert.match(paperLayout, /minHeight: 34,[\s\S]*?paddingVertical: 5/);
  assert.match(paperLayout, /hitSlop=\{\{ top: 3, bottom: 3 \}\}/);
});

test("paper dashboard switches accounts from the summary or selector and keeps account management", () => {
  assert.match(screen, /testID="paper-account-hero"/);
  assert.match(paperLayout, /testID="paper-account-switch"/);
  assert.match(paperLayout, /accessibilityLabel="Switch paper trading account"/);
  assert.match(paperLayout, />SWITCH</);
  assert.match(screen, /onSwitchAccount=\{\(\) => setShowAccountManagement\(true\)\}/);
  assert.match(screen, /<PaperAccountSwipeArea[\s\S]*?accounts=\{visibleAccounts\}[\s\S]*?activeId=\{activeId\}/);
  assert.match(accountSwipeArea, /Math\.abs\(gesture\.dx\) > 12 && Math\.abs\(gesture\.dx\) > Math\.abs\(gesture\.dy\) \* 1\.2/);
  assert.match(accountSwipeArea, /getAdjacentPaperAccountId\(current\.accounts, current\.activeId, gesture\.dx < 0 \? 1 : -1\)/);
  assert.match(accountSwipeArea, /Math\.abs\(gesture\.dx\) < 40/);
  assert.match(accountSwipeArea, /Math\.abs\(gesture\.dx\) <= Math\.abs\(gesture\.dy\) \* 1\.2/);
  assert.match(accountSwipeArea, /Platform\.OS !== 'web'[\s\S]*?Haptics\.impactAsync\(Haptics\.ImpactFeedbackStyle\.Light\)\.catch/);
  assert.match(screen, /testID="paper-account-position-indicator"/);
  assert.match(screen, /testID=\{`paper-account-indicator-\$\{index\}`\}/);
  assert.match(paperLayout, /heroAccountName/);
  assert.match(paperLayout, /heroEquity/);
  assert.match(paperLayout, /TODAY’S P\/L/);
  assert.match(paperLayout, /BUYING POWER/);
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
  assert.match(screen, /onSwitchToPaperEventAccount=\{\(\) => \{[\s\S]*?const eventAccount = visibleAccounts\.find/);
  assert.doesNotMatch(screen, /paper-account-choice-/);
  assert.match(screen, /Math\.max\(insets\.bottom, 22\)/);
  assert.match(screen, /testID=\{`rename-paper-account-\$\{acct\.id\}`\}/);
  assert.match(screen, /testID=\{`rename-paper-account-input-\$\{acct\.id\}`\}/);
  assert.match(screen, /testID=\{`reset-paper-account-\$\{acct\.id\}`\}/);
  assert.match(screen, /const isArchivedEventAccount = isEventAcct\s*&& paperChallenge\.history\.some\(\(event\) => event\.accountId === acct\.id\);/);
  assert.match(screen, /const isEventAcctResetLocked = isArchivedEventAccount \|\| \(isEventAcct/);
  assert.match(screen, /COMPLETED EVENT · READ-ONLY RESULTS/);
  assert.match(screen, /Completed championship accounts are read-only/);
  assert.match(screen, /visibleEventAccountIds = new Set\(\[/);
  assert.match(screen, /accessibilityState=\{\{ disabled: isEventAcctResetLocked \}\}/);
  assert.match(screen, /disabled=\{isEventAcctResetLocked\}/);
  assert.match(screen, /Reset unavailable until the active event ends/);
  assert.match(screen, /ACTIVE EVENT · RESET LOCKED UNTIL EVENT ENDS/);
  assert.match(screen, /getPaperChallengeEnrollmentForAccount\(paperChallengeRef\.current, id\)/);
  assert.match(screen, /getPaperChallengeEnrollmentForAccount\(\s*paperChallengeRef\.current,\s*order\.accountId,?\s*\)/);
  assert.match(screen, /const activeChallengeEnrollment = challengeEnrollments\.find/);
  assert.match(screen, /onSubmitEditing=\{\(\) => \{ void renameAccount\(acct\.id, renameDraft\); setRenameId\(''\); \}\}/);
  assert.match(screen, /onBlur=\{\(\) => \{ void renameAccount\(acct\.id, renameDraft\); setRenameId\(''\); \}\}/);
  assert.match(screen, /Alert\.alert\(\s*'Reset Account',\s*`Reset "\$\{acct\.name\}" to \$100,000\? All positions and trade history will be lost\.`/);
  assert.match(screen, /\{ text: 'Cancel', style: 'cancel' \}/);
  assert.match(screen, /onPress: \(\) => \{ void resetAccount\(acct\.id\); \}/);
  assert.match(screen, /resetPaperAccountData\(\{/);
  assert.match(paperLayout, /testID=\{`paper-tab-group-\$\{group\.id\}`\}/);
  assert.match(screen, /id: 'portfolio', label: 'Portfolio'/);
  assert.match(screen, /id: 'activity', label: 'Activity'/);
  assert.match(screen, /id: 'insights', label: 'Insights'/);
  assert.match(screen, /<PaperTradingAction[\s\S]*?Trade[\s\S]*?onPress=\{openBuyModal\}/);
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
  assert.match(paperLayout, /shares\.toLocaleString\('en-US'\)\} sh ·/);
  assert.match(paperLayout, /isShort \? 'Entry' : 'Avg\.'/);
  assert.match(paperLayout, /isShort \? 'LIABILITY' : 'MARKET VALUE'/);
  assert.match(paperLayout, /MARKET VALUE/);
  assert.match(paperLayout, /paperLayoutPercent\(pnlPercent\)/);
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
  assert.match(screen, /selectedEventDateRange \? ` · \$\{selectedEventDateRange\}` : ''/);
  assert.match(eventAccountDashboard, /entries\.length === 1 \? 'participant' : 'participants'/);
  assert.match(eventAccountDashboard, /COMP P\/L/);
  assert.match(eventAccountDashboard, /'RETURN'/);
  assert.match(eventAccountDashboard, /BUYING POWER/);
  assert.match(eventAccountDashboard, /formatPaperEventCountdown\(startAtMs, endAtMs, now\)/);
  assert.match(eventAccountDashboard, /accessibilityLabel="View Event Arena leaderboard"/);
  assert.doesNotMatch(eventAccountDashboard, /TODAY’S P\/L/);
  assert.match(eventAccountDashboard, /flexDirection: 'row', flexWrap: 'wrap', gap: 5, marginTop: 4/);
  assert.match(eventAccountDashboard, /flexBasis: compactMetrics \? '46%' : '22%'/);
  assert.match(eventAccountDashboard, /width: 32,[\s\S]*?height: 32,[\s\S]*?flexShrink: 0/);
  assert.match(eventAccountDashboard, /hitSlop=\{8\}/);
  assert.match(eventAccountDashboard, /accessibilityRole="button"[\s\S]*?accessibilityLabel="View Event Arena leaderboard"[\s\S]*?onPress=\{onPress\}/);
  assert.match(eventAccountDashboard, /accessibilityRole="progressbar"[\s\S]*?height: 3[\s\S]*?testID="paper-event-account-progress"/);
  assert.match(eventAccountDashboard, /const compactMetrics = fontScale >= 1\.3/);
  assert.match(eventAccountDashboard, /<LeaderboardButton onPress=\{onViewLeaderboard\} \/>/);
  assert.match(eventAccountDashboard, /minWidth: 0/);
  assert.match(screen, /eventChampionshipSwitchButton: \{ minHeight: 40/);
  assert.match(screen, /screenWidth <= 360 && styles\.compactAccountHero/);
  const eventHeroStyle = screen.slice(screen.indexOf('  eventChampionshipHero: {'), screen.indexOf('  eventChampionshipTopline: {'));
  assert.doesNotMatch(eventHeroStyle, /padding/);
});

test("regular opted-in Event Arena results save and backfill their leaderboard rank", () => {
  const finalizationStart = screen.indexOf("let finalRank: number | undefined;");
  const finalizationEnd = screen.indexOf("const eventEquityHistory", finalizationStart);
  const finalization = screen.slice(finalizationStart, finalizationEnd);
  assert.ok(finalizationStart >= 0 && finalizationEnd > finalizationStart);
  assert.match(finalization, /if \(enrollment\.leaderboardOptedIn\)/);
  assert.match(finalization, /getEventArenaLeaderboard\(enrollment\.eventId/);
  assert.match(finalization, /getCurrentUserEventArenaRank\(leaderboard\.entries\)/);
  assert.doesNotMatch(finalization, /eventType === 'lightning-round' && enrollment\.leaderboardOptedIn/);
  assert.match(eventArena, /selectedPastEvent\?\.leaderboardOptedIn/);
  assert.match(eventArena, /getEventArenaLeaderboard\(event\.eventId/);
  assert.match(eventArena, /updatePaperChallengeArchiveRank\(current, event\.eventId, finalRank\)/);
});

test("position and order cards are compact without removing their essential values or actions", () => {
  const positionCardStyleStart = paperLayout.indexOf("  posCard: {");
  const positionCardStyleEnd = paperLayout.indexOf("\n  posCardExpanded:", positionCardStyleStart);
  const positionCardStyle = paperLayout.slice(positionCardStyleStart, positionCardStyleEnd);
  assert.ok(positionCardStyleStart >= 0 && positionCardStyleEnd > positionCardStyleStart);
  assert.match(positionCardStyle, /minHeight: 64,[\s\S]*?paddingVertical: 3[\s\S]*?paddingHorizontal: 9/);
  assert.doesNotMatch(positionCardStyle, /\bheight:/);
  assert.match(paperLayout, /posContent: \{ flex: 1, minWidth: 0, gap: 2, justifyContent: 'center' as const \}/);
  assert.match(paperLayout, /posMetaRow: \{[\s\S]*?minWidth: 0,[\s\S]*?paddingTop: 2/);
  assert.match(paperLayout, /styles\.posTopRow[\s\S]*?styles\.posSymbol[\s\S]*?styles\.posName[\s\S]*?styles\.posMktLabel[\s\S]*?styles\.posMktVal/);
  assert.match(paperLayout, /styles\.posMetaRow[\s\S]*?styles\.posMeta[\s\S]*?styles\.posPnl/);
  assert.match(paperLayout, /positionValue: \{ flex: 0\.92, minWidth: 0/);
  assert.doesNotMatch(paperLayout, /positionValue: \{ width:/);
  assert.match(paperLayout, /style=\{\[styles\.posSymbol,[\s\S]*?numberOfLines=\{1\}[\s\S]*?ellipsizeMode="tail"[\s\S]*?adjustsFontSizeToFit[\s\S]*?allowFontScaling/);
  assert.match(paperLayout, /style=\{styles\.posName\}[\s\S]*?numberOfLines=\{1\}[\s\S]*?ellipsizeMode="tail"[\s\S]*?allowFontScaling[\s\S]*?\{companyName\}/);
  assert.match(paperLayout, /posName: \{[\s\S]*?flexShrink: 1/);
  assert.match(paperLayout, /style=\{\[styles\.posMktVal,[\s\S]*?numberOfLines=\{1\}[\s\S]*?adjustsFontSizeToFit[\s\S]*?minimumFontScale=\{0\.4\}[\s\S]*?allowFontScaling/);
  assert.match(paperLayout, /style=\{\[[\s\S]*?styles\.posPnl,[\s\S]*?numberOfLines=\{pnlLines\.length\}[\s\S]*?adjustsFontSizeToFit[\s\S]*?minimumFontScale=\{0\.4\}[\s\S]*?allowFontScaling/);
  assert.match(paperLayout, /style=\{\[styles\.posMeta,[\s\S]*?numberOfLines=\{1\}[\s\S]*?adjustsFontSizeToFit[\s\S]*?minimumFontScale=\{0\.4\}[\s\S]*?allowFontScaling/);
  assert.match(paperLayout, /fitOneLineFontSize\(marketValueText, valueColumnWidth, 16\)/);
  assert.match(paperLayout, /fitOneLineFontSize\(pnlLines\.reduce\(/);
  assert.match(screen, /orderCard:[\s\S]*?padding: 11/);
  assert.match(screen, /gap: 4, paddingHorizontal: 16/);
  assert.match(screen, /gap: 10, paddingHorizontal: 16/);
  assert.match(paperLayout, /testID=\{`paper-position-\$\{id\}`\}/);
  assert.match(screen, /myPositions\.map\(\(pos, i\)/);
  assert.match(screen, /const pnl = pos\.shares \* \(isShortPosition\(pos\) \? pos\.avgCost - price : price - pos\.avgCost\)/);
  assert.match(screen, /const pnlPct = pos\.avgCost > 0 \? \(pnl \/ \(pos\.shares \* pos\.avgCost\)\) \* 100 : 0/);
  assert.match(screen, /const mktVal = pos\.shares \* price/);
  assert.match(screen, /marketValue=\{mktVal\}/);
  assert.match(paperLayout, /valueColor\(pnl\)/);
  assert.match(paperLayout, /const pnlAmountText = `\$\{pnl >= 0 \? '\+' : ''\}\$\{paperLayoutCurrency\(pnl\)\}`/);
  assert.match(paperLayout, /const pnlPercentText = `\(\$\{paperLayoutPercent\(pnlPercent\)\}\)`/);
  assert.match(paperLayout, /shares\.toLocaleString\('en-US'\)\} sh ·/);
  assert.match(paperLayout, /isShort \? 'Entry' : 'Avg\.'/);
  assert.match(paperLayout, /isShort \? 'LIABILITY' : 'MARKET VALUE'/);
  assert.match(paperLayout, /MARKET VALUE/);
  assert.match(paperLayout, /paperLayoutPercent\(pnlPercent\)/);
  assert.match(screen, /const price = q\?\.price \?\? pos\.avgCost/);
  const positionsScrollIndex = screen.indexOf("contentContainerStyle={{ paddingBottom: 24, paddingTop: 10 }}");
  const tradeButtonIndex = screen.indexOf("<PaperTradingAction", positionsScrollIndex);
  const bottomTabsIndex = screen.indexOf("<BottomTabBar />", tradeButtonIndex);
  assert.ok(positionsScrollIndex >= 0 && positionsScrollIndex < tradeButtonIndex && tradeButtonIndex < bottomTabsIndex);
  assert.match(screen, /testID=\{`paper-order-\$\{o\.id\}`\}/);
  assert.match(screen, /o\.status\.toUpperCase\(\)/);
  assert.match(screen, /testID=\{`edit-order-\$\{o\.id\}`\}/);
  assert.doesNotMatch(screen, /!isMarketOpenPending\s*&&\s*\(/);
  assert.match(screen, /testID=\{`delete-order-\$\{o\.id\}`\}/);
  assert.match(screen, /o\.status === 'pending'/);
  assert.match(screen, /\(o\.orderType === 'limit' \|\| o\.orderType === 'stop_limit'\) && o\.limitPrice != null/);
  assert.match(screen, /\(o\.orderType === 'stop' \|\| o\.orderType === 'stop_limit'\) && o\.stopPrice != null/);
  assert.match(screen, /o\.orderType === 'trailing_stop' && o\.trailPct != null/);
  assert.match(screen, /o\.orderType === 'trailing_stop' && o\.trailAbs != null/);
  assert.match(paperLayout, /posIdentity: \{ flex: 1, minWidth: 0, paddingRight: 4 \}/);
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
  assert.match(screen, /orders\s*\.filter\(o => o\.accountId === activeId/);
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

test("Mountain Championship blocks send and receive actions with an accessible lock notice", () => {
  assert.match(challenge, /eventType: 'mountain-championship'/);
  assert.match(challenge, /getRegularEventPreparationStartAtMs\(eventId\)/);
  assert.match(leaderboard, /cashTransfersLocked/);
  assert.match(leaderboard, /if \(isTransferLocked\) \{\s*setTransferLockNoticeOpen\(true\)/);
  assert.match(leaderboard, /disabled=\{isTransferLocked \|\| cashTransferBusy/);
  assert.match(eventArena, /isMountainChampionshipTransferLocked\([\s\S]*?currentWindow\.eventType/);
  assert.match(eventArena, /isCurrentEvent && isMountainChampionshipTransferLocked/);
  assert.match(eventArena, /setCashTransferLockNoticeOpen\(true\);\s*return;\s*}\s*setCashHistoryEventId\(eventId\)/);
  assert.match(eventArena, /<EventArenaTransferLockNotice/);
  assert.match(eventArenaOverview, /mountainTransferLockActive/);
  assert.match(challenge, /MOUNTAIN_CHAMPIONSHIP_TRANSFER_LOCK_TITLE = 'COMPETITION ACCOUNT LOCKED'/);
  assert.match(challenge, /Cash transfers are disabled during the Mountain Championship preparation period and competition\./);
  assert.match(eventArenaTransferLockNotice, /MOUNTAIN_CHAMPIONSHIP_TRANSFER_LOCK_TITLE/);
  assert.match(eventArenaTransferLockNotice, /name="award"/);
  assert.match(eventArenaTransferLockNotice, /name="lock"/);
  assert.match(eventArenaTransferLockNotice, />OK</);
});

test("Event Arena competition keeps its visual summary and reminders inside the scroll area", () => {
  assert.match(eventArenaOverview, /<ScrollView[\s\S]*?testID="event-arena-overview"[\s\S]*?<\/ScrollView>/);
  assert.match(eventArenaOverview, /<EventArenaReminderControls \/>/);
  assert.match(eventArenaReminderControls, /testID="paper-event-notifications-toggle"/);
  assert.match(eventArenaReminderControls, /marginTop: compact \? 0 : 12/);
  assert.match(eventArenaReminderControls, /trackColor=\{\{ false: colors\.mutedForeground, true: colors\.primary \}\}/);
  assert.match(eventArenaReminderControls, /thumbColor=\{reminders\.enabled \? colors\.primaryForeground : colors\.foreground\}/);
  assert.match(eventArenaReminderControls, /scaleX: 1\.15[\s\S]*?scaleY: 1\.15/);
  assert.match(eventArenaReminderControls, /ios_backgroundColor=\{colors\.mutedForeground\}/);
  assert.doesNotMatch(eventArenaReminderControls, /Saved preference:|Device permission:|On-device reminders:|Remote push:/);
  assert.match(eventArenaReminderControls, /reminders\.setEnabled\(enabled\)/);
  assert.match(eventArenaReminderControls, /reminders\.permission === 'settings-required'[\s\S]*?reminders\.openSettings\(\)/);
  assert.match(eventArenaReminderControls, /Turn notifications on in the mobile app\./);
  assert.match(eventArenaReminderControls, /event-arena-reminder-error/);
  assert.match(eventArenaReminderControls, /event-arena-reminder-retry/);
  assert.match(events, /<EventArenaReminderControls compact \/>/);
  assert.match(mobileRootLayout, /<EventArenaRemindersProvider>/);
  assert.match(eventArenaReminders, /getGetEventArenaReminderPreferenceQueryOptions/);
  assert.match(eventArenaReminders, /if \(!state\.loaded \|\| mutationPromise \|\| state\.busy\) return/);
  assert.doesNotMatch(eventArenaReminderControls, /disabled:[^\n]*preferenceError|disabled=\{[^\n]*preferenceError/);
  assert.match(eventArenaReminders, /Could not refresh Event Arena reminders: \$\{errorText\(error\)\}/);
  const enableStart = eventArenaReminders.indexOf('export async function setEventArenaRemindersEnabled');
  const scheduleBeforeSave = eventArenaReminders.indexOf('const schedule = await replaceLocalSchedule()', enableStart);
  const localSave = eventArenaReminders.indexOf('await saveEventArenaReminderPreference', enableStart);
  assert.ok(enableStart >= 0 && scheduleBeforeSave > enableStart && scheduleBeforeSave < localSave);
  assert.match(eventArenaReminders, /if \(local\.needsSync\)[\s\S]*?saveEventArenaReminderPreference/);
  assert.match(eventArenaReminders, /buildEventArenaNotificationRequest\(reminder, Platform\.OS === 'android'\)/);

  for (const label of [
    "STARTING BALANCE",
    "AVAILABLE CASH",
    "BUYING POWER",
    "NET P/L",
    "EVENT RANK",
    "COMPLETED TRADES",
  ]) {
    assert.ok(eventArenaOverview.includes(`label="${label}"`), `missing ${label} metric`);
  }
  assert.match(eventArenaOverview, /label="AVAILABLE CASH" value=\{money\(performance\?\.account\?\.cash\)\}/);
  assert.match(eventArenaOverview, /label="BUYING POWER" value=\{money\(performance\?\.buyingPower\)\}/);
  assert.match(eventArenaOverview, /ISOLATED/);
  assert.match(eventArenaOverview, /height=\{232\}/);
  assert.match(eventArenaOverview, /countdown\.days[\s\S]*?label: 'DAYS'[\s\S]*?label: 'HOURS'[\s\S]*?label: 'MINUTES'[\s\S]*?label: 'SECONDS'/);
});

test("Event Arena phase indicator pulses only while active and respects reduced motion", () => {
  assert.match(eventArenaOverview, /import \{ useReduceMotion \} from '@\/hooks\/useReduceMotion'/);
  assert.match(eventArenaOverview, /const reduceMotion = useReduceMotion\(\)/);
  assert.match(eventArenaOverview, /const shouldAnimateStatus = livePhase === 'active' && !reduceMotion/);
  assert.match(eventArenaOverview, /if \(!shouldAnimateStatus\) return/);
  assert.match(eventArenaOverview, /Animated\.loop\([\s\S]*?duration: 1_600[\s\S]*?duration: 1_600/);
  assert.match(eventArenaOverview, /useNativeDriver: Platform\.OS !== 'web'/);

  const phaseIndicatorStart = eventArenaOverview.indexOf('testID="event-arena-phase-dot"');
  const phaseIndicatorEnd = eventArenaOverview.indexOf('testID="event-arena-phase-label"', phaseIndicatorStart);
  assert.ok(phaseIndicatorStart >= 0 && phaseIndicatorEnd > phaseIndicatorStart);
  const phaseDot = eventArenaOverview.slice(phaseIndicatorStart, phaseIndicatorEnd);
  const phaseLabelEnd = eventArenaOverview.indexOf('</Animated.Text>', phaseIndicatorEnd);
  assert.ok(phaseLabelEnd > phaseIndicatorEnd);
  const phaseLabel = eventArenaOverview.slice(phaseIndicatorEnd, phaseLabelEnd);
  assert.match(phaseDot, /shouldAnimateStatus && \{/);
  assert.match(phaseLabel, /shouldAnimateStatus && \{/);
  assert.match(phaseDot, /livePhase === 'active' \? '#4da987' : accent/);
  assert.match(phaseDot, /statusPulse\.interpolate/);
  assert.match(phaseLabel, /statusPulse\.interpolate/);
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

test("all seven live Event Arena artworks keep podium names and values readable", () => {
  const artworks = [
    ["stadium", "event-arena-stadium.jpg"],
    ["neon-nightclub", "event-arena-neon-nightclub.jpg"],
    ["mountain-summit", "event-arena-mountain-summit.jpg"],
    ["red-showdown", "event-arena-red-showdown.jpg"],
    ["green-stock-exchange", "event-arena-green-stock-exchange.jpg"],
    ["penny-stock-mayhem", "event-arena-penny-stock-mayhem-clean.jpg"],
    ["one-stock-challenge", "event-arena-one-stock-challenge.png"],
  ];
  assert.equal((eventArenaArtworkCatalog.match(/require\('\.\.\/assets\/event-arena-[^']+\.jpg'\)/g) ?? []).length, 6);

  assert.match(leaderboard, /:\s*EVENT_ARENA_ARTWORK_SOURCES\[event\.artworkId \?\? LEGACY_PAPER_CHALLENGE_ARTWORK_ID\]/);
  assert.match(leaderboard, /resizeMode="cover"/);
  assert.match(leaderboard, /event-arena-leaderboard-artwork-\$\{event\.id\}/);
  const artworkMarker = leaderboard.indexOf("testID={isOneStockChallenge ? 'paper-event-one-stock-hero-art'");
  const artworkStart = leaderboard.indexOf("<ImageBackground", artworkMarker);
  const artworkEnd = leaderboard.indexOf("</ImageBackground>", artworkStart);
  const artworkContainer = leaderboard.slice(artworkStart, artworkEnd);
  assert.ok(artworkStart >= 0 && artworkEnd > artworkStart);
  assert.match(leaderboard.slice(artworkMarker - 100, artworkStart), /testID=\{isOneStockChallenge \? 'paper-event-one-stock-hero-art'/);
  assert.match(artworkContainer, /source=\{isPennyStockMayhem[\s\S]*?isOneStockChallenge[\s\S]*?EVENT_ARENA_ARTWORK_SOURCES\['one-stock-challenge'\]/);
  assert.match(artworkContainer, /backgroundColor: isPennyStockMayhem \? '#07110D' : isOneStockChallenge \? '#07111E' : '#101720'/);
  assert.match(artworkContainer, /isOneStockChallenge \? 'rgba\(216,180,90,0\.5\)'/);
  assert.match(artworkContainer, /imageStyle=\{\{ borderRadius: 24, opacity: isPennyStockMayhem \? 0 : isOneStockChallenge \? 1 : 0\.96 \}\}/);
  assert.match(artworkContainer, /backgroundColor: isPennyStockMayhem \? 'transparent' : isOneStockChallenge \? 'rgba\(4,10,20,0\.08\)' : 'rgba\(7,12,20,0\.18\)'/);
  assert.match(artworkContainer, /'rgba\(3,12,25,0\.72\)', 'rgba\(4,14,28,0\.34\)', 'rgba\(3,9,19,0\.86\)'/);
  assert.match(artworkContainer, /start=\{isOneStockChallenge \? \{ x: 0\.5, y: 0 \} : \{ x: 0, y: 0 \}\}/);
  assert.match(artworkContainer, /<LinearGradient/);
  assert.match(artworkContainer, /testID="paper-event-penny-stock-hero"/);
  assert.match(artworkContainer, /testID="paper-event-penny-stock-art"/);
  assert.match(artworkContainer, /THE ONE-STOCK CHALLENGE/);
  assert.match(artworkContainer, /color: isBearMarketMayhem \? '#FF6670' : '#E8CB7C'/);
  assert.match(artworkContainer, /<PennyMayhemTitle[\s\S]*?<PennyMayhemNameplate/);
  assert.match(artworkContainer, /One participant\. One stock\. One winning position\./);
  assert.match(artworkContainer, /!isPennyStockMayhem && !isOneStockChallenge/);
  assert.ok(
    artworkContainer.indexOf('testID="paper-event-championship-identity"')
      < artworkContainer.indexOf('testID="paper-event-one-stock-description"')
      && artworkContainer.indexOf('testID="paper-event-one-stock-description"')
        < artworkContainer.indexOf('testID="paper-event-starting-capital"'),
    "the One-Stock title, description, and capital remain in order over the full-card image",
  );
  assert.doesNotMatch(artworkContainer, /aspectRatio:\s*1122\s*\/\s*1402/, "the separate portrait artwork must be removed");
  assert.match(artworkContainer, /paper-event-penny-stock-hero[\s\S]*?paper-event-leaderboard-countdown/);
  assert.match(artworkContainer, /paper-event-leaderboard-participant-count/);
  assert.match(artworkContainer, /testID="paper-event-leaderboard-podium"/);
  const standingsStart = leaderboard.indexOf('<View testID="paper-event-leaderboard-list"');
  assert.ok(standingsStart > artworkEnd, "full standings remain on their solid card below the artwork");
  assert.match(leaderboard.slice(standingsStart, standingsStart + 300), /backgroundColor: isPennyStockMayhem \? 'rgba\(7,17,13,0\.95\)' : colors\.card/);
  assert.match(eventArena, /const configuration = await fetchSavedEventConfiguration\(event\)/);
  assert.match(eventArena, /eventType: configuration\.eventType/);
  assert.match(eventArena, /rankingDirection: configuration\.rankingDirection/);
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
    if (asset.endsWith('.png')) {
      assert.equal(bytes.subarray(0, 8).toString('hex'), '89504e470d0a1a0a', `${asset} is a bundled PNG`);
      assert.equal(bytes.readUInt32BE(16), 1122, `${asset} retains the supplied image width`);
      assert.equal(bytes.readUInt32BE(20), 1402, `${asset} retains the supplied image height`);
    } else {
      assert.equal(bytes[0], 0xff, `${asset} is a bundled JPEG`);
      assert.equal(bytes[1], 0xd8, `${asset} is a bundled JPEG`);
    }
    assert.ok(bytes.byteLength > 0, `${asset} is present in the mobile bundle`);
    if (id === 'one-stock-challenge') continue;

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
  assert.match(leaderboard, /isChampion \? 'rgba\(13,17,23,0\.76\)' : isPennyStockMayhem \? 'rgba\(10,23,17,0\.78\)' : 'rgba\(13,19,29,0\.73\)'/);
  assert.match(leaderboard, /const compactPodium = windowWidth <= 360/);
  assert.match(leaderboard, /useWindowDimensions\(\)/);
  assert.match(leaderboard, /const podiumColors = isBearMarketMayhem\s+\? \['#F0525D', '#B9C0C9', '#A94B3D'\]\s+: \['#E5BF63', '#C9D4DF', '#D99A72'\]/);
  assert.match(leaderboard, /const medalColor = podiumColors\[slot\.rank - 1\] \?\? podiumColors\[0\]/);
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
  assert.match(podium, /isBearMarketMayhem && isChampion \? 'ANTI-CHAMPION'/);
  assert.doesNotMatch(podium, /RUNNER-UP|THIRD PLACE/);
  assert.match(podium, /allowFontScaling numberOfLines=\{1\} adjustsFontSizeToFit minimumFontScale=\{0\.7\}[\s\S]*?\{entry\.alias\}/);
  assert.match(podium, /allowFontScaling numberOfLines=\{1\} adjustsFontSizeToFit minimumFontScale=\{0\.65\}[\s\S]*?\{money\(entry\.equity\)\}/);
  assert.match(podium, /allowFontScaling numberOfLines=\{1\} adjustsFontSizeToFit minimumFontScale=\{0\.65\}[\s\S]*?\{signedMoney\(entry\.profitLoss\)\}/);
});

test("Penny Stock Mayhem exposes its rules and rechecks execution quotes", () => {
  assert.match(eventLiveNotice, /PENNY STOCK MAYHEM/);
  assert.match(eventLiveNotice, /STOCKS & ETFs UNDER \$20/);
  assert.match(screen, /Quote unavailable · eligibility unknown/);
  assert.match(screen, /executionQuotePrice: currentQuote\.price/);
  assert.match(screen, /executionQuotePrice: q\.price/);
  assert.match(screen, /maxPurchasePrice: eventPurchaseLimit/);
  assert.match(screen, /getPurchaseLimitRejectionReason/);
  assert.match(screen, /status: 'cancelled' as const, rejectionReason: purchaseLimitRejection/);
  assert.match(screen, /testID=\{`paper-order-rejection-\$\{o\.id\}`\}/);
  assert.match(challenge, /purchaseLimit: 20/);
  assert.match(eventArena, /penny-stock-mayhem/);
  assert.match(eventArenaOverview, /event-arena-penny-stock-artwork/);
  assert.match(orderEntry, /purchaseLimit/);
  assert.match(orderReview, /below \{money\(review\.purchaseLimit\)\}/);
});

test("Event Arena overview shows concise special rules only for restricted events", () => {
  assert.match(eventArenaOverview, /testID="event-arena-special-rules"/);
  assert.match(eventArenaOverview, /testID=\{`event-arena-rule-\$\{rule\.id\}`\}/);
  assert.match(eventArenaOverview, /ONE PARTICIPANT\. ONE STOCK\. ONE OPEN POSITION\./);
  assert.match(eventArenaOverview, /ONE_STOCK_CHALLENGE_RULE_COPY/);
  assert.match(eventArenaOverview, /testID="event-arena-one-stock-artwork"/);
  assert.match(eventArenaOverview, /event-arena-one-stock-challenge\.png/);
  assert.match(eventArenaOverview, /resizeMode="cover"[\s\S]*?aspectRatio: 1122 \/ 1402/);
  assert.match(eventArenaOverview, /verified stock or ETF[\s\S]*?final fill below \$20/);
  assert.match(eventArenaOverview, /Lowest portfolio return ranks first/);
  assert.match(eventArenaOverview, /Cash transfers are disabled during the preparation period and competition/);
  assert.match(eventArenaOverview, /const isMountainChampionship = event\.eventType === 'mountain-championship'/);
  assert.match(challenge, /NEON_NIGHTCLUB_STARTING_BALANCE = 250_000/);
  assert.match(challenge, /artworkId === 'mountain-summit'[\s\S]*?startingBalance: PAPER_CHALLENGE_STARTING_BALANCE/);
});

test("Lightning and One-Stock live notices can be dismissed per event", () => {
  assert.match(challenge, /eventType === 'event-arena'[\s\S]*eventType === 'one-stock-challenge'[\s\S]*eventType === 'lightning-round'/);
  assert.match(challenge, /eventType !== 'lightning-round' \|\| !isEventAccountActive/);
  assert.match(eventLiveNotice, /isDismissiblePaperEventLiveNotice\(enrollment\.eventType\)/);
  assert.match(eventLiveNotice, /getPaperEventLiveNoticeDismissalKey\(enrollment\.accountId, enrollment\.eventId\)/);
  assert.match(eventLiveNotice, /testID="dismiss-paper-event-live-banner"/);
  assert.match(eventLiveNotice, /persistPaperEventLiveNoticeDismissal\(AsyncStorage, dismissalKey\)/);
});

test("One-Stock Challenge leaderboard highlights ticker or cash, position value, and remaining cash", () => {
  assert.match(leaderboard, /testID=\{`one-stock-leaderboard-holding-\$\{entry\.rank\}`\}/);
  assert.match(leaderboard, /\{entry\.holdings\[0\]\?\.symbol \?\? 'HOLDING CASH'\}/);
  assert.match(leaderboard, /Position \{entry\.holdings\[0\]\?\.marketValue == null \? '—' : money\(entry\.holdings\[0\]\.marketValue\)\}/);
  assert.match(leaderboard, /Cash \{money\(entry\.cashBalance\)\}/);
  assert.match(leaderboard, /current holding \$\{entry\.holdings\[0\]\?\.symbol \?\? 'cash'\}[\s\S]*?cash remaining \$\{money\(entry\.cashBalance\)\}/);
});

test("One-Stock leaderboard and final result cards use the event artwork", () => {
  assert.match(leaderboardMockup, /artwork: 'event-arena-one-stock-challenge'/);
  assert.match(leaderboardMockup, /name: 'The One-Stock Challenge'/);
  assert.match(leaderboardMockup, /oneStockChallenge: true/);
  assert.match(leaderboardMockup, /OPEN HOLDING/);
  assert.match(leaderboardMockup, /REMAINING CASH/);
  assert.match(leaderboardMockup, /artworkPath = `\/__mockup\/images\/leaderboard-events\/\$\{event\.artwork\}\.\$\{event\.artworkExtension \?\? 'jpg'\}`/);
  assert.match(leaderboardMockup, /mm-one-stock-title/);
  assert.match(leaderboardMockup, /One participant\. One stock\. One winning position\./);
  assert.match(endEventStoryMockup, /event-arena-one-stock-challenge\.png/);
  assert.match(endEventStoryMockup, /THE ONE-STOCK CHALLENGE/);

  assert.match(shareCard, /EVENT_ARENA_ARTWORK_SOURCES\[event\.artworkId \?\? LEGACY_PAPER_CHALLENGE_ARTWORK_ID\]/);
  assert.match(shareCard, /event\.eventType === 'one-stock-challenge'[\s\S]*?ONE-STOCK CHALLENGE · RESULTS/);
  assert.match(events, /event\.eventType === 'one-stock-challenge'[\s\S]*?One-Stock Challenge results/);
  assert.match(events, /source=\{EVENT_ARENA_ARTWORK_SOURCES\[event\.artworkId \?\? LEGACY_PAPER_CHALLENGE_ARTWORK_ID\]\}/);
  assert.match(eventArena, /source=\{EVENT_ARENA_ARTWORK_SOURCES\[event\.artworkId \?\? LEGACY_PAPER_CHALLENGE_ARTWORK_ID\]\}/);
});

test("Penny Stock Mayhem uses cinematic leaderboard artwork without a floating logo", () => {
  assert.match(eventArenaArtworkCatalog, /'penny-stock-mayhem': require\('\.\.\/assets\/event-arena-penny-stock-mayhem-clean\.jpg'\)/);
  assert.match(eventArenaOverview, /mm-mark-foreground\.png/);
  assert.match(eventArenaOverview, /STOCKS &amp; ETFs UNDER \$20/);
  assert.match(eventArenaOverview, /money\(startingCapital\)\} STARTING CAPITAL/);
  assert.match(leaderboard, /isPennyStockMayhem\s+\?\s+require\('\.\.\/assets\/event-arena-penny-stock-mayhem-premium\.jpg'\)/);
  assert.match(leaderboard, /paper-event-leaderboard-countdown[\s\S]*?eventStatus\.countdown/);
  assert.match(leaderboard, /paper-event-leaderboard-participant-count[\s\S]*?entries\.length/);
  assert.match(leaderboard, /dateRangeLabel\(event\.startAtMs, event\.endAtMs\)/);
  assert.doesNotMatch(leaderboard, /mm-mark-foreground\.png/);
  assert.match(leaderboardMockup, /event-arena-penny-stock-mayhem-premium/);
  assert.doesNotMatch(leaderboardMockup, /mm-mark-foreground\.png/);
  assert.match(leaderboardMockup, /mm-penny-hero/);
  assert.match(leaderboardMockup, /event-arena-stadium/);
  assert.match(leaderboardMockup, /event-arena-neon-nightclub/);
  assert.match(pennyLeaderboardPreview, /AllSevenLeaderboards onlyPenny/);
});

test("Penny Stock leaderboard exposes fixture-stable artwork and rule banner targets", () => {
  assert.match(leaderboard, /testID="paper-event-penny-stock-hero"/);
  assert.match(leaderboard, /testID="paper-event-penny-stock-rule-banner"/);
  assert.match(leaderboard, /testID="paper-event-penny-stock-art"/);
  assert.match(leaderboard, /testID="paper-event-leaderboard-countdown"/);
  assert.match(leaderboard, /testID="paper-event-leaderboard-podium"/);
});

test("Event Arena account card stays compact without a duplicate trading action", () => {
  const accountCardStart = eventArenaOverview.indexOf("style={[styles.accountCard");
  const accountCardEnd = eventArenaOverview.indexOf("\n            </View>\n\n            <View style={styles.sectionHeading}>", accountCardStart);
  assert.ok(accountCardStart >= 0 && accountCardEnd > accountCardStart);
  const accountCard = eventArenaOverview.slice(accountCardStart, accountCardEnd);
  const metricGridStart = accountCard.indexOf('<View style={styles.metricGrid}>');
  const metricGridEnd = accountCard.indexOf('</View>', metricGridStart);
  const metrics = accountCard.slice(metricGridStart, metricGridEnd);

  assert.match(eventArenaOverview, /accountCard: \{[^}]*padding: 12/);
  assert.match(eventArenaOverview, /metric: \{[^}]*minHeight: 58[^}]*paddingVertical: 8/);
  assert.match(accountCard, /ACCOUNT NAME[\s\S]*?testID="event-arena-account-name"/);
  assert.doesNotMatch(metrics, /label="ACCOUNT NAME"/);
  for (const label of [
    'STARTING BALANCE',
    'AVAILABLE CASH',
    'BUYING POWER',
    'NET P/L',
    'EVENT RANK',
    'COMPLETED TRADES',
  ]) {
    assert.ok(metrics.includes(`label="${label}"`), `${label} remains in the compact metric grid`);
  }
  assert.match(accountCard, /ACCOUNT EQUITY/);
  assert.match(accountCard, /signedPercent\(performance\?\.returnPercent\)/);
  assert.match(eventArenaOverview, /<Text style=\{\[styles\.isolationText,[\s\S]*?\}>ISOLATED<\/Text>/);
  assert.doesNotMatch(accountCard, /event-arena-open-trades-secondary|Open event trading|styles\.tradeLink/);
  assert.match(eventArenaOverview, /testID="event-arena-open-trades"[\s\S]*?Trade event account/);
});
