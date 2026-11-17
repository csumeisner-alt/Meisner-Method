/**
 * Versioned inventory of data that may move through the phone-to-phone
 * transfer. Keep this as the single source of truth for mobile export/import
 * and server validation.
 */
export const DEVICE_TRANSFER_MANIFEST_VERSION = 1 as const;

export type DeviceTransferPortability =
  | "portable"
  | "server-managed"
  | "rebuildable"
  | "device-bound"
  | "excluded";

export type DeviceTransferManifestEntry = {
  id: string;
  label: string;
  source: string;
  version: number;
  portability: DeviceTransferPortability;
  validation: string;
  exclusions: string[];
  keys?: string[];
  keyPrefixes?: string[];
  conflictPolicy?: "replace-only-after-review";
};

export const DEVICE_TRANSFER_MANIFEST: readonly DeviceTransferManifestEntry[] = [
  {
    id: "paper-and-event-arena",
    label: "Paper Trading and Event Arena",
    source: "AsyncStorage: paper_v2, paper_equity_snapshots_v1, paper_events_v1",
    version: 1,
    portability: "portable",
    validation: "JSON records have unique IDs and every linked record references an included account.",
    exclusions: ["Live quotes", "Leaderboard identity and cash-transfer records remain installation-scoped."],
    keys: [
      "@stocksense/paper_v2",
      "@stocksense/paper_equity_snapshots_v1",
      "@stocksense/paper_events_v1",
    ],
    conflictPolicy: "replace-only-after-review",
  },
  {
    id: "portfolio-history",
    label: "Portfolio trade history",
    source: "AsyncStorage: portfolio_trades_v1; authenticated records remain in the signed-in account",
    version: 1,
    portability: "portable",
    validation: "Trade rows are valid JSON with unique IDs, recognized trade sides, and finite values.",
    exclusions: ["Portfolio quotes and derived holdings/analytics are rebuilt from trades."],
    keys: ["@stocksense/portfolio_trades_v1"],
    conflictPolicy: "replace-only-after-review",
  },
  {
    id: "watchlist",
    label: "Watchlist",
    source: "AsyncStorage guest cache; signed-in watchlists remain on the user account",
    version: 1,
    portability: "portable",
    validation: "Ordered symbols are unique and include a creation timestamp.",
    exclusions: ["Quote cache is rebuilt; custom-named lists do not exist."],
    keys: ["@stocksense/watchlist_v1/__guest__"],
    conflictPolicy: "replace-only-after-review",
  },
  {
    id: "theme-and-brew-progress",
    label: "Patriot Mode and Brew Bank",
    source: "AsyncStorage fact counters, Brew economy snapshot/legacy keys, sound and haptics preferences",
    version: 1,
    portability: "portable",
    validation: "Counters and balances are non-negative; the versioned Brew snapshot must parse.",
    exclusions: ["Temporary bank access and timed sale expirations are preserved as dates, not device schedules."],
    keys: [
      "@stocksense/facts_read_v1",
      "@stocksense/american_mode_unlocked_v1",
      "@stocksense/american_mode_v1",
      "@stocksense/brew_economy_snapshot_v1",
      "@stocksense/biden_quotes_viewed_v1",
      "@stocksense/brew_bank_unlocked_v1",
      "@stocksense/brew_tokens_v1",
      "@stocksense/brew_sound_enabled_v1",
      "@stocksense/brew_haptics_enabled_v1",
      "@stocksense/brew_bank_keys_v1",
      "@stocksense/brew_bank_access_expires_v1",
      "@stocksense/quick_revive_unlocked_v1",
      "@stocksense/quick_revive_bottles_v1",
      "@stocksense/quick_revive_armed_v1",
      "@stocksense/daiquiri_unlocked_v1",
      "@stocksense/daiquiri_bottles_v1",
      "@stocksense/daiquiri_armed_v1",
      "@stocksense/stamin_up_unlocked_v1",
      "@stocksense/stamin_up_bottles_v1",
      "@stocksense/stamin_up_armed_v1",
      "@stocksense/smart_pro_unlocked_v1",
      "@stocksense/smart_pro_bottles_v1",
      "@stocksense/smart_pro_sale_expires_v1",
      "@stocksense/dark_brew_tokens_v1",
    ],
    conflictPolicy: "replace-only-after-review",
  },
  {
    id: "price-alerts",
    label: "Price alert rules",
    source: "AsyncStorage alert cache; alert records are recreated for the destination installation",
    version: 1,
    portability: "portable",
    validation: "Alerts have unique IDs, valid symbols, finite targets, and no device tokens.",
    exclusions: ["The destination must grant notification permission and register its own push token."],
    keys: ["@stocksense/price_alerts_v1"],
    conflictPolicy: "replace-only-after-review",
  },
  {
    id: "achievements",
    label: "Achievements and premium flag",
    source: "AsyncStorage achievement IDs, Analyze progress, and selected flag",
    version: 1,
    portability: "portable",
    validation: "Achievement IDs and selected flag values are checked against the app catalog.",
    exclusions: [],
    keys: [
      "@meisnermethod/achievements_v1",
      "@meisnermethod/analyze_search_count_v1",
      "@meisnermethod/premium_flag_badge_v1",
    ],
    conflictPolicy: "replace-only-after-review",
  },
  {
    id: "custom-heat-map",
    label: "Custom heat map",
    source: "AsyncStorage: custom-symbols.v1",
    version: 1,
    portability: "portable",
    validation: "Symbol order is a bounded JSON list with no duplicate entries.",
    exclusions: ["Instrument quotes are rebuilt."],
    keys: ["meisner.heat-map.custom-symbols.v1"],
    conflictPolicy: "replace-only-after-review",
  },
  {
    id: "research-and-comparisons",
    label: "Saved research and comparisons",
    source: "AsyncStorage ETF/commodity snapshots, comparison focus, pinned symbol, chart drawings and analysis preferences",
    version: 1,
    portability: "portable",
    validation: "Each saved value is valid JSON or a bounded scalar preference; chart drawings use the documented key prefix.",
    exclusions: ["Quotes and generated analysis are not saved; only user-selected comparisons, preferences, and snapshots move."],
    keys: [
      "@stocksense/pinned_comp_symbol",
      "@stocksense/etf_comparison_symbols_v1",
      "@stocksense/etf_holding_snapshots_v1",
      "@stocksense/etf_score_snapshots_v1",
      "@stocksense/etf_score_card_hidden_v1",
      "@stocksense/commodity_intelligence_snapshots_v1",
      "@stocksense/etf_contribution_cadence_v1",
    ],
    keyPrefixes: ["@meisnermethod/heat_map_chart_drawings_v1/"],
    conflictPolicy: "replace-only-after-review",
  },
  {
    id: "saved-display-preferences",
    label: "Saved display and reminder preferences",
    source: "AsyncStorage collapsed panels, onboarding hints, review cooldown, and Event Arena reminder preference",
    version: 1,
    portability: "portable",
    validation: "Known scalar preferences use their documented values.",
    exclusions: ["Scheduled notification identifiers are not transferred; destination schedules its own reminders."],
    keys: [
      "@stocksense/watchlist_collapsed",
      "@stocksense/trending_collapsed",
      "@stocksense/alerts_collapsed",
      "@stocksense/paper_events_notifications_v1",
      "@stocksense/grade_history_hint_shown_v2",
      "@meisnermethod/app_review_state_v1",
    ],
    keyPrefixes: ["@stocksense/paper_event_live_notice_dismissal_v1:"],
    conflictPolicy: "replace-only-after-review",
  },
  {
    id: "authenticated-records",
    label: "Signed-in account records",
    source: "PostgreSQL rows scoped to the authenticated user: watchlists, portfolio trades, paper accounts and notification settings",
    version: 1,
    portability: "server-managed",
    validation: "Server authorizes reads and writes by the signed-in user ID.",
    exclusions: ["Not duplicated into a device bundle; the user signs in on the destination."],
    keys: [
      "PostgreSQL: user watchlists",
      "PostgreSQL: portfolio trades",
      "PostgreSQL: paper accounts and records",
      "PostgreSQL: user notification preferences and alerts",
    ],
  },
  {
    id: "installation-notifications",
    label: "Phone notification setup",
    source: "Installation-scoped push registrations, OS permission grants and scheduled notification IDs",
    version: 1,
    portability: "device-bound",
    validation: "Destination registers its own installation and push token after restoring.",
    exclusions: ["Never copy installation IDs, push tokens, permissions or scheduled notification IDs."],
    keys: [
      "@stocksense/installation_id",
      "@stocksense/event_arena_device_token_v1",
      "@stocksense/event_arena_device_revision_v1",
      "@stocksense/event_arena_device_dirty_v1",
      "@stocksense/event_arena_source_installation_id_v1",
      "@stocksense/paper_events_notification_id_v1",
      "@stocksense/bank_weekend_reminder_v1",
    ],
  },
  {
    id: "rebuildable-market-cache",
    label: "Market quote caches",
    source: "AsyncStorage watchlist and portfolio quote caches",
    version: 1,
    portability: "rebuildable",
    validation: "Fetched again from the market data provider.",
    exclusions: ["Not sent in a transfer."],
    keys: [
      "@stocksense/watchlist_v1/__quotes__",
      "@stocksense/portfolio_quotes_v1",
    ],
  },
  {
    id: "device-pairing-state",
    label: "Existing Event Arena device pairing",
    source: "AsyncStorage installation ID, pairing token, revision and dirty marker",
    version: 1,
    portability: "excluded",
    validation: "The destination receives a fresh pairing token through the compatible Event Arena flow.",
    exclusions: ["Never export a device token, source installation ID, sync revision, or dirty marker."],
    keys: [
      "@stocksense/installation_id",
      "@stocksense/event_arena_device_token_v1",
      "@stocksense/event_arena_device_revision_v1",
      "@stocksense/event_arena_device_dirty_v1",
      "@stocksense/event_arena_source_installation_id_v1",
      "@meisnermethod/device_transfer_destination_v1",
      "@meisnermethod/device_transfer_journal_v1",
    ],
  },
] as const;

