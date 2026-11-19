# Android interaction repair verification

## Scope and safety

This pass changes interaction ownership, display layout, and market-detail loading.
It does not change financial calculations, account identifiers, balances, orders,
settlement rules, storage formats, dependencies, SDK versions, or release versions.
No APK, production deployment, GitHub push, or account reset was performed.

## Findings and repairs

| Report | Finding and repair |
| --- | --- |
| Main-tab swipe crashes / repeated navigation | Tab swipes and bottom buttons now share a synchronous dispatch guard. A swipe is discarded if its originating route changed before release. Existing singular tab routes remain mounted; native slide transitions and competing native back gestures are disabled for the five main tabs only. This mitigates overlapping native-stack transitions; the reported native crash itself could not be reproduced without the device. |
| Account swipes do not work | The summary reserves its touch stream before horizontal movement, captures horizontal intent before enclosing views, retains ownership at first/last boundaries, and releases on end, cancellation, termination, and unmount. Vertical motion and taps are not claimed. |
| Analyze cannot scroll | On native, the native scroll gesture now attaches to the actual ScrollView. Web keeps its ref-free wrapper because of an existing RNGH/React 19 adapter constraint. Drag cleanup restores scrolling on cancellation, item changes, blur, and unmount. |
| Wrong ticker dragged | Gesture closures are regenerated for the actual displayed symbol order, not only list length. Drag sessions carry the touched symbol and starting order; cancellation or a changed list discards the operation. The UI-thread start helper is explicitly a worklet. Quote updates do not recreate these gestures. Alert/remove controls remain separate from the drag region. |
| Summary overlaps navigation | Compact metrics switch to a vertical axis but previously retained `flex: 1`. In an intrinsically sized Android column this can allocate no height and let text overflow. Compact rows and the containing summary no longer flex-shrink. Event metrics wrap to two columns at narrow widths / larger native font scales; the lower schedule/control row stacks with intrinsic height. |
| Ranges and statistics missing | The verified published backend returned HTTP 404 for the split summary route, while its established info route returned real provider ranges/statistics. The client uses that established generated request only for HTTP 404, never for timeouts, rate limits, or provider failures. The summary deadline now exceeds the server's 12-second provider deadline. Query keys remain instrument-specific and mismatched response identities are rejected for display. Missing provider fields and request failures have different messages, and retry remains available. |

## Checks completed

- 68 focused regressions passed: main-tab plans, account boundaries, navigation
  dispatch locking, drag symbol/order/cancellation behavior, older-backend summary
  compatibility, provider failures, and existing screen wiring.
- Mobile and API TypeScript checks passed.
- `git diff --check` passed.
- A 360 × 800 browser screenshot showed all regular-account summary metrics and
  account indicators above the portfolio navigation, with no overlap.
- Real local API requests succeeded for AAPL, SPY, BTC-USD, and GC=F. Each returned
  provider-reported daily and yearly ranges, with unavailable statistics left null.
  An invalid instrument returned HTTP 503 with a provider-error response, not an
  empty successful summary.
- The verified production URL returned HTTP 404 for
  `/api/stocks/heat-map/detail/AAPL/summary` and HTTP 200 with real statistics for
  `/api/stocks/info/AAPL`.
- Metro produced an Android JavaScript bundle. An Android-target Babel transform
  also registered all six watchlist worklets, including the start callback.
  These are compilation checks, **not an APK build or native runtime test**.
- The full configured test command passed: 745 mobile tests and 273 API-server
  tests. The paper-account browser harness now uses a realistic touch-down
  interval before touch-up; React Native Web deliberately suppresses clicks for
  250 ms after a completed swipe. The heat-map summary query gives the API's
  12-second provider deadline a 14-second client deadline and leaves retries to
  the visible Retry action, so a stalled request reaches its honest error state
  without starting a second timeout cycle.
- Full library, mobile, and API TypeScript checks passed; Expo dependencies were
  current; `git diff --check` passed. The Expo workflow restarted and Metro
  rebuilt the Android JavaScript bundle.
- Browser fixtures now wait for asynchronous quote-driven tiles to render before
  clicking them, avoiding a test-only race between React state updates and the
  next immediate browser evaluation.

## Browser interaction evidence

The single browser pass used CDP-emulated touch at 360 × 800. Focused follow-ups
to the same browser session investigated only the exposed web gesture failures.

- Swipes traversed all five main routes in both directions, with one route per
  committed swipe. After adding web `pan-y` ownership, focused main-tab and account
  touch checks no longer generated browser `pointercancel`.
- Account swipes moved Tiger → Borg → Fireball and back, one account at a time,
  without leaving `/paper`. First/last boundaries were no-ops. Switch opened the
  selector and selecting an account worked. No balances changed.
- Analyze scrolled from touches beginning on ticker cards. Scrolling recovered
  after a cancelled hold, navigation away/back, and refresh. Alert buttons opened
  the correct MSFT/NVDA dialog; a normal AAPL tap opened `/analysis/AAPL`.
- The focused final drag check passed without diagnostic CSS overrides: a held
  MSFT row moved down one slot, then NVDA moved up one slot; persisted order
  matched the display. Cancelling an actively moving SPY drag cleared the ghost
  without changing order or persistence. Ordinary ticker-card scrolling still
  worked afterward. A preinstalled non-passive touchmove listener prevents
  browser scrolling only while the long-hold drag is active; ordinary touches
  retain native browser scrolling.
- Real GOOGL details loaded ranges and key statistics. An intentionally failed
  AAPL summary request displayed the error and Retry; Retry loaded the real
  provider response. A delayed AAPL response did not overwrite open GOOGL details.
- At 320 × 640, summary values were unclipped and indicators remained above the
  navigation. At 1.3× **browser zoom**, values still fit; some tab labels wrapped
  and the top title truncated. This is not a native font-scale test.
- No enrolled event account existed in the test session, so event-account
  interaction/layout was not established by the live browser pass. No enrollment
  was created for testing.
- The separate real-holdings Portfolio screen returned an existing HTTP 401 from
  `/api/user/trades`, displaying its explicit unavailable/retry state. Tab
  navigation remained usable. No authentication or financial-record changes were
  made to bypass that response.

## Native evidence and limitations

The supplied Android photo directly shows the original lower summary metrics
overlapping the navigation; it is treated as evidence of a native failure.
No Android device, emulator, `adb`, native crash trace, or device font-scale
controls were available in this workspace. Consequently repeated native tab swipes,
native account swipes, native drag cancellation, and large-native-text geometry
are **not claimed as passed**. Browser emulated touch and enlarged browser text
cannot establish those native results.

## Release boundary

These changes are confined to the task branch. The installed APK has not changed.
Its existing split-detail requests still need the already implemented API routes
to be present in the published backend. Gesture/layout/client compatibility changes
need a later user-authorized mobile release. No release action is authorized by
this repair.

## Final status

All configured project tests and static checks passed after isolating the
browser-test timing issues: the Paper fixture modeled taps with zero duration,
the heat-map timeout fixture expected an error while an automatic second timed
request was still pending, and a commodity-tile test clicked before its updated
quotes had rendered. The browser fixtures now use realistic tap timing, wait for
updated content, and verify that a timed-out market request reaches its honest
error state with an explicit Retry control.

Native hardware/emulator validation remains unavailable and is explicitly
excluded from the passing evidence above.
