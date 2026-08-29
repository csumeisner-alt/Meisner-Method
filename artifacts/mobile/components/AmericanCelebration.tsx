/**
 * AmericanCelebration — full-screen cinematic celebration shown when the
 * user hits 1,776 facts read and unlocks Patriot Mode.
 *
 * 5 realistic F-35 SVG jets rise from the bottom of the screen to the top
 * at staggered horizontal positions and speeds, with heavy haptic pulses
 * timed to each jet's launch. Red/white/blue confetti rains down. The modal
 * auto-dismisses after 5 s.
 *
 * Audio: bald eagle screech on open + gunfire burst timed to first jet.
 * Sounds respect the device mute/silent switch (playsInSilentMode: false).
 */
import React, { useCallback, useEffect, useRef } from 'react';
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
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { useAudioPlayer, setAudioModeAsync } from 'expo-audio';
import Svg, { Circle, Ellipse, Path, Polygon, Rect } from 'react-native-svg';
import { Confetti } from '@/components/Confetti';
import { AMERICAN_MODE_THRESHOLD } from '@/lib/factCountLogic';
import { useReduceMotion } from '@/hooks/useReduceMotion';

const { width: SW, height: SH } = Dimensions.get('window');

const RWB_CONFETTI = ['#B22234', '#FFFFFF', '#3C3B6E', '#B22234', '#FFFFFF', '#FF6B6B'];

// ─── Realistic F-35 SVG (top-down, nose up) ────────────────────────────────

