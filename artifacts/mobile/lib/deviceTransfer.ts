import {
  DEVICE_TRANSFER_CATEGORIES,
  DEVICE_TRANSFER_MANIFEST,
  DEVICE_TRANSFER_MANIFEST_VERSION,
  validateDeviceTransferBundle,
  type ValidatedDeviceTransferBundle,
  type DeviceTransferCategoryId,
} from "../../../lib/api-zod/src/deviceTransferManifest.ts";

export const DEVICE_TRANSFER_DESTINATION_KEY = "@meisnermethod/device_transfer_destination_v1";
export const DEVICE_TRANSFER_JOURNAL_KEY = "@meisnermethod/device_transfer_journal_v1";

export type DeviceTransferStorage = {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
  getAllKeys?(): Promise<readonly string[]>;
};

export type DeviceTransferCategoryResult = {
  id: string;
  label: string;
  status: "restored" | "unchanged" | "skipped" | "failed";
  reason: string;
};

function addNonPortableResults(results: DeviceTransferCategoryResult[]): DeviceTransferCategoryResult[] {
  return [
    ...results,
    ...DEVICE_TRANSFER_MANIFEST
      .filter((entry) => entry.portability !== "portable")
      .map((entry) => ({
        id: entry.id,
        label: entry.label,
        status: entry.portability === "server-managed" ? "unchanged" as const : "skipped" as const,
        reason: entry.portability === "server-managed"
          ? "This data stays with the signed-in account and is available after signing in."
          : entry.portability === "rebuildable"
            ? "This phone will fetch fresh market data."
            : entry.portability === "device-bound"
              ? "This phone must register its own notification permissions and push token."
              : "Device pairing credentials are intentionally not copied.",
      })),
  ];
}

export type DeviceTransferPreview = {
  bundle: ValidatedDeviceTransferBundle;
  categories: Array<{
    id: DeviceTransferCategoryId;
    label: string;
    status: "ready" | "unchanged" | "conflict";
    reason: string;
    destinationFingerprint: string;
  }>;
};

export function hasDeviceTransferDestinationChanged(
  reviewed: DeviceTransferPreview,
  current: DeviceTransferPreview,
): boolean {
  if (reviewed.bundle.bundleId !== current.bundle.bundleId) return true;
  return reviewed.categories.some((category) =>
    current.categories.find((item) => item.id === category.id)?.destinationFingerprint
      !== category.destinationFingerprint,
  );
}

export function replaceDeviceTransferCategoryData(
  bundle: ValidatedDeviceTransferBundle,
  categoryId: DeviceTransferCategoryId,
  data: Record<string, string>,
): ValidatedDeviceTransferBundle {
  return validateDeviceTransferBundle({
    ...bundle,
    categories: bundle.categories.map((category) =>
      category.id === categoryId ? { ...category, data } : category,
    ),
  });
}

function categoryKeys(
  category: (typeof DEVICE_TRANSFER_CATEGORIES)[number],
  allKeys: readonly string[],
): string[] {
  const matchingDynamicKeys = allKeys.filter((key) =>
    category.keyPrefixes?.some((prefix) => key.startsWith(prefix)),
  );
  return [...new Set([...(category.keys ?? []), ...matchingDynamicKeys])];
}

function stableStoredValue(value: string): string {
  try {
    const parsed: unknown = JSON.parse(value);
    const stable = (item: unknown): unknown => {
      if (Array.isArray(item)) return item.map(stable);
      if (item && typeof item === "object") {
        return Object.fromEntries(Object.entries(item as Record<string, unknown>)
          .sort(([left], [right]) => left.localeCompare(right))
          .map(([key, child]) => [key, stable(child)]));
      }
      return item;
    };
    return JSON.stringify(stable(parsed));
  } catch {
    return value;
  }
}

