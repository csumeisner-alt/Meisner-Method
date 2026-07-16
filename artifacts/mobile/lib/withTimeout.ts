/**
 * Pure timeout wrapper for promises. Lives in lib/ (no React Native imports)
 * so it can be unit-tested with Node's built-in test runner.
 */

/** Error thrown when the wrapped promise does not settle in time. */
export class SSOTimeoutError extends Error {
  constructor() {
    super('Sign-in timed out, please try again.');
    this.name = 'SSOTimeoutError';
  }
}

/** Reject with `SSOTimeoutError` if the promise does not settle within `ms`. */
export function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new SSOTimeoutError()), ms);
    promise.then(
      (v) => { clearTimeout(timer); resolve(v); },
      (e) => { clearTimeout(timer); reject(e); },
    );
  });
}
