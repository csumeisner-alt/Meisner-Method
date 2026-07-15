import React, { useCallback, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { useSignUp, useSSO } from '@clerk/expo';
import * as WebBrowser from 'expo-web-browser';
import * as AuthSession from 'expo-auth-session';
import { type Href, Link, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MMLogo } from '@/components/MMLogo';

WebBrowser.maybeCompleteAuthSession();

function useWarmUpBrowser() {
  useEffect(() => {
    if (Platform.OS !== 'android') return;
    void WebBrowser.warmUpAsync();
    return () => { void WebBrowser.coolDownAsync(); };
  }, []);
}

export default function SignUpScreen() {
  useWarmUpBrowser();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { signUp, errors, fetchStatus } = useSignUp();
  const { startSSOFlow } = useSSO();

  const [email, setEmail] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [code, setCode] = React.useState('');
  const [googleLoading, setGoogleLoading] = React.useState(false);

  const navigateAfterAuth = ({ session, decorateUrl }: any) => {
    if (session?.currentTask) return;
    const url = decorateUrl('/');
    router.replace(url as Href);
  };

  const handleCreateAccount = async () => {
    const { error } = await signUp.password({ emailAddress: email, password });
    if (error) return;
    await signUp.verifications.sendEmailCode();
  };

  const handleVerifyCode = async () => {
    await signUp.verifications.verifyEmailCode({ code });
    if (signUp.status === 'complete') {
      await signUp.finalize({ navigate: navigateAfterAuth });
    }
  };

  const handleGoogleSignUp = useCallback(async () => {
    setGoogleLoading(true);
    try {
      const { createdSessionId, setActive } = await startSSOFlow({
        strategy: 'oauth_google',
        redirectUrl: AuthSession.makeRedirectUri(),
      });
      if (createdSessionId && setActive) {
        await setActive({
          session: createdSessionId,
          navigate: navigateAfterAuth,
        });
      }
    } catch (e) {
      console.error('Google sign-up error:', e);
    } finally {
      setGoogleLoading(false);
    }
  }, [startSSOFlow]);

  // Email verification step
  if (
    signUp.status === 'missing_requirements' &&
    signUp.unverifiedFields.includes('email_address') &&
    signUp.missingFields.length === 0
  ) {
    return (
      <View style={[s.container, { paddingTop: insets.top + 60 }]}>
        <View style={{ marginBottom: 28 }}>
          <MMLogo size={44} />
        </View>
        <Text style={s.title}>Verify your email</Text>
        <Text style={s.subtitle}>We sent a code to {email}</Text>

        <Text style={s.label}>Verification code</Text>
        <TextInput
          style={s.input}
          value={code}
          onChangeText={setCode}
          keyboardType="numeric"
          placeholder="6-digit code"
          placeholderTextColor="#555"
          autoFocus
        />
        {errors.fields.code && <Text style={s.error}>{errors.fields.code.message}</Text>}

        <Pressable
          style={[s.btn, fetchStatus === 'fetching' && s.disabled]}
          onPress={handleVerifyCode}
          disabled={fetchStatus === 'fetching'}
        >
          {fetchStatus === 'fetching'
            ? <ActivityIndicator color="#000" size="small" />
            : <Text style={s.btnText}>Confirm</Text>
          }
        </Pressable>

        <Pressable style={s.secondaryBtn} onPress={() => signUp.verifications.sendEmailCode()}>
          <Text style={s.secondaryBtnText}>Resend code</Text>
        </Pressable>

        {/* Required for Clerk's bot protection */}
        <View nativeID="clerk-captcha" />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerStyle={[s.container, { paddingTop: insets.top + 40, paddingBottom: insets.bottom + 40 }]}
        keyboardShouldPersistTaps="handled"
      >
        <View style={s.logoRow}>
          <MMLogo size={48} />
          <View style={s.logoText}>
            <Text style={s.appName}>Meisner Method</Text>
            <Text style={s.tagline}>AI-powered market intelligence</Text>
          </View>
        </View>

        <Text style={s.title}>Create account</Text>
        <Text style={s.subtitle}>Start tracking your trades today</Text>

        {/* Google */}
        <Pressable
          style={[s.googleBtn, googleLoading && s.disabled]}
          onPress={handleGoogleSignUp}
          disabled={googleLoading}
        >
          {googleLoading
            ? <ActivityIndicator color="#000" size="small" />
            : <Text style={s.googleBtnText}>Continue with Google</Text>
          }
        </Pressable>

        <View style={s.dividerRow}>
          <View style={s.dividerLine} />
          <Text style={s.dividerText}>or</Text>
          <View style={s.dividerLine} />
        </View>

        <Text style={s.label}>Email</Text>
        <TextInput
          style={s.input}
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          keyboardType="email-address"
          placeholder="you@example.com"
          placeholderTextColor="#555"
          autoComplete="email"
        />
        {errors.fields.emailAddress && (
          <Text style={s.error}>{errors.fields.emailAddress.message}</Text>
        )}

        <Text style={s.label}>Password</Text>
        <TextInput
          style={s.input}
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          placeholder="••••••••"
          placeholderTextColor="#555"
          autoComplete="new-password"
        />
        {errors.fields.password && (
          <Text style={s.error}>{errors.fields.password.message}</Text>
        )}

        <Pressable
          style={[s.btn, (!email || !password || fetchStatus === 'fetching') && s.disabled]}
          onPress={handleCreateAccount}
          disabled={!email || !password || fetchStatus === 'fetching'}
        >
          {fetchStatus === 'fetching'
            ? <ActivityIndicator color="#000" size="small" />
            : <Text style={s.btnText}>Create Account</Text>
          }
        </Pressable>

        <View style={s.linkRow}>
          <Text style={s.linkText}>Already have an account? </Text>
          <Link href={'/(auth)/sign-in' as Href}>
            <Text style={s.link}>Sign in</Text>
          </Link>
        </View>

        {/* Required for Clerk's bot protection */}
        <View nativeID="clerk-captcha" />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const SILVER = '#c0c0c0';
const BG = '#0a0a0a';
const CARD = 'rgba(192,192,192,0.08)';
const BORDER = 'rgba(192,192,192,0.22)';
const GREEN = '#00e5a0';

const s = StyleSheet.create({
  container: {
    flexGrow: 1,
    backgroundColor: BG,
    paddingHorizontal: 28,
  },
  logoRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 36 },
  logoText: {},
  appName: { color: '#fff', fontSize: 18, fontFamily: 'Inter_700Bold', letterSpacing: 0.6 },
  tagline: { color: SILVER, fontSize: 11, fontFamily: 'Inter_400Regular', marginTop: 1 },
  title: { color: '#fff', fontSize: 26, fontFamily: 'Inter_700Bold', marginBottom: 6 },
  subtitle: { color: SILVER, fontSize: 14, fontFamily: 'Inter_400Regular', marginBottom: 28 },
  label: { color: SILVER, fontSize: 13, fontFamily: 'Inter_500Medium', marginBottom: 6, marginTop: 14 },
  input: {
    backgroundColor: CARD,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 14,
    color: '#fff',
    fontFamily: 'Inter_400Regular',
    fontSize: 15,
  },
  btn: {
    backgroundColor: GREEN,
    borderRadius: 10,
    paddingVertical: 15,
    alignItems: 'center',
    marginTop: 22,
  },
  btnText: { color: '#000', fontFamily: 'Inter_700Bold', fontSize: 15 },
  googleBtn: {
    backgroundColor: '#fff',
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
  },
  googleBtnText: { color: '#000', fontFamily: 'Inter_600SemiBold', fontSize: 15 },
  secondaryBtn: { paddingVertical: 12, alignItems: 'center', marginTop: 10 },
  secondaryBtnText: { color: SILVER, fontFamily: 'Inter_400Regular', fontSize: 14 },
  disabled: { opacity: 0.5 },
  error: { color: '#ff6b6b', fontFamily: 'Inter_400Regular', fontSize: 12, marginTop: 4 },
  dividerRow: { flexDirection: 'row', alignItems: 'center', marginVertical: 20, gap: 10 },
  dividerLine: { flex: 1, height: 1, backgroundColor: BORDER },
  dividerText: { color: SILVER, fontFamily: 'Inter_400Regular', fontSize: 13 },
  linkRow: { flexDirection: 'row', justifyContent: 'center', marginTop: 24 },
  linkText: { color: SILVER, fontFamily: 'Inter_400Regular', fontSize: 14 },
  link: { color: GREEN, fontFamily: 'Inter_600SemiBold', fontSize: 14 },
});