export async function createDeviceTransferBundle(
  storage: DeviceTransferStorage,
  bundleId: string,
  exportedAt = new Date().toISOString(),
): Promise<ValidatedDeviceTransferBundle> {
  await recoverInterruptedDeviceTransfer(storage);
  const allKeys = await storage.getAllKeys?.() ?? [];
  const categories = await Promise.all(DEVICE_TRANSFER_CATEGORIES.map(async (category) => {
    const keys = categoryKeys(category, allKeys);
    const values = await Promise.all(keys.map(async (key) => [key, await storage.getItem(key)] as const));
    return {
      id: category.id,
      version: category.version,
      data: Object.fromEntries(values.filter((entry): entry is readonly [string, string] => entry[1] !== null)),
    };
  }));
  return validateDeviceTransferBundle({
    version: DEVICE_TRANSFER_MANIFEST_VERSION,
    bundleId,
    exportedAt,
    categories,
  });
}

export async function preflightDeviceTransfer(
  storage: DeviceTransferStorage,
  incoming: unknown,
): Promise<DeviceTransferPreview> {
  await recoverInterruptedDeviceTransfer(storage);
  const bundle = validateDeviceTransferBundle(incoming);
  const allKeys = await storage.getAllKeys?.() ?? [];
  const sourceById = new Map(bundle.categories.map((category) => [category.id, category]));
  const categories = await Promise.all(DEVICE_TRANSFER_CATEGORIES.map(async (manifestEntry) => {
    const source = sourceById.get(manifestEntry.id);
    const data = source?.data ?? {};
    const localKeys = categoryKeys(manifestEntry, allKeys);
    const local = Object.fromEntries(await Promise.all(
      localKeys.map(async (key) => [key, await storage.getItem(key)] as const),
    ).then((entries) => entries.filter((entry): entry is readonly [string, string] => entry[1] !== null)));
    const destinationFingerprint = stableStoredValue(JSON.stringify(local));
    if (Object.keys(data).length === 0) {
      return {
        id: manifestEntry.id,
        label: manifestEntry.label,
        status: "unchanged" as const,
        reason: "The source phone had no saved data in this category.",
        destinationFingerprint,
      };
    }
    const sourceEntries = Object.entries(data);
    const exactMatch = sourceEntries.length === Object.keys(local).length
      && sourceEntries.every(([key, value]) =>
        local[key] !== undefined && stableStoredValue(local[key]!) === stableStoredValue(value),
      );
    if (exactMatch) {
      return {
        id: manifestEntry.id,
        label: manifestEntry.label,
        status: "unchanged" as const,
        reason: "This phone already has the same saved data.",
        destinationFingerprint,
      };
    }
    if (Object.keys(local).length > 0) {
      return {
        id: manifestEntry.id,
        label: manifestEntry.label,
        status: "conflict" as const,
        reason: "This phone already has different data. Choose whether to keep it or replace this category.",
        destinationFingerprint,
      };
    }
    return {
      id: manifestEntry.id,
      label: manifestEntry.label,
      status: "ready" as const,
      reason: "No saved data on this phone will be overwritten.",
      destinationFingerprint,
    };
  }));
  return { bundle, categories };
}

export async function recoverInterruptedDeviceTransfer(storage: DeviceTransferStorage): Promise<void> {
  const raw = await storage.getItem(DEVICE_TRANSFER_JOURNAL_KEY);
  if (!raw) return;
  let journal: { state?: string; before?: Array<{ key: string; value: string | null }> };
  try {
    journal = JSON.parse(raw) as typeof journal;
  } catch {
    throw new Error("A saved-data restore was interrupted and its recovery record is invalid. Your data was not changed again.");
  }
  if (journal.state !== "committed") {
    if (!Array.isArray(journal.before)) {
      throw new Error("A saved-data restore was interrupted and cannot be recovered safely.");
    }
    for (const item of journal.before) {
      if (!item || typeof item.key !== "string" || !(item.value === null || typeof item.value === "string")) {
        throw new Error("A saved-data restore was interrupted and cannot be recovered safely.");
      }
      if (item.value === null) await storage.removeItem(item.key);
      else await storage.setItem(item.key, item.value);
    }
  }
  await storage.removeItem(DEVICE_TRANSFER_JOURNAL_KEY);
}

/**
 * Re-checks all destination state immediately before writing. A journal lets a
 * later retry restore the original values if the app closes mid-import.
 */
