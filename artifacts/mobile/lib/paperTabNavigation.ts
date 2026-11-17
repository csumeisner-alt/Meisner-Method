export type PaperTabNavigationAction = 'none' | 'push' | 'navigate' | 'replace';

/**
 * Keep the Paper Trading route underneath the other app tabs so its account
 * and view state remain mounted while the user visits another screen.
 */
export function getPaperTabNavigationAction(
  currentTab: string,
  targetTab: string,
): PaperTabNavigationAction {
  if (currentTab === targetTab) return 'none';
  if (currentTab === '/paper') return 'push';
  if (targetTab === '/paper') return 'navigate';
  return 'replace';
}
