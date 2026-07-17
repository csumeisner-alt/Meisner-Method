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
import { Stack, useRouter, useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { ClerkProvider, ClerkLoaded, useAuth } from '@clerk/expo';
import { tokenCache } from '@clerk/expo/token-cache';
import { setBaseUrl, setAuthTokenGetter } from '@workspace/api-client-react';

// Set API base URL for Expo (needs absolute URL since it runs outside the web proxy)
setBaseUrl(`https://${process.env.EXPO_PUBLIC_DOMAIN}`);

SplashScreen.preventAutoHideAsync();

const publishableKey = process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY!;
const proxyUrl = process.env.EXPO_PUBLIC_CLERK_PROXY_URL || undefined;

// In dev (Expo Go / dev-client), skip the forced sign-in redirect so the app can
// be previewed without logging in. __DEV__ is true only during `expo start`.
// Production APK / published builds (__DEV__ === false) always enforce the full
// Clerk auth gate. Note: with the bypass on and no session, authed API calls have
// no bearer token, so backend data won't load until you actually sign in.
const DEV_BYPASS_AUTH = __DEV__;

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, staleTime: 60_000 },
    mutations: { retry: 0 },
  },
});

/**
 * Gate the main app behind authentication. Registers the bearer token getter
 * and redirects between the auth group and the app imperatively.
 *
 * The navigator (children) must ALWAYS render — Expo Router needs a mounted
 * <Stack> to host any route, including /(auth)/sign-in. Returning a <Redirect>
 * here instead of the navigator leaves nothing mounted and produces a blank
 * screen for signed-out users. Do the redirect with useRouter + useSegments.
 */
function AuthGate({ children }: { children: React.ReactNode }) {
  const { isSignedIn, isLoaded, getToken } = useAuth();
  const segments = useSegments();
  const router = useRouter();

  // Register token getter so api-client-react auto-attaches Bearer tokens
  useEffect(() => {
    setAuthTokenGetter(() => getToken());
  }, [getToken]);

  useEffect(() => {
    // In dev, skip the forced sign-in redirect so the app previews without login.
    // The token getter above stays registered, so authed calls still work if a
    // session happens to exist. Production always enforces the gate below.
    if (DEV_BYPASS_AUTH) return;
    if (!isLoaded) return;
    const inAuthGroup = segments[0] === '(auth)';
    if (!isSignedIn && !inAuthGroup) {
      router.replace('/(auth)/sign-in');
    } else if (isSignedIn && inAuthGroup) {
      router.replace('/');
    }
  }, [isLoaded, isSignedIn, segments, router]);

  return <>{children}</>;
}

function RootLayoutNav() {
  return (
    <Stack screenOptions={{ headerShown: false, animation: 'slide_from_right' }}>
      {/* Auth group — no auth gate */}
      <Stack.Screen name="(auth)" options={{ headerShown: false }} />
      {/* Main screens — all protected */}
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

  // ClerkProvider is mounted in ALL environments so Clerk hooks always have a
  // provider. In Expo Go (dev) the AuthGate relaxes the forced sign-in redirect,
  // so the app previews without logging in; in production it enforces the gate.
  return (
    <SafeAreaProvider>
      <ErrorBoundary>
        <AmericanModeProvider>
        <ClerkProvider
          publishableKey={publishableKey}
          tokenCache={tokenCache}
          proxyUrl={proxyUrl}
        >
          <ClerkLoaded>
            <QueryClientProvider client={queryClient}>
              <GestureHandlerRootView style={{ flex: 1 }}>
                <KeyboardProviderCompat>
                  <AuthGate>
                    <RootLayoutNav />
                  </AuthGate>
                </KeyboardProviderCompat>
              </GestureHandlerRootView>
            </QueryClientProvider>
          </ClerkLoaded>
        </ClerkProvider>
        </AmericanModeProvider>
      </ErrorBoundary>
    </SafeAreaProvider>
  );
}
