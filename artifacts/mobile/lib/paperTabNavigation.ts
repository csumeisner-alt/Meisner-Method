export type PaperTabNavigationAction = 'none' | 'navigate';

/**
 * Main screens belong to a real tab navigator. Selecting a tab changes its
 * active index without removing, reordering, or replacing mounted screens.
 */
export function getPaperTabNavigationAction(
  currentTab: string,
  targetTab: string,
): PaperTabNavigationAction {
  if (currentTab === targetTab) return 'none';
  return 'navigate';
}