function F35({ size = 90 }: { size?: number }) {
  const scale = size / 200;
  return (
    <Svg
      width={size * 0.55}
      height={size}
      viewBox="0 0 110 200"
      style={{ overflow: 'visible' }}
    >
      {/* === Main delta wings === */}
      {/* Right wing */}
      <Path
        d="M62,72 L106,148 L96,162 L60,132 Z"
        fill="#2C2C2E"
        stroke="#1A1A1A"
        strokeWidth="0.8"
      />
      {/* Left wing */}
      <Path
        d="M48,72 L4,148 L14,162 L50,132 Z"
        fill="#2C2C2E"
        stroke="#1A1A1A"
        strokeWidth="0.8"
      />
      {/* Wing leading-edge root fairing (right) */}
      <Path
        d="M55,55 L67,68 L62,72 Z"
        fill="#383838"
      />
      {/* Wing leading-edge root fairing (left) */}
      <Path
        d="M55,55 L43,68 L48,72 Z"
        fill="#383838"
      />
      {/* Wing surface panel lines (right) */}
      <Path
        d="M62,90 L96,148"
        stroke="#222"
        strokeWidth="0.5"
        opacity={0.6}
      />
      {/* Wing surface panel lines (left) */}
      <Path
        d="M48,90 L14,148"
        stroke="#222"
        strokeWidth="0.5"
        opacity={0.6}
      />

      {/* === Main fuselage === */}
      <Path
        d={[
          'M55,8',           // nose tip
          'C57,15 63,35 65,60',  // right forward fuselage
          'L66,95',          // right widest point
          'C66,115 64,130 61,148', // right taper
          'L59,165',         // right tail section
          'C57,172 55,176 55,178', // right tail tip
          'C55,176 53,172 51,165', // left tail tip
          'L49,148',         // left tail section
          'C46,130 44,115 44,95', // left taper
          'L45,60',          // left widest point
          'C47,35 53,15 55,8', // left forward fuselage
          'Z',
        ].join(' ')}
        fill="#3A3A3C"
        stroke="#1C1C1E"
        strokeWidth="0.5"
      />

      {/* Fuselage chine lines (stealth shaping) */}
      <Path
        d="M55,8 C56,20 60,50 62,80 L62,130 C61,145 59,160 55,178"
        stroke="#4A4A4C"
        strokeWidth="0.6"
        fill="none"
        opacity={0.5}
      />
      <Path
        d="M55,8 C54,20 50,50 48,80 L48,130 C49,145 51,160 55,178"
        stroke="#4A4A4C"
        strokeWidth="0.6"
        fill="none"
        opacity={0.5}
      />

      {/* === Cockpit canopy === */}
      <Ellipse
        cx="55"
        cy="30"
        rx="5.5"
        ry="11"
        fill="#1E3A5F"
        stroke="#2A5A8A"
        strokeWidth="0.8"
      />
      {/* Canopy glint */}
      <Path
        d="M53,22 C54,24 55,28 55,30"
        stroke="rgba(150,200,255,0.5)"
        strokeWidth="1.2"
        fill="none"
        strokeLinecap="round"
      />

      {/* === Air intake (DSI bump) === */}
      <Ellipse cx="55" cy="52" rx="4" ry="3" fill="#252527" stroke="#1A1A1A" strokeWidth="0.4" />

      {/* === Vertical tail fins (appear as parallelograms from above) === */}
      {/* Right fin */}
      <Path
        d="M59,148 L72,175 L70,182 L58,158 Z"
        fill="#2A2A2C"
        stroke="#1A1A1A"
        strokeWidth="0.5"
      />
      {/* Left fin */}
      <Path
        d="M51,148 L38,175 L40,182 L52,158 Z"
        fill="#2A2A2C"
        stroke="#1A1A1A"
        strokeWidth="0.5"
      />

      {/* === Engine nozzle === */}
      <Circle cx="55" cy="174" r="7" fill="#1C1C1E" stroke="#333" strokeWidth="0.8" />
      <Circle cx="55" cy="174" r="4.5" fill="#0A0A0C" />
      {/* Nozzle petals */}
      <Path
        d="M55,167 L57,174 L55,181 L53,174 Z"
        fill="#2A2A2A"
        stroke="#111"
        strokeWidth="0.3"
      />
      <Path
        d="M48,170 L55,172 L62,170 L55,176 Z"
        fill="#2A2A2A"
        stroke="#111"
        strokeWidth="0.3"
      />

      {/* === Afterburner glow === */}
      <Circle cx="55" cy="184" r="6" fill="#FF6B00" opacity={0.85} />
      <Circle cx="55" cy="188" r="4" fill="#FFAA00" opacity={0.7} />
      <Circle cx="55" cy="192" r="2.5" fill="#FFE566" opacity={0.6} />

      {/* === Wing tip navigation lights === */}
      <Circle cx="106" cy="148" r="1.8" fill="#FF3333" opacity={0.9} />
      <Circle cx="4" cy="148" r="1.8" fill="#33FF33" opacity={0.9} />

      {/* === Fuselage panel lines === */}
      <Path
        d="M55,42 L55,148"
        stroke="#2A2A2A"
        strokeWidth="0.5"
        opacity={0.4}
      />
      <Path
        d="M48,80 L62,80"
        stroke="#2A2A2A"
        strokeWidth="0.4"
        opacity={0.3}
      />
      <Path
        d="M47,110 L63,110"
        stroke="#2A2A2A"
        strokeWidth="0.4"
        opacity={0.3}
      />
    </Svg>
  );
}

// ─── Animated jet ──────────────────────────────────────────────────────────

interface JetConfig {
  x: number;         // horizontal center position (0-1 of screen width)
  delay: number;     // ms before animation starts
  duration: number;  // ms for the full bottom→top flight
  size: number;      // jet SVG size
  tilt: number;      // slight rotation in degrees (left/right lean)
}

const JETS: JetConfig[] = [
  { x: 0.22, delay: 0,    duration: 1400, size: 78,  tilt: -4  },
  { x: 0.72, delay: 320,  duration: 1250, size: 85,  tilt:  5  },
  { x: 0.48, delay: 600,  duration: 1550, size: 95,  tilt:  0  },
  { x: 0.15, delay: 900,  duration: 1300, size: 72,  tilt: -6  },
  { x: 0.80, delay: 1150, duration: 1200, size: 80,  tilt:  7  },
];

