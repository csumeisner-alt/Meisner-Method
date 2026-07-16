---
name: Clerk Google SSO transfer flow (Expo)
description: Why Google sign-in only worked for new accounts, and the canonical transfer handling; plus dev-env testing blockers.
---

Rule: `startSSOFlow` only yields `createdSessionId` on the happy path. You MUST handle both transfer outcomes:
- existing account: `ssoSignUp.verifications.externalAccount.status === 'transferable'` → futures `signIn.create({ transfer: true })` then `signIn.finalize()`.
- new account: `ssoSignIn.firstFactorVerification.status === 'transferable'` → `signUp.create({ transfer: true })` then `signUp.finalize()`.
`finalize()` is the canonical futures-API session activation (deterministic; avoids manual status+setActive reads). Shared hook: `artifacts/mobile/hooks/useGoogleAuth.ts`.

**Why:** Missing the transfer branch locked out every returning Google user ("Could not complete Google sign-up").

Dev-env testing blockers (Replit-managed Clerk):
- Sign-UP UI is blocked by Cloudflare Turnstile captcha — not automatable; sign-IN has no captcha.
- Workspace `CLERK_SECRET_KEY` belongs to the PRODUCTION Clerk instance; BAPI user creation with it does NOT create dev-instance users (dev pk = separate store, no matching secret key available).
- Tester's programmatic `signInClerkUser` fails on the Expo web dev domain with redirect_url allowlist 422 — Expo bypasses the shared proxy, so its domain isn't allowlisted.
Practical fallback: e2e-test signed-out paths + unit tests + logic verification against `@clerk/shared` d.ts in the pnpm store (`node_modules/.pnpm/@clerk+shared@*/.../dist/types/signInFuture.d.ts`).