export const DEVICE_TRANSFER_CATEGORIES = DEVICE_TRANSFER_MANIFEST
  .filter((entry) => entry.portability === "portable");

export type DeviceTransferCategoryId = (typeof DEVICE_TRANSFER_CATEGORIES)[number]["id"];

export type ValidatedDeviceTransferBundle = {
  version: typeof DEVICE_TRANSFER_MANIFEST_VERSION;
  bundleId: string;
  exportedAt: string;
  categories: Array<{
    id: DeviceTransferCategoryId;
    version: number;
    data: Record<string, string>;
  }>;
};

const MAX_BUNDLE_BYTES = 2_000_000;
const MAX_CATEGORY_KEYS = 300;
const PORTABLE_IDS = new Set(DEVICE_TRANSFER_CATEGORIES.map((entry) => entry.id));
const JSON_STORAGE_KEYS = new Set([
  "@stocksense/paper_v2",
  "@stocksense/paper_equity_snapshots_v1",
  "@stocksense/paper_events_v1",
  "@stocksense/portfolio_trades_v1",
  "@stocksense/watchlist_v1/__guest__",
  "@stocksense/brew_economy_snapshot_v1",
  "@stocksense/price_alerts_v1",
  "@meisnermethod/achievements_v1",
  "meisner.heat-map.custom-symbols.v1",
  "@stocksense/etf_comparison_symbols_v1",
  "@stocksense/etf_holding_snapshots_v1",
  "@stocksense/etf_score_snapshots_v1",
  "@stocksense/commodity_intelligence_snapshots_v1",
  "@meisnermethod/app_review_state_v1",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function finiteFields(
  record: Record<string, unknown>,
  required: string[],
  optional: string[],
): boolean {
  return required.every((key) => typeof record[key] === "number" && Number.isFinite(record[key]))
    && optional.every((key) => record[key] === undefined
      || (typeof record[key] === "number" && Number.isFinite(record[key])));
}

function validDate(value: unknown): value is string {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}

function categoryForKey(id: string): DeviceTransferManifestEntry | undefined {
  return DEVICE_TRANSFER_CATEGORIES.find((entry) => entry.id === id);
}

function keyBelongsToCategory(entry: DeviceTransferManifestEntry, key: string): boolean {
  return Boolean(entry.keys?.includes(key) || entry.keyPrefixes?.some((prefix) => key.startsWith(prefix)));
}

function parseStoredJson(value: string, key: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    throw new Error(`${key} contains invalid saved data.`);
  }
}

function validateCategoryData(entry: DeviceTransferManifestEntry, data: Record<string, string>) {
  for (const [key, value] of Object.entries(data)) {
    if (!keyBelongsToCategory(entry, key) || typeof value !== "string" || value.length > MAX_BUNDLE_BYTES) {
      throw new Error(`${entry.label} contains an unsupported saved item.`);
    }
    if (JSON_STORAGE_KEYS.has(key) || key.includes("chart_drawings_v1/")) {
      parseStoredJson(value, key);
    }
  }

  if (entry.id === "paper-and-event-arena" && data["@stocksense/paper_v2"]) {
    const cache = parseStoredJson(data["@stocksense/paper_v2"], "@stocksense/paper_v2");
    if (!isRecord(cache)) throw new Error("Paper Trading data is invalid.");
    const arrays = ["accounts", "positions", "transactions", "orders", "lots"];
    if (arrays.some((name) => !Array.isArray(cache[name]))) throw new Error("Paper Trading records are incomplete.");
    const accounts = cache.accounts as Record<string, unknown>[];
    const accountIds = new Set(accounts.map((account) => account?.id).filter((id): id is string => typeof id === "string"));
    if (accountIds.size !== accounts.length || typeof cache.activeId !== "string") {
      throw new Error("Paper Trading account IDs are invalid.");
    }
    for (const account of accounts) {
      if (!isRecord(account) || typeof account.id !== "string" || typeof account.name !== "string"
        || !finiteFields(account, ["cash"], ["unsettledCash", "shortCollateral", "shortCollateralRatio"])
        || (account.createdAt !== undefined && !validDate(account.createdAt))) {
        throw new Error("Paper Trading accounts contain invalid balances or fields.");
      }
    }
    for (const name of ["positions", "transactions", "orders", "lots"]) {
      const rows = cache[name] as Record<string, unknown>[];
      const ids = new Set<string>();
      for (const row of rows) {
        if (!isRecord(row) || typeof row.id !== "string" || ids.has(row.id)
          || typeof row.accountId !== "string" || !accountIds.has(row.accountId)) {
          throw new Error(`Paper Trading ${name} do not match their accounts.`);
        }
        ids.add(row.id);
      }
    }
    for (const position of cache.positions as Record<string, unknown>[]) {
      if (typeof position.symbol !== "string" || !position.symbol.trim()
        || !finiteFields(position, ["shares", "avgCost"], ["dividendYield", "dividendRate", "expenseRatio", "collateralPerShare"])
        || (position.positionType !== undefined && position.positionType !== "long" && position.positionType !== "short")
        || (position.openedAt !== undefined && !validDate(position.openedAt))) {
        throw new Error("Paper Trading positions contain invalid values.");
      }
    }
    const transactionActions = new Set(["BUY", "SELL", "SHORT_SELL", "BUY_TO_COVER", "DIVIDEND"]);
    for (const transaction of cache.transactions as Record<string, unknown>[]) {
      if (typeof transaction.symbol !== "string" || !transaction.symbol.trim()
        || !transactionActions.has(String(transaction.action))
        || !finiteFields(transaction, ["shares", "price", "total"], ["realizedPnL", "fee", "cashDelta", "shortCollateralDelta"])
        || !validDate(transaction.date)) {
        throw new Error("Paper Trading transactions contain invalid values.");
      }
    }
    const orderTypes = new Set(["market", "limit", "stop", "stop_limit", "trailing_stop"]);
    for (const order of cache.orders as Record<string, unknown>[]) {
      if (typeof order.symbol !== "string" || !order.symbol.trim()
        || !orderTypes.has(String(order.orderType))
        || (order.side !== "buy" && order.side !== "sell")
        || !["pending", "filled", "cancelled"].includes(String(order.status))
        || !finiteFields(order, ["shares"], [
          "limitPrice", "stopPrice", "trailPct", "trailAbs", "trailRef", "shortCollateralRatio",
          "dividendYield", "dividendRate", "expenseRatio", "filledPrice",
        ])
        || !validDate(order.placedAt)
        || (order.filledAt !== undefined && !validDate(order.filledAt))) {
        throw new Error("Paper Trading orders contain invalid values.");
      }
    }
    for (const lot of cache.lots as Record<string, unknown>[]) {
      if (typeof lot.symbol !== "string" || !lot.symbol.trim()
        || !finiteFields(lot, ["shares", "cost"], [])
        || !validDate(lot.purchasedAt)) {
        throw new Error("Paper Trading lots contain invalid values.");
      }
    }
    if (accounts.length && cache.activeId && !accountIds.has(cache.activeId)) {
      throw new Error("The selected Paper Trading account is missing.");
    }

    const snapshotsRaw = data["@stocksense/paper_equity_snapshots_v1"];
    if (snapshotsRaw) {
      const snapshots = parseStoredJson(snapshotsRaw, "Paper account value history");
      if (!Array.isArray(snapshots) || snapshots.length > 50_000
        || snapshots.some((snapshot) => !isRecord(snapshot)
          || typeof snapshot.accountId !== "string" || !accountIds.has(snapshot.accountId)
          || !validDate(snapshot.date)
          || typeof snapshot.value !== "number" || !Number.isFinite(snapshot.value))) {
        throw new Error("Paper account value history references invalid accounts or values.");
      }
    }

    const challengeRaw = data["@stocksense/paper_events_v1"];
    if (challengeRaw) {
      const challenge = parseStoredJson(challengeRaw, "Event Arena progress");
      if (!isRecord(challenge) || !Array.isArray(challenge.history)) {
        throw new Error("Event Arena progress is invalid.");
      }
      for (const enrollment of [challenge.enrollment, challenge.lightningEnrollment]) {
        if (enrollment === undefined || enrollment === null) continue;
        if (!isRecord(enrollment) || typeof enrollment.eventId !== "string"
          || typeof enrollment.accountId !== "string" || !accountIds.has(enrollment.accountId)
          || !Number.isFinite(enrollment.eventStartAtMs) || !Number.isFinite(enrollment.eventEndAtMs)
          || !Number.isFinite(enrollment.joinedAtMs)
          || !(enrollment.startEquity === null
            || (typeof enrollment.startEquity === "number" && Number.isFinite(enrollment.startEquity)))) {
          throw new Error("An Event Arena enrollment does not match its saved account.");
        }
      }
      const eventIds = new Set<string>();
      for (const summary of challenge.history) {
        if (!isRecord(summary) || typeof summary.eventId !== "string" || eventIds.has(summary.eventId)
          || typeof summary.accountId !== "string" || !Number.isFinite(summary.startEquity)
          || !Number.isFinite(summary.endEquity) || !Number.isFinite(summary.completedAtMs)) {
          throw new Error("Event Arena history contains an invalid or duplicate summary.");
        }
        eventIds.add(summary.eventId);
      }
    }
  }

  if (entry.id === "portfolio-history" && data["@stocksense/portfolio_trades_v1"]) {
    const trades = parseStoredJson(data["@stocksense/portfolio_trades_v1"], "Portfolio trade history");
    if (!Array.isArray(trades) || trades.length > 50_000) throw new Error("Portfolio trade history is invalid.");
    const ids = new Set<string>();
    for (const trade of trades) {
      if (!isRecord(trade) || typeof trade.id !== "string" || ids.has(trade.id)
        || (trade.type !== "buy" && trade.type !== "sell")
        || typeof trade.symbol !== "string"
        || typeof trade.shares !== "number" || !Number.isFinite(trade.shares)
        || typeof trade.pricePerShare !== "number" || !Number.isFinite(trade.pricePerShare)
        || typeof trade.date !== "string" || !Number.isFinite(Date.parse(trade.date))) {
        throw new Error("Portfolio trade history contains an invalid or duplicate trade.");
      }
      ids.add(trade.id);
    }
  }

  if (entry.id === "watchlist" && data["@stocksense/watchlist_v1/__guest__"]) {
    const items = parseStoredJson(data["@stocksense/watchlist_v1/__guest__"], "Watchlist");
    if (!Array.isArray(items) || items.length > 500) throw new Error("The saved watchlist is invalid.");
    const symbols = new Set<string>();
    for (const item of items) {
      if (!isRecord(item) || typeof item.symbol !== "string" || !item.symbol.trim()
        || typeof item.createdAt !== "string" || !Number.isFinite(Date.parse(item.createdAt))
        || symbols.has(item.symbol)) throw new Error("The saved watchlist contains an invalid item.");
      symbols.add(item.symbol);
    }
  }

  if (entry.id === "price-alerts" && data["@stocksense/price_alerts_v1"]) {
    const alerts = parseStoredJson(data["@stocksense/price_alerts_v1"], "Price alerts");
    if (!Array.isArray(alerts) || alerts.length > 500) throw new Error("Saved price alerts are invalid.");
    const ids = new Set<string>();
    for (const alert of alerts) {
      const allowedKeys = ["id", "symbol", "direction", "targetPrice", "createdAt", "firedAt", "paused"];
      if (!isRecord(alert) || Object.keys(alert).some((key) => !allowedKeys.includes(key))
        || typeof alert.id !== "string" || !alert.id.trim() || alert.id.length > 128 || ids.has(alert.id)
        || typeof alert.symbol !== "string" || !/^[A-Z0-9.^=-]{1,12}$/.test(alert.symbol)
        || (alert.direction !== "above" && alert.direction !== "below")
        || typeof alert.targetPrice !== "number" || !Number.isFinite(alert.targetPrice) || alert.targetPrice <= 0
        || typeof alert.createdAt !== "string" || !Number.isFinite(Date.parse(alert.createdAt))
        || !(alert.firedAt === null || (typeof alert.firedAt === "string" && Number.isFinite(Date.parse(alert.firedAt))))
        || typeof alert.paused !== "boolean") {
        throw new Error("Saved price alerts contain invalid data or device credentials.");
      }
      ids.add(alert.id);
    }
  }

  if (entry.id === "custom-heat-map" && data["meisner.heat-map.custom-symbols.v1"]) {
    const symbols = parseStoredJson(data["meisner.heat-map.custom-symbols.v1"], "Custom heat map");
    if (!Array.isArray(symbols) || symbols.length > 40
      || symbols.some((symbol) => typeof symbol !== "string" || !symbol.trim())
      || new Set(symbols).size !== symbols.length) {
      throw new Error("The custom heat map contains invalid or repeated symbols.");
    }
  }

  if (entry.id === "achievements") {
    const knownAchievements = new Set([
      "first-quote", "quote-10", "quote-25", "quote-50", "quote-100", "first-paper-order",
      "first-paper-limit", "first-paper-sell", "first-custom-instrument", "custom-map-5",
      "custom-map-10", "first-watchlist", "watchlist-5", "first-price-alert", "first-analysis",
    ]);
    const rawAchievements = data["@meisnermethod/achievements_v1"];
    if (rawAchievements) {
      const ids = parseStoredJson(rawAchievements, "Achievements");
      if (!Array.isArray(ids) || ids.some((id) => typeof id !== "string" || !knownAchievements.has(id))) {
        throw new Error("Saved achievement IDs are invalid.");
      }
    }
    const count = data["@meisnermethod/analyze_search_count_v1"];
    if (count !== undefined && (!/^\d+$/.test(count) || !Number.isSafeInteger(Number(count)))) {
      throw new Error("Analyze progress is invalid.");
    }
    const flag = data["@meisnermethod/premium_flag_badge_v1"];
    if (flag !== undefined && !["default", "heritage", "liberty", "founders", "midnight", "southern-cross", "eagle"].includes(flag)) {
      throw new Error("The selected premium flag is invalid.");
    }
  }

  if (entry.id === "theme-and-brew-progress") {
    for (const key of ["@stocksense/facts_read_v1", "@stocksense/biden_quotes_viewed_v1",
      "@stocksense/brew_tokens_v1", "@stocksense/brew_bank_keys_v1", "@stocksense/dark_brew_tokens_v1",
      "@stocksense/quick_revive_bottles_v1", "@stocksense/daiquiri_bottles_v1",
      "@stocksense/stamin_up_bottles_v1", "@stocksense/smart_pro_bottles_v1"]) {
      const value = data[key];
      if (value !== undefined && (!/^\d+$/.test(value) || !Number.isSafeInteger(Number(value)))) {
        throw new Error(`${key} must be a non-negative whole number.`);
      }
    }
    const snapshotRaw = data["@stocksense/brew_economy_snapshot_v1"];
    if (snapshotRaw) {
      const snapshot = parseStoredJson(snapshotRaw, "Brew Bank progress");
      if (!isRecord(snapshot) || snapshot.version !== 1
        || !Number.isSafeInteger(snapshot.quotesViewed) || (snapshot.quotesViewed as number) < 0
        || !Number.isSafeInteger(snapshot.brewTokens) || (snapshot.brewTokens as number) < 0
        || !Array.isArray(snapshot.activityLog) || !Array.isArray(snapshot.claimedQuoteViewIds)) {
        throw new Error("Brew Bank progress is invalid or uses an unsupported version.");
      }
    }
    for (const key of ["@stocksense/american_mode_unlocked_v1", "@stocksense/american_mode_v1",
      "@stocksense/brew_bank_unlocked_v1", "@stocksense/brew_sound_enabled_v1",
      "@stocksense/brew_haptics_enabled_v1", "@stocksense/quick_revive_unlocked_v1",
      "@stocksense/quick_revive_armed_v1", "@stocksense/daiquiri_unlocked_v1",
      "@stocksense/daiquiri_armed_v1", "@stocksense/stamin_up_unlocked_v1",
      "@stocksense/stamin_up_armed_v1", "@stocksense/smart_pro_unlocked_v1"]) {
      const value = data[key];
      if (value !== undefined && value !== "true" && value !== "false") {
        throw new Error(`${key} is not a recognized preference.`);
      }
    }
    for (const key of ["@stocksense/brew_bank_access_expires_v1", "@stocksense/smart_pro_sale_expires_v1"]) {
      const value = data[key];
      if (value !== undefined && (!/^\d+$/.test(value) || !Number.isSafeInteger(Number(value)))) {
        throw new Error(`${key} is not a valid saved expiration.`);
      }
    }
  }

  if (entry.id === "research-and-comparisons") {
    const pinnedSymbol = data["@stocksense/pinned_comp_symbol"];
    if (pinnedSymbol !== undefined && !/^[A-Z0-9.^=-]{1,12}$/.test(pinnedSymbol)) {
      throw new Error("The pinned comparison symbol is invalid.");
    }
    const hidden = data["@stocksense/etf_score_card_hidden_v1"];
    if (hidden !== undefined && hidden !== "true" && hidden !== "false") {
      throw new Error("The saved ETF card preference is invalid.");
    }
    const cadence = data["@stocksense/etf_contribution_cadence_v1"];
    if (cadence !== undefined && !["weekly", "monthly", "quarterly"].includes(cadence)) {
      throw new Error("The saved ETF contribution schedule is invalid.");
    }
  }

  if (entry.id === "saved-display-preferences") {
    for (const key of Object.keys(data)) {
      const value = data[key];
      if (key === "@stocksense/paper_events_notifications_v1") {
        if (value !== "true" && value !== "false") throw new Error("Event reminder preference is invalid.");
      } else if (key === "@meisnermethod/app_review_state_v1") {
        const state = parseStoredJson(value, "App review progress");
        if (!isRecord(state)
          || !(state.firstSuccessfulAnalysisAt === null
            || (Number.isSafeInteger(state.firstSuccessfulAnalysisAt) && (state.firstSuccessfulAnalysisAt as number) >= 0))
          || !Array.isArray(state.successfulAnalysisDays)
          || state.successfulAnalysisDays.some((day) => typeof day !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(day))
          || !(state.lastRequestAttemptAt === null
            || (Number.isSafeInteger(state.lastRequestAttemptAt) && (state.lastRequestAttemptAt as number) >= 0))) {
          throw new Error("Saved app review progress is invalid.");
        }
      } else if (key === "@stocksense/grade_history_hint_shown_v2") {
        if (value !== "true" && value !== "false") throw new Error("The saved grade-history preference is invalid.");
      } else if (key.startsWith("@stocksense/paper_event_live_notice_dismissal_v1:")) {
        if (value !== "dismissed" && value !== "true" && value !== "false" && value !== "1" && value !== "0") {
          throw new Error("A saved event display preference is invalid.");
        }
      } else if (value !== "0" && value !== "1") {
        throw new Error("A saved display preference is invalid.");
      }
    }
  }
}

/** Strict allowlist and shape validation used by both API and mobile code. */
export function validateDeviceTransferBundle(value: unknown): ValidatedDeviceTransferBundle {
  if (!isRecord(value) || value.version !== DEVICE_TRANSFER_MANIFEST_VERSION
    || typeof value.bundleId !== "string" || value.bundleId.length < 8 || value.bundleId.length > 128
    || typeof value.exportedAt !== "string" || !Number.isFinite(Date.parse(value.exportedAt))
    || !Array.isArray(value.categories) || value.categories.length > DEVICE_TRANSFER_CATEGORIES.length) {
    throw new Error("The device transfer bundle is invalid or unsupported.");
  }
  const ids = new Set<string>();
  const categories = value.categories.map((category) => {
    if (!isRecord(category) || typeof category.id !== "string" || !PORTABLE_IDS.has(category.id)
      || ids.has(category.id) || typeof category.version !== "number" || !Number.isInteger(category.version)
      || !isRecord(category.data) || Object.keys(category.data).length > MAX_CATEGORY_KEYS) {
      throw new Error("The device transfer bundle contains an invalid category.");
    }
    const entry = categoryForKey(category.id)!;
    if (category.version !== entry.version) throw new Error(`${entry.label} uses an unsupported version.`);
    const data: Record<string, string> = {};
    for (const [key, raw] of Object.entries(category.data)) {
      if (typeof raw !== "string") throw new Error(`${entry.label} contains an invalid saved value.`);
      data[key] = raw;
    }
    validateCategoryData(entry, data);
    ids.add(category.id);
    return { id: category.id as DeviceTransferCategoryId, version: category.version, data };
  });
  const bundle = {
    version: DEVICE_TRANSFER_MANIFEST_VERSION,
    bundleId: value.bundleId,
    exportedAt: value.exportedAt,
    categories,
  } as ValidatedDeviceTransferBundle;
  if (JSON.stringify(bundle).length > MAX_BUNDLE_BYTES) throw new Error("The device transfer bundle is too large.");
  return bundle;
}