function AnimatedJet({ cfg, reducedMotion }: { cfg: JetConfig; reducedMotion: boolean }) {
  const translateY = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (reducedMotion) {
      translateY.stopAnimation();
      translateY.setValue(1);
      return;
    }
    translateY.setValue(0);
    const animation = Animated.timing(translateY, {
      toValue: 1,
      duration: cfg.duration,
      delay: cfg.delay,
      easing: Easing.in(Easing.quad),
      useNativeDriver: true,
    });
    animation.start();
    return () => animation.stop();
  }, [cfg.delay, cfg.duration, reducedMotion, translateY]);

  const ty = translateY.interpolate({
    inputRange: [0, 1],
    // start below the screen, end well above it
    outputRange: [SH + cfg.size + 40, -(cfg.size + 60)],
  });

  const jetLeft = SW * cfg.x - (cfg.size * 0.55) / 2;

  return (
    <Animated.View
      style={[
        styles.jetWrapper,
        {
          left: jetLeft,
          transform: [
            { translateY: ty },
            { rotate: `${cfg.tilt}deg` },
          ],
        },
      ]}
      pointerEvents="none"
    >
      <F35 size={cfg.size} />
    </Animated.View>
  );
}

// ─── Main component ────────────────────────────────────────────────────────

interface Props {
  visible: boolean;
  onDismiss: () => void;
}

export function AmericanCelebration({ visible, onDismiss }: Props) {
  const heroAnim = useRef(new Animated.Value(0)).current;
  const autoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hapticTimers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const soundTimers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const reduceMotion = useReduceMotion();

  // Audio players — always initialised so hooks are unconditional.
  // playsInSilentMode:false (set below) makes iOS respect the mute switch.
  const eaglePlayer = useAudioPlayer(
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    require('../assets/sounds/eagle_screech.wav'),
  );
  const gunfirePlayer = useAudioPlayer(
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    require('../assets/sounds/gunfire_burst.wav'),
  );

  const fireHaptics = useCallback(() => {
    // Staggered heavy haptic pulses aligned with each jet's launch + mid-flight
    hapticTimers.current = JETS.flatMap((j) => [
      setTimeout(() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy).catch(() => {});
      }, j.delay + 80),
      setTimeout(() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy).catch(() => {});
      }, j.delay + j.duration * 0.45),
    ]);
    // Final volley when last jet clears
    const lastLaunch = Math.max(...JETS.map((j) => j.delay + j.duration));
    hapticTimers.current.push(
      setTimeout(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {}), lastLaunch + 50),
    );
  }, []);

  const playSounds = useCallback(() => {
    // Configure audio mode: respect device mute/silent switch
    setAudioModeAsync({ playsInSilentMode: false }).catch(() => {});

    // Eagle screech plays immediately on modal open
    soundTimers.current.push(
      setTimeout(() => {
        try {
          eaglePlayer.seekTo(0).then(() => eaglePlayer.play()).catch(() => {});
        } catch {
          // silently ignore if audio unavailable (e.g. simulator)
        }
      }, 0),
    );

    // Gunfire burst plays when the first jet launches (delay 0 + 80 ms offset)
    // The WAV already contains 5 rapid shots baked in.
    const firstJetDelay = Math.min(...JETS.map((j) => j.delay)) + 80;
    soundTimers.current.push(
      setTimeout(() => {
        try {
          gunfirePlayer.seekTo(0).then(() => gunfirePlayer.play()).catch(() => {});
        } catch {
          // silently ignore
        }
      }, firstJetDelay),
    );
  }, [eaglePlayer, gunfirePlayer]);

  useEffect(() => {
    if (!visible) return;

    heroAnim.setValue(reduceMotion ? 1 : 0);
    if (reduceMotion) return;
    const heroAnimation = Animated.spring(heroAnim, {
      toValue: 1,
      tension: 60,
      friction: 8,
      useNativeDriver: true,
    });
    heroAnimation.start();

    return () => {
      heroAnimation.stop();
    };
  }, [visible, reduceMotion, heroAnim]);

  useEffect(() => {
    if (!visible) return;

    fireHaptics();
    playSounds();
    autoTimer.current = setTimeout(onDismiss, 5000);

    return () => {
      if (autoTimer.current) clearTimeout(autoTimer.current);
      hapticTimers.current.forEach(clearTimeout);
      hapticTimers.current = [];
      soundTimers.current.forEach(clearTimeout);
      soundTimers.current = [];
      // Pause players on cleanup so audio doesn't bleed into the next screen
      try { eaglePlayer.pause(); } catch { /* ignore */ }
      try { gunfirePlayer.pause(); } catch { /* ignore */ }
    };
  }, [visible, fireHaptics, playSounds, onDismiss, eaglePlayer, gunfirePlayer]);

  if (!visible) return null;

  const heroScale = heroAnim.interpolate({ inputRange: [0, 1], outputRange: [0.7, 1] });
  const heroOpacity = heroAnim;

  return (
    <Modal transparent animationType="none" visible={visible} onRequestClose={onDismiss}>
      <View style={styles.root}>
        {/* Background gradient */}
        <LinearGradient
          colors={['#0A0A2E', '#1C1C5E', '#B22234', '#8B0000']}
          start={{ x: 0.3, y: 0 }}
          end={{ x: 0.7, y: 1 }}
          style={StyleSheet.absoluteFill}
        />

        {/* Stars layer */}
        <View style={styles.starsLayer} pointerEvents="none">
          {Array.from({ length: 30 }).map((_, i) => (
            <View
              key={i}
              style={[
                styles.star,
                {
                  left: `${(i * 37 + 11) % 100}%` as any,
                  top: `${(i * 29 + 7) % 60}%` as any,
                  opacity: 0.4 + (i % 4) * 0.15,
                  width: i % 3 === 0 ? 3 : 2,
                  height: i % 3 === 0 ? 3 : 2,
                },
              ]}
            />
          ))}
        </View>

        {/* F-35 jets — each independently animated */}
        {JETS.map((cfg, i) => (
          <AnimatedJet key={i} cfg={cfg} reducedMotion={reduceMotion} />
        ))}

        {/* Confetti in red/white/blue */}
        <Confetti
          width={SW}
          height={SH}
          count={120}
          duration={3200}
          colors={RWB_CONFETTI}
          reducedMotion={reduceMotion}
        />

        {/* Hero card */}
        <Animated.View
          style={[
            styles.heroCard,
            { opacity: heroOpacity, transform: [{ scale: heroScale }] },
          ]}
        >
          <Text style={styles.flagEmoji}>🇺🇸</Text>
          <Text style={styles.headline}>PATRIOT MODE</Text>
          <Text style={styles.subline}>UNLOCKED</Text>
          <Text style={styles.eagleEmoji}>🦅</Text>
          <Text style={styles.body}>
            You've read {AMERICAN_MODE_THRESHOLD.toLocaleString()} facts.{'\n'}The eagle has landed.
          </Text>

          <Pressable style={styles.dismissBtn} onPress={onDismiss}>
            <Text style={styles.dismissText}>Let's Go 🇺🇸</Text>
          </Pressable>
        </Animated.View>
      </View>
    </Modal>
  );
}

