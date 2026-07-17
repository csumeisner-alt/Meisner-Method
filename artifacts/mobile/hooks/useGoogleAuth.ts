import { useCallback } from 'react';
import * as AuthSession from 'expo-auth-session';
import * as Network from 'expo-network';
import { useSSO } from '@clerk/expo';
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
 * Google SSO flow.
 *
 * Clerk's Expo `useSSO` hook already handles the OAuth redirect and the
 * sign-in↔sign-up transfer internally, so this wrapper only needs to:
 * 1. Detect cancellation/dismissal.
 * 2. Set the returned session as active when `createdSessionId` is present.
 *
 * Any missing requirements (MFA, required fields, etc.) fall through to the
 * error path so the UI can surface them.
 */
export function useGoogleAuth(navigate: (url: string) => void) {
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

    const { createdSessionId, authSessionResult, setActive, signIn, signUp } = ssoResult;

    console.log('[auth] Google SSO result:', {
      createdSessionId,
      authSessionType: authSessionResult?.type,
      signInStatus: signIn?.status,
      signUpStatus: signUp?.status,
    });

    // User closed the browser without completing — not an error.
    if (authSessionResult?.type === 'cancel' || authSessionResult?.type === 'dismiss') {
      return { ok: false };
    }

    if (createdSessionId && setActive) {
      await setActive({
        session: createdSessionId,
        navigate: ({ session, decorateUrl }) => {
          if (session?.currentTask) {
            console.log('[auth] pending session task', session.currentTask);
            return;
          }
          const url = decorateUrl('/');
          if (url.startsWith('http')) {
            // Native app should not get an external URL here.
            return;
          }
          navigate(url);
        },
      });
      return { ok: true };
    }

    console.warn('[auth] Google SSO could not establish a session', ssoResult);
    return {
      ok: false,
      message: 'Could not complete Google sign-in. Please try again.',
    };
  }, [startSSOFlow, navigate]);

  return { signInWithGoogle };
}
