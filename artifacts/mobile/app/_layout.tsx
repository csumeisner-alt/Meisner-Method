import React, { useEffect, useRef, useState } from 'react';
import {
  Animated, Easing, Platform, StyleSheet, Text, View,
} from 'react-native';

const ND = Platform.OS !== 'web'; // useNativeDriver: true only on native
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { KeyboardProvider } from 'react-native-keyboard-controller';
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
import * as Speech from 'expo-speech';
import { createAudioPlayer, setAudioModeAsync } from 'expo-audio';
import { MMLogo } from '@/components/MMLogo';
import { setBaseUrl } from '@workspace/api-client-react';

// Set API base URL for Expo (runs outside the web proxy, needs absolute URL)
setBaseUrl(`https://${process.env.EXPO_PUBLIC_DOMAIN}`);

SplashScreen.preventAutoHideAsync();

const BASE_URL = `https://${process.env.EXPO_PUBLIC_DOMAIN}`;
const WELCOME_TEXT = "Welcome to Meisner Method. Let's find your next winning trade.";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _welcomePlayer: any = null;
async function playWelcomeVoice() {
  try {
    await setAudioModeAsync({ playsInSilentModeIOS: true, allowsRecordingIOS: false });
    _welcomePlayer = createAudioPlayer({
      uri: `${BASE_URL}/api/tts?text=${encodeURIComponent(WELCOME_TEXT)}`,
    });
    _welcomePlayer.play();
  } catch (_) {
    try { Speech.speak(WELCOME_TEXT, { language: 'en-US', pitch: 1.1, rate: 0.9 }); } catch (_) {}
  }
}

// ── Welcome Splash ─────────────────────────────────────────────────────────────

function WelcomeSplash({ onDone }: { onDone: () => void }) {
  const logoScale = useRef(new Animated.Value(0.6)).current;
  const logoOp    = useRef(new Animated.Value(0)).current;
  const textOp    = useRef(new Animated.Value(0)).current;
  const slideY    = useRef(new Animated.Value(0)).current;
  const pulse     = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    // 1. Logo springs in
    Animated.parallel([
      Animated.spring(logoScale, { toValue: 1, tension: 45, friction: 8, useNativeDriver: ND }),
      Animated.timing(logoOp,    { toValue: 1, duration: 500, useNativeDriver: ND }),
    ]).start();

    // 2. Text fades in slightly after
    setTimeout(() => {
      Animated.timing(textOp, { toValue: 1, duration: 500, useNativeDriver: ND }).start();
    }, 350);

    // 3. Subtle breathe loop (Easing.sin — not .sine)
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1.06, duration: 1400, easing: Easing.inOut(Easing.sin), useNativeDriver: ND }),
        Animated.timing(pulse, { toValue: 1.00, duration: 1400, easing: Easing.inOut(Easing.sin), useNativeDriver: ND }),
      ])
    ).start();

    // 4. Play welcoming voice
    playWelcomeVoice();

    // 5. Slide the whole screen up and away after 3 s
    const exitTimer = setTimeout(() => {
      Animated.timing(slideY, {
        toValue: -900,
        duration: 600,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: ND,
      }).start(onDone);
    }, 3000);

    return () => {
      clearTimeout(exitTimer);
      try { if (_welcomePlayer) { _welcomePlayer.remove(); _welcomePlayer = null; } } catch (_) {}
      try { Speech.stop(); } catch (_) {}
    };
  }, []);

  return (
    <Animated.View style={[splashStyles.container, { transform: [{ translateY: slideY }] }]}>
      {/* Large logo — spring in, then breathe (two nested views to avoid Animated.multiply) */}
      <Animated.View style={{ transform: [{ scale: logoScale }], opacity: logoOp }}>
        <Animated.View style={{ transform: [{ scale: pulse }] }}>
          <MMLogo size={170} />
        </Animated.View>
      </Animated.View>

      {/* Brand name + tagline */}
      <Animated.View style={[splashStyles.textBlock, { opacity: textOp }]}>
        <Text style={splashStyles.brandName}>MEISNER METHOD</Text>
        <Text style={splashStyles.tagline}>AI-powered market intelligence</Text>
      </Animated.View>
    </Animated.View>
  );
}

const splashStyles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#000',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 9999,
    gap: 28,
  },
  textBlock: { alignItems: 'center', gap: 8 },
  brandName: {
    color: '#e8e8e8',
    fontSize: 22,
    letterSpacing: 4,
    fontFamily: 'Inter_700Bold',
  },
  tagline: {
    color: 'rgba(192,192,192,0.55)',
    fontSize: 12,
    letterSpacing: 1.5,
    fontFamily: 'Inter_400Regular',
  },
});

// ── App shell ──────────────────────────────────────────────────────────────────

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, staleTime: 60_000 },
    mutations: { retry: 0 },
  },
});

function RootLayoutNav() {
  return (
    <Stack screenOptions={{ headerShown: false, animation: 'slide_from_right' }}>
      <Stack.Screen name="index"              options={{ headerShown: false }} />
      <Stack.Screen name="portfolio"          options={{ headerShown: false }} />
      <Stack.Screen name="paper"              options={{ headerShown: false }} />
      <Stack.Screen name="picks"              options={{ headerShown: false }} />
      <Stack.Screen name="picks/[symbol]"     options={{ headerShown: false }} />
      <Stack.Screen name="analysis/[symbol]"  options={{ headerShown: false }} />
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
  const [splashDone, setSplashDone] = useState(false);

  useEffect(() => {
    if (fontsLoaded || fontError) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded, fontError]);

  if (!fontsLoaded && !fontError) return null;

  return (
    <SafeAreaProvider>
      <ErrorBoundary>
        <QueryClientProvider client={queryClient}>
          <GestureHandlerRootView style={{ flex: 1 }}>
            <KeyboardProvider>
              <RootLayoutNav />
              {/* Welcome splash overlays everything on cold start */}
              {!splashDone && (
                <WelcomeSplash onDone={() => setSplashDone(true)} />
              )}
            </KeyboardProvider>
          </GestureHandlerRootView>
        </QueryClientProvider>
      </ErrorBoundary>
    </SafeAreaProvider>
  );
}