// ─── Styles ────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  starsLayer: {
    ...StyleSheet.absoluteFillObject,
  },
  star: {
    position: 'absolute',
    borderRadius: 2,
    backgroundColor: '#FFFFFF',
  },
  jetWrapper: {
    position: 'absolute',
    bottom: 0,
  },
  heroCard: {
    alignItems: 'center',
    backgroundColor: 'rgba(10,10,46,0.88)',
    borderWidth: 2,
    borderColor: '#B22234',
    borderRadius: 24,
    paddingVertical: 36,
    paddingHorizontal: 36,
    marginHorizontal: 24,
    shadowColor: '#B22234',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 24,
    elevation: 20,
  },
  flagEmoji: {
    fontSize: 56,
    marginBottom: 4,
  },
  headline: {
    fontSize: 32,
    fontWeight: '900',
    color: '#FFFFFF',
    letterSpacing: 3,
    textAlign: 'center',
    fontFamily: 'Inter_700Bold',
    textShadowColor: '#B22234',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 12,
  },
  subline: {
    fontSize: 28,
    fontWeight: '900',
    color: '#B22234',
    letterSpacing: 6,
    textAlign: 'center',
    fontFamily: 'Inter_700Bold',
    marginBottom: 6,
  },
  eagleEmoji: {
    fontSize: 44,
    marginBottom: 12,
  },
  body: {
    fontSize: 15,
    color: 'rgba(255,255,255,0.8)',
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 28,
    fontFamily: 'Inter_400Regular',
  },
  dismissBtn: {
    backgroundColor: '#B22234',
    paddingVertical: 14,
    paddingHorizontal: 40,
    borderRadius: 14,
  },
  dismissText: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '700',
    letterSpacing: 0.5,
    fontFamily: 'Inter_700Bold',
  },
});
