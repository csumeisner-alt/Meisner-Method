import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const screen = readFileSync(new URL("../app/paper.tsx", import.meta.url), "utf8");
const orderSheet = readFileSync(new URL("../components/OrderSheet.tsx", import.meta.url), "utf8");
const orderEntry = readFileSync(new URL("../components/ProfessionalOrderEntry.tsx", import.meta.url), "utf8");
const orderReview = readFileSync(new URL("../components/OrderEntryReview.tsx", import.meta.url), "utf8");
const events = readFileSync(new URL("../components/PaperChallengeHistory.tsx", import.meta.url), "utf8");
const challenge = readFileSync(new URL("../lib/paperChallenge.ts", import.meta.url), "utf8");
const badges = readFileSync(new URL("../components/PaperChallengeMilestoneBadges.tsx", import.meta.url), "utf8");
const shareCard = readFileSync(new URL("../components/PaperEventShareCard.tsx", import.meta.url), "utf8");

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
  assert.match(screen, /\{ id: 'history',\s+label: 'TRADE HISTORY'/);
  assert.match(screen, /testID=\{`paper-tab-\$\{tab\.id\}`\}/);
  assert.doesNotMatch(screen, /historyAgeMs >= range\.ms/);
  assert.match(orderEntry, /testID="order-sheet-active-account"/);
  assert.match(orderEntry, /SETTLED B\.P\./);
  assert.match(orderReview, /CAPTURED ACCOUNT/);
});

test("paper order review captures account identity and guards duplicate submissions", () => {
  assert.match(orderEntry, /accountId: account\.id/);
  assert.match(orderEntry, /setReview\(\{\s*args,\s*accountName: account\.name/);
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

test("completed Event Arena records retain and expose their transaction history", () => {
  assert.match(challenge, /transactions: eventTransactions\.map/);
  assert.match(events, /toggle-paper-event-trades-/);
  assert.match(events, /paper-event-trades-/);
  assert.match(events, /event\.transactions\?\.length/);
});
