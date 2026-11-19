/**
 * Installed clients may reach a backend from before split detail routes existed.
 * Only a missing route permits the established info endpoint; provider failures
 * must remain errors, not be disguised as missing statistics.
 */
export async function requestHeatMapSummary<T>(
  summary: () => Promise<T>,
  legacyInfo: () => Promise<T>,
): Promise<T> {
  try {
    return await summary();
  } catch (error) {
    if (!error || typeof error !== 'object' || !('status' in error) || error.status !== 404) throw error;
    return legacyInfo();
  }
}