export async function applyDeviceTransfer(
  storage: DeviceTransferStorage,
  incoming: unknown,
  choice: "keep-destination" | "replace-conflicts" | null,
  reviewedPreview?: DeviceTransferPreview,
): Promise<{ needsReview: boolean; preview: DeviceTransferPreview; results: DeviceTransferCategoryResult[] }> {
  const preview = await preflightDeviceTransfer(storage, incoming);
  if (reviewedPreview && hasDeviceTransferDestinationChanged(reviewedPreview, preview)) {
    return { needsReview: true, preview, results: [] };
  }
  const conflicts = preview.categories.filter((category) => category.status === "conflict");
  if (conflicts.length > 0 && choice === null) {
    return { needsReview: true, preview, results: [] };
  }

  const sourceById = new Map(preview.bundle.categories.map((category) => [category.id, category]));
  const chosen = preview.categories.filter((category) =>
    category.status === "ready" || (category.status === "conflict" && choice === "replace-conflicts"),
  );
  const skippedIds = new Set(preview.categories
    .filter((category) => category.status === "conflict" && choice === "keep-destination")
    .map((category) => category.id));
  if (chosen.length === 0) {
    return {
      needsReview: false,
      preview,
      results: addNonPortableResults(preview.categories.map((category) => ({
        id: category.id,
        label: category.label,
        status: category.status === "conflict" ? "skipped" : "unchanged",
        reason: category.status === "conflict"
          ? "Kept the data already on this phone."
          : category.reason,
      }))),
    };
  }

  const allKeys = await storage.getAllKeys?.() ?? [];
  const beforeEntries = new Map<string, string | null>();
  for (const category of chosen) {
    const manifestEntry = DEVICE_TRANSFER_CATEGORIES.find((entry) => entry.id === category.id)!;
    for (const key of categoryKeys(manifestEntry, allKeys)) {
      beforeEntries.set(key, await storage.getItem(key));
    }
    const source = sourceById.get(category.id);
    for (const [key, value] of Object.entries(source?.data ?? {})) {
      beforeEntries.set(key, beforeEntries.has(key) ? beforeEntries.get(key)! : await storage.getItem(key));
    }
  }

  const journal = JSON.stringify({
    bundleId: preview.bundle.bundleId,
    state: "applying",
    before: [...beforeEntries].map(([key, value]) => ({ key, value })),
  });
  await storage.setItem(DEVICE_TRANSFER_JOURNAL_KEY, journal);
  try {
    for (const category of chosen) {
      const manifestEntry = DEVICE_TRANSFER_CATEGORIES.find((entry) => entry.id === category.id)!;
      for (const key of categoryKeys(manifestEntry, allKeys)) await storage.removeItem(key);
      const source = sourceById.get(category.id);
      for (const [key, value] of Object.entries(source?.data ?? {})) await storage.setItem(key, value);
    }
    await storage.setItem(DEVICE_TRANSFER_JOURNAL_KEY, JSON.stringify({
      bundleId: preview.bundle.bundleId,
      state: "committed",
      before: [...beforeEntries].map(([key, value]) => ({ key, value })),
    }));
    await storage.removeItem(DEVICE_TRANSFER_JOURNAL_KEY).catch(() => {});
  } catch (error) {
    await recoverInterruptedDeviceTransfer(storage);
    const failure = error instanceof Error ? error.message : "Storage write failed.";
    return {
      needsReview: false,
      preview,
      results: addNonPortableResults(preview.categories.map((category) => ({
        id: category.id,
        label: category.label,
        status: category.status === "unchanged" ? "unchanged"
          : skippedIds.has(category.id) ? "skipped"
            : "failed",
        reason: category.status === "unchanged"
          ? category.reason
          : skippedIds.has(category.id)
            ? "Kept the data already on this phone."
            : `No data was imported because the safe restore failed: ${failure}`,
      }))),
    };
  }

  return {
    needsReview: false,
    preview,
    results: addNonPortableResults(preview.categories.map((category) => ({
      id: category.id,
      label: category.label,
      status: category.status === "unchanged" ? "unchanged"
        : skippedIds.has(category.id) ? "skipped"
          : "restored",
      reason: category.status === "unchanged"
        ? category.reason
        : skippedIds.has(category.id)
          ? "Kept the data already on this phone."
          : category.status === "conflict"
            ? "Replaced after your confirmation."
            : "Saved on this phone.",
    }))),
  };
}
