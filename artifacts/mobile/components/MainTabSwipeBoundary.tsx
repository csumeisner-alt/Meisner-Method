import React, { useMemo, useRef } from 'react';
import { PanResponder, Platform, View, type ViewStyle } from 'react-native';
import { usePathname, useRouter } from 'expo-router';
import { claimMainTabNavigation, isInteractionReserved } from '@/lib/interactionOwnership';
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
  const gesturePath = useRef(pathname);
  latest.current = { pathname, onNavigate };

  const responder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => false,
    onMoveShouldSetPanResponder: (_event, gesture) => {
      if (isInteractionReserved()) return false;
      const current = latest.current;
      const intent = getMainTabSwipeIntent(gesture.dx, gesture.dy);
      return !!intent && getMainTabSwipeTarget(current.pathname, intent) !== null;
    },
    onPanResponderTerminationRequest: (_event, gesture) =>
      Math.abs(gesture.dy) > Math.abs(gesture.dx) * 1.25,
    onPanResponderGrant: () => {
      gesturePath.current = latest.current.pathname;
    },
    onPanResponderRelease: (_event, gesture) => {
      if (isInteractionReserved()) return;
      const current = latest.current;
      if (current.pathname !== gesturePath.current) return;
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
      style={[
        { flex: 1 },
        Platform.OS === 'web' && ({ touchAction: 'pan-y' } as ViewStyle),
      ]}
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
        if (!claimMainTabNavigation()) return;
        if (plan.action === 'push') router.push(plan.href);
        else if (plan.action === 'navigate') router.navigate(plan.href);
        else router.replace(plan.href);
      }}
    >
      {children}
    </MainTabSwipeSurface>
  );
}
