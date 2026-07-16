import { useCallback } from 'react';
import * as AuthSession from 'expo-auth-session';
import * as Network from 'expo-network';
import { useClerk, useSignIn, useSignUp, useSSO } from '@clerk/expo';
import { withTimeout, SSOTimeoutError } from '../lib/withTimeout';

/** How long to wait for the OAuth flow before giving up (ms). */
export const SSO_TIMEOUT_MS = 90_000;

/** Extract a human-readable message from a Clerk error. */
export function getClerkErrorMessage(err: any): string {
  return (
    err?.errors?.[0]?.longMessage ||
    err?.errors?.[0]?.message ||
    err?.message ||
    'Something went wrong. Please try again.'
  );
}

export type GoogleAuthResult =
  | { ok: true }
  | { ok: false; message?: string }; // no message = user cancelled, show nothing

/**
 * Google SSO flow that works for BOTH new and existing accounts.
 *
 * Clerk's `startSSOFlow` only returns a ready `createdSessionId` on the happy
 * path. Two other outcomes are normal and must be handled, or returning users
 * get locked out:
 *
 * - **Existing account** (user pressed the button on the sign-up screen, or
 *   the OAuth attempt started as a sign-up): Clerk marks the sign-up's
 *   external-account verification as `transferable`. The attempt must be
 *   transferred to a sign-in via `signIn.create({ transfer: true })`.
 * - **New account** (user pressed the button on the sign-in screen): Clerk
 *   marks the sign-in's first-factor verification as `transferable`. The
 *   attempt must be transferred to a sign-up via
 *   `signUp.create({ transfer: true })`.
 */
export function useGoogleAuth() {
  const { setActive } = useClerk();
  const { signIn } = useSignIn();
  const { signUp } = useSignUp();
  const { startSSOFlow } = useSSO();

  const signInWithGoogle = useCallback(async (): Promise<GoogleAuthResult> => {
    // Fail fast if the device is offline instead of waiting for a timeout.
    try {
      const netState = await Network.getNetworkStateAsync();
      if (netState.isConnected === false || netState.isInternetReachable === false) {
        return {
          ok: false,
          message: 'No internet connection. Please check your network and try again.',
        };
      }
    } catch {
      // Could not determine connectivity — proceed and let the flow itself fail.
    }

    let ssoResult;
    try {
      ssoResult = await withTimeout(
        startSSOFlow({
          strategy: 'oauth_google',
          redirectUrl: AuthSession.makeRedirectUri(),
        }),
        SSO_TIMEOUT_MS,
      );
    } catch (e) {
      if (e instanceof SSOTimeoutError) {
        console.warn('[auth] Google SSO timed out after', SSO_TIMEOUT_MS, 'ms');
        return { ok: false, message: 'Sign-in timed out, please try again.' };
      }
      throw e;
    }
    const { createdSessionId, authSessionResult, signIn: ssoSignIn, signUp: ssoSignUp } = ssoResult;

    console.log('[auth] Google SSO result:', {
      createdSessionId,
      authSessionType: authSessionResult?.type,
      signInStatus: ssoSignIn?.status,
      signUpStatus: ssoSignUp?.status,
    });

    // User closed the browser without completing — not an error.
    if (
      authSessionResult?.type === 'cancel' ||
      authSessionResult?.type === 'dismiss'
    ) {
      return { ok: false };
    }

    // Happy path: SSO returned a ready session ID.
    if (createdSessionId) {
      await setActive({ session: createdSessionId });
      return { ok: true };
    }

    // Session established but the ID came back on a resource object instead.
    if (ssoSignIn?.status === 'complete' && ssoSignIn.createdSessionId) {
      await setActive({ session: ssoSignIn.createdSessionId });
      return { ok: true };
    }
    if (ssoSignUp?.status === 'complete' && ssoSignUp.createdSessionId) {
      await setActive({ session: ssoSignUp.createdSessionId });
      return { ok: true };
    }

    // EXISTING account: the OAuth attempt landed on sign-up but the user
    // already exists — transfer it to a sign-in and activate that session.
    // `finalize()` is the canonical futures-API way to convert a complete
    // attempt into the active session (deterministic — no reliance on
    // reading mutated state plus a manual setActive).
    if (ssoSignUp?.verifications?.externalAccount?.status === 'transferable') {
      const { error } = await signIn.create({ transfer: true });
      if (error) return { ok: false, message: getClerkErrorMessage(error) };
      if (signIn.status === 'complete') {
        const { error: finalizeError } = await signIn.finalize();
        if (finalizeError) return { ok: false, message: getClerkErrorMessage(finalizeError) };
        return { ok: true };
      }
    }

    // NEW account: the OAuth attempt landed on sign-in but no user matches —
    // transfer it to a sign-up and activate the new session.
    if (ssoSignIn?.firstFactorVerification?.status === 'transferable') {
      const { error } = await signUp.create({ transfer: true });
      if (error) return { ok: false, message: getClerkErrorMessage(error) };
      if (signUp.status === 'complete') {
        const { error: finalizeError } = await signUp.finalize();
        if (finalizeError) return { ok: false, message: getClerkErrorMessage(finalizeError) };
        return { ok: true };
      }
    }

    console.warn('[auth] Google SSO could not establish a session', {
      signInStatus: ssoSignIn?.status ?? signIn.status,
      signUpStatus: ssoSignUp?.status ?? signUp.status,
      firstFactor: ssoSignIn?.firstFactorVerification?.status,
      externalAccount: ssoSignUp?.verifications?.externalAccount?.status,
    });
    return {
      ok: false,
      message: 'Could not complete Google sign-in. Please try again.',
    };
  }, [startSSOFlow, setActive, signIn, signUp]);

  return { signInWithGoogle };
}
