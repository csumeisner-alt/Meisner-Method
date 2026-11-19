import React, { useEffect } from 'react';
import { AmericanModeProvider } from '@/contexts/AmericanModeContext';
import { AchievementsProvider } from '@/contexts/AchievementsContext';
import { AchievementsOverlay } from '@/components/AchievementsOverlay';
import { EventCashReceivedCelebration } from '@/components/EventCashReceivedCelebration';
import { PaperPortfolioPreloader } from '@/components/PaperPortfolioPreloader';
import { EventArenaPreloader } from '@/components/EventArenaPreloader';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { Platform } from 'react-native';
import { KeyboardProviderCompat } from '@/components/KeyboardProviderCompat';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { MainTabSwipeBoundary } from '@/components/MainTabSwipeBoundary';
import { installLightningRoundNotificationResponseHandler } from '@/lib/lightningRoundNotificationResponse';
import { EventArenaRemindersProvider } from '@/lib/eventArenaReminders';
import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  useFonts,
} from '@expo-google-fonts/inter';
import { router, Stack, useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { setBaseUrl } from '@workspace/api-client-react';
import {
  markInterruptedInteractionIfNeeded,
  recordDiagnosticError,
  recordDiagnosticInteraction,
  setDiagnosticRoute,
} from '@/lib/crashDiagnosticsRuntime';

// Set API base URL for Expo (needs absolute URL since it runs outside the web proxy)
setBaseUrl(`https://${process.env.EXPO_PUBLIC_DOMAIN}`);

SplashScreen.preventAutoHideAsync();

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, staleTime: 60_000 },
    mutations: { retry: 0 },
  },
});

function RootLayoutNav() {
  const segments = useSegments();

  useEffect(() => {
    setDiagnosticRoute(segments);
  }, [segments]);

  useEffect(() => {
    void markInterruptedInteractionIfNeeded();
    const globalWithErrorUtils = globalThis as typeof globalThis & {
      ErrorUtils?: {
        getGlobalHandler?: () => (error: Error, isFatal?: boolean) => void;
        setGlobalHandler?: (handler: (error: Error, isFatal?: boolean) => void) => void;
      };
    };
    const errorUtils = globalWithErrorUtils.ErrorUtils;
    const previousHandler = errorUtils?.getGlobalHandler?.();
    const diagnosticHandler = (error: Error, isFatal?: boolean) => {
      if (isFatal) recordDiagnosticError('fatal_js_error', error);
      previousHandler?.(error, isFatal);
    };
    errorUtils?.setGlobalHandler?.(diagnosticHandler);

    let active = true;
    let stopHandlingResponses: (() => void) | undefined;

    if (Platform.OS !== 'web') {
      void import('expo-notifications').then(async (Notifications) => {
        if (!active) return;
        stopHandlingResponses = installLightningRoundNotificationResponseHandler(
          Notifications,
          (eventId) => {
            router.push({
              pathname: '/lightning-round',
              params: {
                tab: 'past',
                ...(eventId ? { eventId } : {}),
              },
            });
          },
        );
      }).catch(() => {});
    }

    return () => {
      active = false;
      stopHandlingResponses?.();
      if (previousHandler) errorUtils?.setGlobalHandler?.(previousHandler);
    };
  }, []);

  return (
      <MainTabSwipeBoundary>
        <Stack
          screenListeners={{
            transitionStart: () => recordDiagnosticInteraction('navigation_transition', 'started'),
            transitionEnd: () => recordDiagnosticInteraction('navigation_transition', 'completed'),
            gestureCancel: () => recordDiagnosticInteraction('navigation_transition', 'cancelled'),
          }}
          screenOptions={({ route }) => {
            const transition = (route.params as { transition?: 'left' | 'right' } | undefined)?.transition;
            return {
              headerShown: false,
              // Moving an existing singular route while native-stack is animating
              // can detach the screen beneath an in-flight Android transition.
              animation: ['index', 'picks', 'paper', 'portfolio', 'event-arena'].includes(route.name)
                ? 'none'
                : transition === 'left' ? 'slide_from_left' : 'slide_from_right',
              gestureEnabled: !['index', 'picks', 'paper', 'portfolio', 'event-arena'].includes(route.name),
            };
          }}
        >
          <Stack.Screen name="index" dangerouslySingular options={{ headerShown: false }} />
          <Stack.Screen name="portfolio" dangerouslySingular options={{ headerShown: false }} />
          <Stack.Screen name="paper" dangerouslySingular options={{ headerShown: false }} />
          <Stack.Screen name="event-arena" dangerouslySingular options={{ headerShown: false }} />
          <Stack.Screen name="lightning-round" options={{ headerShown: false }} />
          <Stack.Screen name="picks" dangerouslySingular options={{ headerShown: false }} />
          <Stack.Screen name="heat-map" options={{ headerShown: false }} />
          <Stack.Screen name="heat-map-chart" options={{ headerShown: false }} />
          <Stack.Screen name="picks/[symbol]" options={{ headerShown: false }} />
          <Stack.Screen name="analysis/[symbol]" options={{ headerShown: false }} />
        </Stack>
      </MainTabSwipeBoundary>
  );
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
  });

  useEffect(() => {
    if (fontsLoaded || fontError) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded, fontError]);

  if (!fontsLoaded && !fontError) return null;

  return (
    <SafeAreaProvider>
      <ErrorBoundary>
        <AmericanModeProvider>
          <QueryClientProvider client={queryClient}>
            <EventArenaRemindersProvider>
              <GestureHandlerRootView style={{ flex: 1 }}>
                <KeyboardProviderCompat>
                  <AchievementsProvider>
                    <PaperPortfolioPreloader />
                    <EventArenaPreloader />
                    <RootLayoutNav />
                    <AchievementsOverlay />
                    <EventCashReceivedCelebration />
                  </AchievementsProvider>
                </KeyboardProviderCompat>
              </GestureHandlerRootView>
            </EventArenaRemindersProvider>
          </QueryClientProvider>
        </AmericanModeProvider>
      </ErrorBoundary>
    </SafeAreaProvider>
  );
}
