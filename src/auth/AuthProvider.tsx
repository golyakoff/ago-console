import { useEffect, useState, type ReactNode } from "react";
import { ErrorResponse, type User } from "oidc-client-ts";
import { userManager } from "./userManager.js";
import { AuthContext } from "./AuthContext.js";

/**
 * Loads whatever session `userManager` already has (a returning operator whose `sessionStorage`
 * entry has not expired) once on mount, then stays in sync via `oidc-client-ts`'s own
 * `userLoaded`/`userUnloaded` events - `CallbackPage`'s `signinRedirectCallback()` fires
 * `userLoaded` itself, so this provider does not need its own copy of the callback-handling logic,
 * only to listen for the result.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSigningOut, setIsSigningOut] = useState(false);

  useEffect(() => {
    void userManager
      .getUser()
      .then(setUser)
      .finally(() => setIsLoading(false));

    const onUserLoaded = (loaded: User) => setUser(loaded);
    const onUserUnloaded = () => setUser(null);

    /**
     * The 4-hour idle SSO timeout (`keycloak-realm-import.json`'s own `ssoSessionIdleTimeout`,
     * `accessTokenLifespan` 300s) is a deliberate business choice for "an operator waits for
     * messages" and stays put - everything below is about telling the truth once it has genuinely
     * passed, and about *not* telling that lie early, which the first version of this fix did.
     *
     * <b>Why "any `silentRenewError` means log out" was wrong.</b> `oidc-client-ts`'s own
     * `SilentRenewService` retries only its `ErrorTimeout` class, and only while
     * `maxSilentRenewTimeoutRetries` is set (this app never sets it, so a timeout in fact retries
     * forever and never reaches this handler at all). Every *other* failure - a dropped fetch, a
     * request starved while the tab was suspended, anything short of Keycloak actually answering
     * "no" - gets zero retries and reaches `silentRenewError` on the very first miss. Wiring that
     * straight to `removeUser()` turned one ordinary renewal hiccup into an immediate, irreversible
     * sign-out - which is exactly what made the broken behaviour track the ~5-minute access-token
     * lifespan rather than the real 4-hour session, the opposite of this item's own requirement.
     * `OperatorConnectionProvider`'s own `5-16` doc comment is the evidence that renewal *does*
     * ordinarily succeed off the refresh token in this deployment (`5-16` observed it firing
     * repeatedly enough to leak connections) - so a single failed attempt is not, on its own, good
     * evidence the SSO session is dead.
     *
     * <b>The distinguishing signal.</b> `ErrorResponse` is what `oidc-client-ts` throws specifically
     * for an OAuth error *response* - Keycloak's token endpoint affirmatively rejecting the refresh
     * grant (`invalid_grant`, the shape a truly-expired or revoked session produces). Every other
     * error reaching here (a plain `Error`/`TypeError` from a fetch that never got a response at
     * all) means the request did not complete, which says nothing about whether the session is
     * still alive - the periodic timer, or `onVisible` below, gets another try. Only `ErrorResponse`
     * is treated as the real, final "no."
     *
     * `removeUser()` rather than `userManager.signinRedirect()` directly: `removeUser()` fires
     * `userUnloaded`, which `onUserUnloaded` above already turns into `user === null`, which
     * `RequireAuth` already turns into a redirect to Keycloak - the exact chain `logout()`'s own doc
     * comment (`23-51`) established as this codebase's one sanctioned way to end a session cleanly.
     * Redirecting from here too would be a second, independent path to the same outcome; `23-51`'s own
     * lesson was that two paths racing is precisely how a "one click, one clean sign-out" story turns
     * into a coin toss. One clearing path, one guard that reacts to it.
     */
    const onSilentRenewError = (error: Error) => {
      if (error instanceof ErrorResponse) {
        void userManager.removeUser();
      }
    };

    /**
     * <b>Why a hiccup-driven, no-retry renewal is not enough on its own.</b> `oidc-client-ts` schedules
     * each renewal with a plain `setInterval` (`Timer`, internal), which the browser is free to throttle
     * or fully suspend while this tab is hidden or backgrounded - a well-documented platform behaviour
     * (Chrome's own "intensive timer throttling"), not something a jsdom test can exercise, which is why
     * this handler's own test below proves only that it *calls* `signinSilent()` on the transition, not
     * that a real browser would otherwise have missed it. An operator stepping away for part of the
     * 4-hour idle window is precisely a hidden/backgrounded tab, so the one schedule this app depends on
     * is least reliable exactly when this item's own scenario needs it most.
     *
     * Firing an explicit renewal attempt the moment the tab becomes visible again closes that gap
     * without waiting on a schedule the browser was free to skip - and reuses the identical
     * `ErrorResponse`-only failure handling above, so a hiccup on this attempt is no more fatal than one
     * on the library's own.
     */
    const onVisible = () => {
      if (document.visibilityState !== "visible") {
        return;
      }

      userManager.signinSilent().catch((error: unknown) => {
        if (error instanceof ErrorResponse) {
          void userManager.removeUser();
        }
        // Anything else: the attempt did not complete, which is not evidence the session is dead -
        // see `onSilentRenewError`'s own doc comment. Nothing actionable for an operator in "a
        // background token refresh failed once," so this is deliberately not surfaced.
      });
    };

    userManager.events.addUserLoaded(onUserLoaded);
    userManager.events.addUserUnloaded(onUserUnloaded);
    userManager.events.addSilentRenewError(onSilentRenewError);
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      userManager.events.removeUserLoaded(onUserLoaded);
      userManager.events.removeUserUnloaded(onUserUnloaded);
      userManager.events.removeSilentRenewError(onSilentRenewError);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  const login = () => userManager.signinRedirect();

  /**
   * `23-51`: **the flag is set before `signoutRedirect` is called, and that ordering is the fix.**
   *
   * `oidc-client-ts`'s `_signoutStart` reads the stored user (for the `id_token_hint`), then
   * `await`s `removeUser()`, and only then navigates to Keycloak's end-session endpoint. That
   * `removeUser` fires `userUnloaded`, which the effect above turns into `user === null` - while the
   * browser is still sitting on this page. `RequireAuth` saw exactly that and did what it is written
   * to do: redirected to *sign in*. Keycloak's SSO cookie was still valid, because nothing had ended
   * that session yet, so it sent the operator straight back signed in and the button appeared to do
   * nothing.
   *
   * Two navigations were racing, which is why it took two clicks sometimes and three others - each
   * press was a fresh coin toss rather than a fixed number.
   *
   * <b>Why a rejection resets it.</b> If the redirect never happens - Keycloak unreachable, the
   * navigation blocked - the operator is still signed in, and leaving this `true` would strand them
   * on a `Выходим…` spinner with a working session behind it. Resetting hands the page back to
   * `RequireAuth`, which is telling the truth: the sign-out did not happen.
   */
  const logout = async () => {
    setIsSigningOut(true);
    try {
      await userManager.signoutRedirect();
    } catch {
      // Deliberately not rethrown. Every call site is `void logout()` - a button's click handler has
      // nowhere to put a rejection - so rethrowing would turn a failed sign-out into an unhandled
      // rejection and change nothing a person can see. Resetting the flag *is* the handling: the
      // guard resumes, sees a session that is gone, and redirects to sign in, which is the honest
      // visible outcome of a sign-out that did not happen.
      setIsSigningOut(false);
    }
  };

  return (
    <AuthContext.Provider value={{ user, isLoading, isSigningOut, login, logout }}>{children}</AuthContext.Provider>
  );
}
