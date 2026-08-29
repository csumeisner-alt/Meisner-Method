import {
  BREW_TOKEN_QUOTE_THRESHOLD,
  INITIAL_BREW_TOKENS,
  parseStoredNonNegative,
} from './brewTokenLogic.ts';

export const BREW_ECONOMY_SNAPSHOT_KEY = '@stocksense/brew_economy_snapshot_v1';
export const BREW_ECONOMY_SNAPSHOT_VERSION = 1 as const;

export type BrewActivityKind = 'quote' | 'unlock' | 'purchase' | 'redeem' | 'toss' | 'bank' | 'theme';

export type BrewActivityEntry = {
  id: string;
  kind: BrewActivityKind;
  label: string;
  detail: string;
  createdAt: number;
};

export type BrewEconomySnapshot = {
  version: typeof BREW_ECONOMY_SNAPSHOT_VERSION;
  quotesViewed: number;
  isUnlocked: boolean;
  brewTokens: number;
  bankKeys: number;
  bankAccessExpiresAt: number | null;
  quickReviveUnlocked: boolean;
  quickReviveBottles: number;
  quickReviveArmed: boolean;
  daiquiriUnlocked: boolean;
  daiquiriBottles: number;
  daiquiriArmed: boolean;
  staminUpUnlocked: boolean;
  staminUpBottles: number;
  staminUpArmed: boolean;
  smartProUnlocked: boolean;
  smartProBottles: number;
  smartProSaleExpiresAt: number | null;
  darkBrewTokens: number;
  neonGucciActive: boolean;
  claimedQuoteViewIds: string[];
  activityLog: BrewActivityEntry[];
};

export type LegacyBrewEconomyStorage = {
  rawQuotes: string | null;
  rawUnlocked: string | null;
  rawTokens: string | null;
  rawKeys: string | null;
  rawAccessExpires: string | null;
  rawQuickReviveUnlocked: string | null;
  rawQuickReviveBottles: string | null;
  rawQuickReviveArmed: string | null;
  rawDaiquiriUnlocked: string | null;
  rawDaiquiriBottles: string | null;
  rawDaiquiriArmed: string | null;
  rawStaminUpUnlocked: string | null;
  rawStaminUpBottles: string | null;
  rawStaminUpArmed: string | null;
  rawSmartProUnlocked: string | null;
  rawSmartProBottles: string | null;
  rawSmartProSaleExpires: string | null;
  rawDarkBrewTokens: string | null;
};

export type BrewEconomySnapshotStorage = {
  setItem: (key: string, value: string) => Promise<void>;
  getItem: (key: string) => Promise<string | null>;
};

type BrewEconomySnapshotInput = Omit<BrewEconomySnapshot, 'version' | 'neonGucciActive' | 'activityLog'> & {
  neonGucciActive?: boolean;
  activityLog?: BrewActivityEntry[];
};

function normalizeNonNegative(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 0;
  return Math.max(0, Math.floor(value));
}

function normalizeExpiry(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return null;
  return value;
}

function normalizeClaims(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((id): id is string => typeof id === 'string' && id.length > 0))];
}

function normalizeActivityLog(value: unknown): BrewActivityEntry[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((entry): entry is BrewActivityEntry => (
      isRecord(entry)
      && typeof entry.id === 'string'
      && typeof entry.kind === 'string'
      && typeof entry.label === 'string'
      && typeof entry.detail === 'string'
      && typeof entry.createdAt === 'number'
      && Number.isFinite(entry.createdAt)
    ))
    .slice(-40);
}

