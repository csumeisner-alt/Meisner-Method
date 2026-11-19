import React, { useEffect } from 'react';
import { AmericanModeProvider } from '@/contexts/AmericanModeContext';
import { AchievementsProvider } from '@/contexts/AchievementsContext';
import { AchievementsOverlay } from '@/components/AchievementsOverlay';
import { EventCashReceivedCelebration } from '@/components/EventCashReceivedCelebration';
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
import { router, Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { setBaseUrl } from '@workspace/api-client-react';

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
  useEffect(() => {
    if (Platform.OS === 'web') return;
    let active = true;
    let stopHandlingResponses: (() => void) | undefined;

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

    return () => {
      active = false;
      stopHandlingResponses?.();
    };
  }, []);

  return (
      <MainTabSwipeBoundary>
        <Stack
          screenOptions={({ route }) => {
            const transition = (route.params as { transition?: 'left' | 'right' } | undefined)?.transition;
            return {
              headerShown: false,
              animation: transition === 'left' ? 'slide_from_left' : 'slide_from_right',
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
