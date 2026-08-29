import React, { useEffect, useRef } from 'react';
import {
  Animated,
  Dimensions,
  Easing,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Constants from 'expo-constants';
import * as Haptics from 'expo-haptics';
import { Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import type { ColorScheme } from '@/constants/colors';
import { BrewCoin } from '@/components/BrewTokenBank';
import { useReduceMotion } from '@/hooks/useReduceMotion';

const { width } = Dimensions.get('window');

type Props = {
  visible: boolean;
  colors: ColorScheme;
  soundEnabled: boolean;
  hapticsEnabled: boolean;
  onSoundEnabledChange: (value: boolean) => Promise<void>;
  onHapticsEnabledChange: (value: boolean) => Promise<void>;
  onDismiss: () => void;
};

export function BrewTokenUnlockCelebration({
  visible,
  colors,
  soundEnabled,
  hapticsEnabled,
  onSoundEnabledChange,
  onHapticsEnabledChange,
  onDismiss,
}: Props) {
  const doorProgress = useRef(new Animated.Value(0)).current;
  const cardProgress = useRef(new Animated.Value(0)).current;
  const animationRef = useRef<{ stop: () => void } | null>(null);
  const playerRef = useRef<{ play: () => void; remove: () => void } | null>(null);
  const audioPlayedRef = useRef(false);
  const hapticsPlayedRef = useRef(false);
  const reduceMotion = useReduceMotion();

  useEffect(() => {
    if (!visible) {
      hapticsPlayedRef.current = false;
      return;
    }
    if (!hapticsEnabled || hapticsPlayedRef.current) return;
    hapticsPlayedRef.current = true;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
  }, [hapticsEnabled, visible]);

  useEffect(() => {
    if (!visible) return;
    doorProgress.setValue(0);
    cardProgress.setValue(0);
    if (reduceMotion) {
      doorProgress.setValue(1);
      cardProgress.setValue(1);
      animationRef.current = null;
      return;
    }

    const animation = Animated.parallel([
      Animated.timing(doorProgress, {
        toValue: 1,
        duration: 900,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.sequence([
        Animated.delay(260),
        Animated.spring(cardProgress, { toValue: 1, tension: 65, friction: 9, useNativeDriver: true }),
      ]),
    ]);
    animationRef.current = animation;
    animation.start();

    return () => {
      animation.stop();
      animationRef.current = null;
    };
  }, [cardProgress, doorProgress, reduceMotion, visible]);

  useEffect(() => {
    if (!visible) {
      audioPlayedRef.current = false;
      return;
    }
    if (!soundEnabled || audioPlayedRef.current) return;

    audioPlayedRef.current = true;
    let cancelled = false;
    const playVaultSound = async () => {
      if (Constants.appOwnership === 'expo' || !soundEnabled) return;
      try {
        const { createAudioPlayer, setAudioModeAsync } = await import('expo-audio');
        await setAudioModeAsync({ playsInSilentMode: false, allowsRecording: false });
        if (cancelled) return;
        // Reuse the bundled celebration recording so the feature stays offline-safe.
        const player = createAudioPlayer(require('../assets/celebration/voice01.m4a'), { downloadFirst: true });
        playerRef.current = player;
        player.play();
      } catch {
        // Sound is an enhancement; the celebration remains fully functional without it.
      }
    };
    void playVaultSound();

    return () => {
      cancelled = true;
      try { playerRef.current?.remove(); } catch { /* ignore */ }
      playerRef.current = null;
    };
  }, [soundEnabled, visible]);

  if (!visible) return null;

  const doorRotate = doorProgress.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '-24deg'] });
  const doorTranslate = doorProgress.interpolate({ inputRange: [0, 1], outputRange: [0, -18] });
  const cardOpacity = cardProgress;
  const cardScale = cardProgress.interpolate({ inputRange: [0, 1], outputRange: [0.82, 1] });

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onDismiss}>
      <View style={styles.root}>
        <LinearGradient
          colors={[colors.steelShadow, colors.background, colors.steelHighlight]}
          start={{ x: 0.2, y: 0 }}
          end={{ x: 0.8, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
        <View style={styles.rays} pointerEvents="none">
          <View style={[styles.ray, { backgroundColor: colors.gold, transform: [{ rotate: '18deg' }] }]} />
          <View style={[styles.ray, { backgroundColor: colors.gold, transform: [{ rotate: '-18deg' }] }]} />
        </View>

        <Animated.View style={[styles.vaultDoor, { borderColor: colors.goldMuted, transform: [{ rotateZ: doorRotate }, { translateX: doorTranslate }] }]}>
          <View style={[styles.doorRing, { borderColor: colors.goldMuted }]}>
            <Feather name="lock" size={34} color={colors.gold} />
          </View>
          <Text style={[styles.doorText, { color: colors.goldMuted, fontFamily: 'Inter_700Bold' }]}>CENTRAL BANK</Text>
        </Animated.View>

        <Animated.View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.gold, opacity: cardOpacity, transform: [{ scale: cardScale }] }]}>
          <Text style={[styles.eyebrow, { color: colors.gold, fontFamily: 'Inter_600SemiBold' }]}>QUOTE MILESTONE</Text>
          <Text style={[styles.headline, { color: colors.foreground, fontFamily: 'Inter_700Bold' }]}>BREW BANK UNLOCKED</Text>
          <View style={styles.coinRow}>
            <BrewCoin colors={colors} size={82} />
            <View style={styles.copy}>
              <Text style={[styles.amount, { color: colors.gold, fontFamily: 'Inter_700Bold' }]}>+5</Text>
              <Text style={[styles.tokenLabel, { color: colors.foreground, fontFamily: 'Inter_600SemiBold' }]}>BREW TOKENS</Text>
            </View>
          </View>
          <Text style={[styles.body, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular' }]}>
            You viewed 22 Biden quotes.{'\n'}The vault is open for weekend decisions.
          </Text>
          <View style={styles.feedbackControls}>
            <Pressable
              onPress={() => { void onSoundEnabledChange(!soundEnabled); }}
              style={[styles.feedbackButton, { borderColor: colors.border }]}
              accessibilityRole="button"
              accessibilityState={{ checked: soundEnabled }}
              accessibilityLabel={`Celebration sound ${soundEnabled ? 'on' : 'off'}`}
            >
              <Feather name={soundEnabled ? 'volume-2' : 'volume-x'} size={14} color={colors.mutedForeground} />
              <Text style={[styles.feedbackButtonText, { color: colors.mutedForeground, fontFamily: 'Inter_500Medium' }]}>
                SOUND {soundEnabled ? 'ON' : 'OFF'}
              </Text>
            </Pressable>
            <Pressable
              onPress={() => { void onHapticsEnabledChange(!hapticsEnabled); }}
              style={[styles.feedbackButton, { borderColor: colors.border }]}
              accessibilityRole="button"
              accessibilityState={{ checked: hapticsEnabled }}
              accessibilityLabel={`Celebration haptics ${hapticsEnabled ? 'on' : 'off'}`}
            >
              <Feather name="smartphone" size={14} color={colors.mutedForeground} />
              <Text style={[styles.feedbackButtonText, { color: colors.mutedForeground, fontFamily: 'Inter_500Medium' }]}>
                HAPTICS {hapticsEnabled ? 'ON' : 'OFF'}
              </Text>
            </Pressable>
          </View>
          <Pressable
            onPress={onDismiss}
            style={[styles.button, { backgroundColor: colors.gold }]}
            accessibilityRole="button"
            accessibilityLabel="Enter the Central Bank"
          >
            <Text style={[styles.buttonText, { color: colors.primaryForeground, fontFamily: 'Inter_700Bold' }]}>ENTER THE VAULT</Text>
          </Pressable>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  rays: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center', opacity: 0.08 },
  ray: { position: 'absolute', width: width * 0.9, height: 2 },
  vaultDoor: { position: 'absolute', width: Math.min(width * 0.68, 290), height: Math.min(width * 0.68, 290), borderWidth: 2, borderRadius: 999, alignItems: 'center', justifyContent: 'center', opacity: 0.8 },
  doorRing: { width: '68%', height: '68%', borderWidth: 1, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
  doorText: { fontSize: 9, letterSpacing: 1.5, marginTop: 13 },
  card: { width: '86%', maxWidth: 390, borderWidth: 1.5, borderRadius: 18, paddingHorizontal: 22, paddingVertical: 24, alignItems: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 16 }, shadowOpacity: 0.5, shadowRadius: 28, elevation: 18 },
  eyebrow: { fontSize: 9, letterSpacing: 1.6 },
  headline: { fontSize: 21, letterSpacing: 1.1, textAlign: 'center', marginTop: 6 },
  coinRow: { flexDirection: 'row', alignItems: 'center', gap: 16, marginTop: 20 },
  copy: { alignItems: 'flex-start' },
  amount: { fontSize: 34, lineHeight: 39 },
  tokenLabel: { fontSize: 10, letterSpacing: 1.1 },
  body: { fontSize: 13, lineHeight: 20, textAlign: 'center', marginTop: 20 },
  feedbackControls: { flexDirection: 'row', gap: 8, marginTop: 17 },
  feedbackButton: { minHeight: 32, borderWidth: 1, borderRadius: 7, paddingHorizontal: 9, flexDirection: 'row', alignItems: 'center', gap: 5 },
  feedbackButtonText: { fontSize: 8, letterSpacing: 0.5 },
  button: { minHeight: 45, borderRadius: 9, paddingHorizontal: 22, alignItems: 'center', justifyContent: 'center', marginTop: 22 },
  buttonText: { fontSize: 11, letterSpacing: 0.8 },
});