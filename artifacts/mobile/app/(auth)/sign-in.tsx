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
import { useClerk, useSignIn, useSSO } from '@clerk/expo';
import * as WebBrowser from 'expo-web-browser';
import * as AuthSession from 'expo-auth-session';
import { Link, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MMLogo } from '@/components/MMLogo';

// Required: completes any pending web auth sessions on Android
WebBrowser.maybeCompleteAuthSession();

function useWarmUpBrowser() {
  useEffect(() => {
    if (Platform.OS !== 'android') return;
    void WebBrowser.warmUpAsync();
    return () => { void WebBrowser.coolDownAsync(); };
  }, []);
}

// Extract a human-readable message from a Clerk error (futures API returns
// `{ error }` whose shape is a ClerkAPIResponseError-like object).
function getClerkErrorMessage(err: any): string {
  return (
    err?.errors?.[0]?.longMessage ||
    err?.errors?.[0]?.message ||
    err?.message ||
    'Something went wrong. Please try again.'
  );
}

export default function SignInScreen() {
  useWarmUpBrowser();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { setActive } = useClerk();
  const { signIn, errors, fetchStatus } = useSignIn();
  const { startSSOFlow } = useSSO();

  const [email, setEmail] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [code, setCode] = React.useState('');
  const [googleLoading, setGoogleLoading] = React.useState(false);
  const [formError, setFormError] = React.useState('');


  const handleEmailSignIn = async () => {
    setFormError('');
    const { error } = await signIn.create({ identifier: email, password });
    if (error) {
      setFormError(getClerkErrorMessage(error));
      return;
    }
    if (signIn.status === 'complete' && signIn.createdSessionId) {
      await setActive({ session: signIn.createdSessionId });
      router.replace('/');
    }
  };

  const handleVerifyCode = async () => {
    setFormError('');
    const { error } = await signIn.emailCode.verifyCode({ code });
    if (error) {
      setFormError(getClerkErrorMessage(error));
      return;
    }
    if (signIn.status === 'complete' && signIn.createdSessionId) {
      await setActive({ session: signIn.createdSessionId });
      router.replace('/');
    }
  };

  const handleGoogleSignIn = useCallback(async () => {
    setGoogleLoading(true);
    setFormError('');
    try {
      const { createdSessionId, signIn: ssoSignIn, signUp: ssoSignUp } =
        await startSSOFlow({
          strategy: 'oauth_google',
          redirectUrl: AuthSession.makeRedirectUri(),
        });
      console.log('[auth] Google SSO result:', {
        createdSessionId,
        signInStatus: ssoSignIn?.status,
        signUpStatus: ssoSignUp?.status,
      });
      // Primary path: SSO returned a ready session ID
      if (createdSessionId) {
        await setActive({ session: createdSessionId });
        router.replace('/');
        return;
      }
      // Fallback: existing account where Clerk marks the signIn complete but
      // returns the session ID on the ssoSignIn object instead
      if (ssoSignIn?.status === 'complete' && ssoSignIn?.createdSessionId) {
        await setActive({ session: ssoSignIn.createdSessionId });
        router.replace('/');
        return;
      }
      console.warn('[auth] SSO returned no session', {
        signInStatus: ssoSignIn?.status,
        signUpStatus: ssoSignUp?.status,
      });
      setFormError('Could not complete Google sign-in. Please try again.');
    } catch (e) {
      console.error('Google sign-in error:', e);
      setFormError(getClerkErrorMessage(e));
    } finally {
      setGoogleLoading(false);
    }
  }, [startSSOFlow, setActive, router]);

  // MFA / client-trust step
  if (signIn.status === 'needs_client_trust') {
    return (
      <View style={[s.container, { paddingTop: insets.top + 40 }]}>
        <Text style={s.title}>Verify your identity</Text>
        <Text style={s.label}>Verification code</Text>
        <TextInput
          style={s.input}
          value={code}
          onChangeText={setCode}
          keyboardType="numeric"
          placeholder="Enter code"
          placeholderTextColor="#666"
        />
        {errors.fields.code && <Text style={s.error}>{errors.fields.code.message}</Text>}
        {formError ? <Text style={s.error}>{formError}</Text> : null}
        <Pressable style={s.btn} onPress={handleVerifyCode}>
          <Text style={s.btnText}>Verify</Text>
        </Pressable>
        <Pressable style={s.secondaryBtn} onPress={() => signIn.emailCode.sendCode()}>
          <Text style={s.secondaryBtnText}>Resend code</Text>
        </Pressable>
        <Pressable style={s.secondaryBtn} onPress={() => signIn.reset()}>
          <Text style={s.secondaryBtnText}>Start over</Text>
        </Pressable>
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
        {/* Logo */}
        <View style={s.logoRow}>
          <MMLogo size={48} />
          <View style={s.logoText}>
            <Text style={s.appName}>Meisner Method</Text>
            <Text style={s.tagline}>AI-powered market intelligence</Text>
          </View>
        </View>

        <Text style={s.title}>Welcome back</Text>
        <Text style={s.subtitle}>Sign in to your account</Text>

        {/* Google */}
        <Pressable
          style={[s.googleBtn, googleLoading && s.disabled]}
          onPress={handleGoogleSignIn}
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

        {/* Email / Password */}
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
        {errors.fields.identifier && (
          <Text style={s.error}>{errors.fields.identifier.message}</Text>
        )}

        <Text style={s.label}>Password</Text>
        <TextInput
          style={s.input}
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          placeholder="••••••••"
          placeholderTextColor="#555"
          autoComplete="current-password"
        />
        {errors.fields.password && (
          <Text style={s.error}>{errors.fields.password.message}</Text>
        )}

        {formError ? <Text style={s.error}>{formError}</Text> : null}

        <Pressable
          style={[s.btn, (!email || !password || fetchStatus === 'fetching') && s.disabled]}
          onPress={handleEmailSignIn}
          disabled={!email || !password || fetchStatus === 'fetching'}
        >
          {fetchStatus === 'fetching'
            ? <ActivityIndicator color="#000" size="small" />
            : <Text style={s.btnText}>Sign In</Text>
          }
        </Pressable>

        <View style={s.linkRow}>
          <Text style={s.linkText}>Don't have an account? </Text>
          <Link href="/sign-up">
            <Text style={s.link}>Sign up</Text>
          </Link>
        </View>
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
    alignItems: 'stretch',
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
