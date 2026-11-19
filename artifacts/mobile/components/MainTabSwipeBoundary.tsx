import React, { useMemo, useRef } from 'react';
import { PanResponder, View } from 'react-native';
import { usePathname, useRouter } from 'expo-router';
import {
  getCommittedMainTabSwipeDirection,
  getMainTabNavigationPlan,
  getMainTabSwipeIntent,
  getMainTabSwipeTarget,
  type MainTabRoute,
} from '@/lib/mainTabNavigation';

interface MainTabSwipeSurfaceProps extends React.PropsWithChildren {
  pathname: string;
  onNavigate: (target: MainTabRoute) => void;
}

export function MainTabSwipeSurface({ pathname, onNavigate, children }: MainTabSwipeSurfaceProps) {
  const latest = useRef({ pathname, onNavigate });
  latest.current = { pathname, onNavigate };

  const responder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => false,
    onMoveShouldSetPanResponder: (_event, gesture) => {
      const current = latest.current;
      const intent = getMainTabSwipeIntent(gesture.dx, gesture.dy);
      return !!intent && getMainTabSwipeTarget(current.pathname, intent) !== null;
    },
    onPanResponderTerminationRequest: (_event, gesture) =>
      Math.abs(gesture.dy) > Math.abs(gesture.dx) * 1.25,
    onPanResponderRelease: (_event, gesture) => {
      const current = latest.current;
      const direction = getCommittedMainTabSwipeDirection(gesture.dx, gesture.dy, gesture.vx);
      if (!direction) return;
      const target = getMainTabSwipeTarget(current.pathname, direction);
      if (target) current.onNavigate(target);
    },
  }), []);

  return (
    <View
      testID="main-tab-swipe-boundary"
      collapsable={false}
      style={{ flex: 1 }}
      {...responder.panHandlers}
    >
      {children}
    </View>
  );
}

export function MainTabSwipeBoundary({ children }: React.PropsWithChildren) {
  const pathname = usePathname();
  const router = useRouter();

  return (
    <MainTabSwipeSurface
      pathname={pathname}
      onNavigate={(target) => {
        const plan = getMainTabNavigationPlan(pathname, target);
        if (!plan || plan.action === 'none') return;
        if (plan.action === 'push') router.push(plan.href);
        else if (plan.action === 'navigate') router.navigate(plan.href);
        else router.replace(plan.href);
      }}
    >
      {children}
    </MainTabSwipeSurface>
  );
}
