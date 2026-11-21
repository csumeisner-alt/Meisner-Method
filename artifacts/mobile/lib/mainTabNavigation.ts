import { getPaperTabNavigationAction } from './paperTabNavigation.ts';

export const MAIN_TAB_ROUTES = ['/', '/picks', '/paper', '/portfolio', '/event-arena'] as const;

export type MainTabRoute = (typeof MAIN_TAB_ROUTES)[number];

export function getCurrentMainTabPath(pathname: string): MainTabRoute {
  if (pathname === '/' || pathname === '') return '/';
  if (pathname.startsWith('/picks')) return '/picks';
  if (pathname === '/paper') return '/paper';
  if (pathname === '/portfolio') return '/portfolio';
  if (pathname === '/event-arena') return '/event-arena';
  return '/';
}

export function getMainTabNavigationPlan(
  currentPathname: string,
  targetPath: MainTabRoute,
) {
  const currentTab = getCurrentMainTabPath(currentPathname);
  if (currentTab === targetPath) {
    if (currentPathname === targetPath || (currentPathname === '' && targetPath === '/')) return null;
    return { action: 'dismiss' as const, href: targetPath };
  }

  const currentIndex = MAIN_TAB_ROUTES.indexOf(currentTab);
  const targetIndex = MAIN_TAB_ROUTES.indexOf(targetPath);
  return {
    action: getPaperTabNavigationAction(currentTab, targetPath),
    href: {
      pathname: targetPath,
      params: { transition: targetIndex < currentIndex ? 'left' as const : 'right' as const },
    },
  };
}
