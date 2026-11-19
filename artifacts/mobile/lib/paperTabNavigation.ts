export type PaperTabNavigationAction = 'none' | 'push' | 'navigate' | 'replace';

/**
 * Main tabs use a stable Stack route ID and push to it. Expo Router moves an
 * existing route with that ID to the front instead of replacing or duplicating
 * it, so every visited tab keeps its mounted state.
 */
export function getPaperTabNavigationAction(
  currentTab: string,
  targetTab: string,
): PaperTabNavigationAction {
  if (currentTab === targetTab) return 'none';
  return 'push';
}
