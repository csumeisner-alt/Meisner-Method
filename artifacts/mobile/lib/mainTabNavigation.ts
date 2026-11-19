import { getPaperTabNavigationAction } from './paperTabNavigation.ts';

export const MAIN_TAB_ROUTES = ['/', '/picks', '/paper', '/portfolio', '/event-arena'] as const;

export type MainTabRoute = (typeof MAIN_TAB_ROUTES)[number];
export type MainTabSwipeDirection = 'left' | 'right';

const SWIPE_START_DEAD_ZONE = 18;
const SWIPE_DIRECTION_RATIO = 1.25;
const SWIPE_DISTANCE = 64;
const FAST_SWIPE_DISTANCE = 40;
const FAST_SWIPE_VELOCITY = 0.45;

export function getCurrentMainTabPath(pathname: string): MainTabRoute {
  if (pathname === '/' || pathname === '') return '/';
  if (pathname.startsWith('/picks')) return '/picks';
  if (pathname === '/paper') return '/paper';
  if (pathname === '/portfolio') return '/portfolio';
  if (pathname === '/event-arena') return '/event-arena';
  return '/';
}

export function getMainTabSwipeIntent(dx: number, dy: number): MainTabSwipeDirection | null {
  const horizontalDistance = Math.abs(dx);
  if (
    horizontalDistance < SWIPE_START_DEAD_ZONE
    || horizontalDistance <= Math.abs(dy) * SWIPE_DIRECTION_RATIO
  ) return null;
  return dx < 0 ? 'left' : 'right';
}

export function getCommittedMainTabSwipeDirection(
  dx: number,
  dy: number,
  velocityX: number,
): MainTabSwipeDirection | null {
  const intent = getMainTabSwipeIntent(dx, dy);
  if (!intent) return null;

  const horizontalDistance = Math.abs(dx);
  const committed = horizontalDistance >= SWIPE_DISTANCE
    || (horizontalDistance >= FAST_SWIPE_DISTANCE && Math.abs(velocityX) >= FAST_SWIPE_VELOCITY);
  return committed ? intent : null;
}

export function getMainTabSwipeTarget(
  pathname: string,
  direction: MainTabSwipeDirection,
): MainTabRoute | null {
  const currentIndex = MAIN_TAB_ROUTES.indexOf(pathname as MainTabRoute);
  if (currentIndex < 0) return null;
  const targetIndex = currentIndex + (direction === 'left' ? 1 : -1);
  return MAIN_TAB_ROUTES[targetIndex] ?? null;
}

export function getMainTabNavigationPlan(
  currentPathname: string,
  targetPath: MainTabRoute,
) {
  const currentTab = getCurrentMainTabPath(currentPathname);
  if (currentTab === targetPath) return null;

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
