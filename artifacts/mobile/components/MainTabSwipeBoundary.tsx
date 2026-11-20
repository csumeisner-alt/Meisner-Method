import React, { useMemo, useRef } from 'react';
import { PanResponder, Platform, View, type ViewStyle } from 'react-native';
import { usePathname, useRouter } from 'expo-router';
import { claimMainTabNavigation, isInteractionReserved } from '@/lib/interactionOwnership';
import {
  recordDiagnosticInteraction,
  recordMainTabNavigationResult,
} from '@/lib/crashDiagnosticsRuntime';
import {
  getCommittedMainTabSwipeDirection,
  getMainTabNavigationPlan,
  getMainTabSwipeIntent,
  getMainTabSwipeTarget,
  type MainTabRoute,
} from '@/lib/mainTabNavigation';

interface MainTabSwipeSurfaceProps extends React.PropsWithChildren {
  pathname: string;
  onNavigate: (target: MainTabRoute) => boolean;
}

export function MainTabSwipeSurface({ pathname, onNavigate, children }: MainTabSwipeSurfaceProps) {
  const latest = useRef({ pathname, onNavigate });
  const gesturePath = useRef(pathname);
  const gestureInProgress = useRef(false);
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
      gestureInProgress.current = true;
      recordDiagnosticInteraction('main_tab_swipe', 'started');
    },
    onPanResponderRelease: (_event, gesture) => {
      if (isInteractionReserved()) {
        if (gestureInProgress.current) {
          recordDiagnosticInteraction('main_tab_swipe', 'cancelled');
          gestureInProgress.current = false;
        }
        return;
      }
      const current = latest.current;
      if (current.pathname !== gesturePath.current) {
        if (gestureInProgress.current) {
          recordDiagnosticInteraction('main_tab_swipe', 'cancelled');
          gestureInProgress.current = false;
        }
        return;
      }
      const direction = getCommittedMainTabSwipeDirection(gesture.dx, gesture.dy, gesture.vx);
      if (!direction) {
        if (gestureInProgress.current) {
          recordDiagnosticInteraction('main_tab_swipe', 'cancelled');
          gestureInProgress.current = false;
        }
        return;
      }
      const target = getMainTabSwipeTarget(current.pathname, direction);
      if (target) {
        const accepted = current.onNavigate(target);
        recordMainTabNavigationResult(current.pathname, target, accepted);
      } else {
        recordDiagnosticInteraction('main_tab_swipe', 'cancelled');
      }
      gestureInProgress.current = false;
    },
    onPanResponderTerminate: () => {
      if (gestureInProgress.current) {
        recordDiagnosticInteraction('main_tab_swipe', 'cancelled');
        gestureInProgress.current = false;
      }
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
        if (!plan || plan.action === 'none') return false;
        if (!claimMainTabNavigation()) return false;
        router.navigate(plan.href);
        return true;
      }}
    >
      {children}
    </MainTabSwipeSurface>
  );
}