export function createBrewEconomySnapshot(input: BrewEconomySnapshotInput): BrewEconomySnapshot {
  const isUnlocked = input.isUnlocked === true || input.quotesViewed >= BREW_TOKEN_QUOTE_THRESHOLD;
  const quickReviveUnlocked = input.quickReviveUnlocked === true;
  const daiquiriUnlocked = input.daiquiriUnlocked === true;
  const staminUpUnlocked = input.staminUpUnlocked === true;
  const smartProUnlocked = input.smartProUnlocked === true;

  return {
    version: BREW_ECONOMY_SNAPSHOT_VERSION,
    quotesViewed: normalizeNonNegative(input.quotesViewed),
    isUnlocked,
    brewTokens: isUnlocked ? normalizeNonNegative(input.brewTokens) : 0,
    bankKeys: normalizeNonNegative(input.bankKeys),
    bankAccessExpiresAt: normalizeExpiry(input.bankAccessExpiresAt),
    quickReviveUnlocked,
    quickReviveBottles: quickReviveUnlocked ? normalizeNonNegative(input.quickReviveBottles) : 0,
    quickReviveArmed: quickReviveUnlocked && input.quickReviveArmed === true,
    daiquiriUnlocked,
    daiquiriBottles: daiquiriUnlocked ? normalizeNonNegative(input.daiquiriBottles) : 0,
    daiquiriArmed: daiquiriUnlocked && input.daiquiriArmed === true,
    staminUpUnlocked,
    staminUpBottles: staminUpUnlocked ? normalizeNonNegative(input.staminUpBottles) : 0,
    staminUpArmed: staminUpUnlocked && input.staminUpArmed === true,
    smartProUnlocked,
    smartProBottles: smartProUnlocked ? normalizeNonNegative(input.smartProBottles) : 0,
    smartProSaleExpiresAt: normalizeExpiry(input.smartProSaleExpiresAt),
    darkBrewTokens: normalizeNonNegative(input.darkBrewTokens),
    neonGucciActive: input.neonGucciActive === true,
    claimedQuoteViewIds: normalizeClaims(input.claimedQuoteViewIds),
    activityLog: normalizeActivityLog(input.activityLog),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasRequiredSnapshotFields(value: Record<string, unknown>): boolean {
  const requiredNumbers = [
    'quotesViewed',
    'brewTokens',
    'bankKeys',
    'quickReviveBottles',
    'daiquiriBottles',
    'staminUpBottles',
    'smartProBottles',
    'darkBrewTokens',
  ];
  const requiredBooleans = [
    'isUnlocked',
    'quickReviveUnlocked',
    'quickReviveArmed',
    'daiquiriUnlocked',
    'daiquiriArmed',
    'staminUpUnlocked',
    'staminUpArmed',
    'smartProUnlocked',
  ];

  return requiredNumbers.every((key) => typeof value[key] === 'number' && Number.isFinite(value[key]))
    && requiredBooleans.every((key) => typeof value[key] === 'boolean');
}

export function parseBrewEconomySnapshot(raw: string | null | undefined): BrewEconomySnapshot | null {
  if (!raw) return null;

  try {
    const parsed: unknown = JSON.parse(raw);
    if (!isRecord(parsed) || parsed.version !== BREW_ECONOMY_SNAPSHOT_VERSION || !hasRequiredSnapshotFields(parsed)) {
      return null;
    }

    return createBrewEconomySnapshot({
      quotesViewed: parsed.quotesViewed as number,
      isUnlocked: parsed.isUnlocked as boolean,
      brewTokens: parsed.brewTokens as number,
      bankKeys: parsed.bankKeys as number,
      bankAccessExpiresAt: parsed.bankAccessExpiresAt as number | null,
      quickReviveUnlocked: parsed.quickReviveUnlocked as boolean,
      quickReviveBottles: parsed.quickReviveBottles as number,
      quickReviveArmed: parsed.quickReviveArmed as boolean,
      daiquiriUnlocked: parsed.daiquiriUnlocked as boolean,
      daiquiriBottles: parsed.daiquiriBottles as number,
      daiquiriArmed: parsed.daiquiriArmed as boolean,
      staminUpUnlocked: parsed.staminUpUnlocked as boolean,
      staminUpBottles: parsed.staminUpBottles as number,
      staminUpArmed: parsed.staminUpArmed as boolean,
      smartProUnlocked: parsed.smartProUnlocked as boolean,
      smartProBottles: parsed.smartProBottles as number,
      smartProSaleExpiresAt: parsed.smartProSaleExpiresAt as number | null,
      darkBrewTokens: parsed.darkBrewTokens as number,
      neonGucciActive: parsed.neonGucciActive === true,
      claimedQuoteViewIds: normalizeClaims(parsed.claimedQuoteViewIds),
      activityLog: normalizeActivityLog(parsed.activityLog),
    });
  } catch {
    return null;
  }
}

export function serializeBrewEconomySnapshot(snapshot: BrewEconomySnapshot): string {
  return JSON.stringify(snapshot);
}

export async function persistBrewEconomySnapshot(
  storage: BrewEconomySnapshotStorage,
  snapshot: BrewEconomySnapshot,
): Promise<boolean> {
  const serialized = serializeBrewEconomySnapshot(snapshot);
  try {
    await storage.setItem(BREW_ECONOMY_SNAPSHOT_KEY, serialized);
    return true;
  } catch {
    try {
      return (await storage.getItem(BREW_ECONOMY_SNAPSHOT_KEY)) === serialized;
    } catch {
      return false;
    }
  }
}

export function migrateLegacyBrewEconomy(raw: LegacyBrewEconomyStorage): BrewEconomySnapshot {
  const quotesViewed = parseStoredNonNegative(raw.rawQuotes);
  const isUnlocked = quotesViewed >= BREW_TOKEN_QUOTE_THRESHOLD || raw.rawUnlocked === 'true';
  const quickReviveUnlocked = raw.rawQuickReviveUnlocked === 'true';
  const daiquiriUnlocked = raw.rawDaiquiriUnlocked === 'true';
  const staminUpUnlocked = raw.rawStaminUpUnlocked === 'true';
  const smartProUnlocked = raw.rawSmartProUnlocked === 'true';
  const parsedAccessExpires = raw.rawAccessExpires == null ? null : Number(raw.rawAccessExpires);
  const parsedSmartProExpires = raw.rawSmartProSaleExpires == null ? null : Number(raw.rawSmartProSaleExpires);

  return createBrewEconomySnapshot({
    quotesViewed,
    isUnlocked,
    brewTokens: isUnlocked
      ? raw.rawTokens == null ? INITIAL_BREW_TOKENS : parseStoredNonNegative(raw.rawTokens)
      : 0,
    bankKeys: parseStoredNonNegative(raw.rawKeys),
    bankAccessExpiresAt: parsedAccessExpires,
    quickReviveUnlocked,
    quickReviveBottles: parseStoredNonNegative(raw.rawQuickReviveBottles),
    quickReviveArmed: quickReviveUnlocked && raw.rawQuickReviveArmed === 'true',
    daiquiriUnlocked,
    daiquiriBottles: parseStoredNonNegative(raw.rawDaiquiriBottles),
    daiquiriArmed: daiquiriUnlocked && raw.rawDaiquiriArmed === 'true',
    staminUpUnlocked,
    staminUpBottles: parseStoredNonNegative(raw.rawStaminUpBottles),
    staminUpArmed: staminUpUnlocked && raw.rawStaminUpArmed === 'true',
    smartProUnlocked,
    smartProBottles: parseStoredNonNegative(raw.rawSmartProBottles),
    smartProSaleExpiresAt: parsedSmartProExpires,
    darkBrewTokens: parseStoredNonNegative(raw.rawDarkBrewTokens),
    neonGucciActive: false,
    claimedQuoteViewIds: [],
    activityLog: [],
  });
}