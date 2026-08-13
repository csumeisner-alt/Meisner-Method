import React, { useEffect } from 'react';
import { AmericanModeProvider } from '@/contexts/AmericanModeContext';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { KeyboardProviderCompat } from '@/components/KeyboardProviderCompat';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  useFonts,
} from '@expo-google-fonts/inter';
import { Stack } from 'expo-router';
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
  return (
    <Stack
      screenOptions={({ route }) => {
        const transition = (route.params as { transition?: 'left' | 'right' } | undefined)?.transition;
        return {
          headerShown: false,
          animation: transition === 'left' ? 'slide_from_left' : 'slide_from_right',
        };
      }}
    >
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen name="portfolio" options={{ headerShown: false }} />
      <Stack.Screen name="paper" options={{ headerShown: false }} />
      <Stack.Screen name="picks" options={{ headerShown: false }} />
      <Stack.Screen name="picks/[symbol]" options={{ headerShown: false }} />
      <Stack.Screen name="analysis/[symbol]" options={{ headerShown: false }} />
    </Stack>
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
            <GestureHandlerRootView style={{ flex: 1 }}>
              <KeyboardProviderCompat>
                <RootLayoutNav />
              </KeyboardProviderCompat>
            </GestureHandlerRootView>
          </QueryClientProvider>
        </AmericanModeProvider>
      </ErrorBoundary>
    </SafeAreaProvider>
  );
}
