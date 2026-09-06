import { useEffect, useState, type ReactNode } from "react";
import type { User } from "oidc-client-ts";
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
    userManager.events.addUserLoaded(onUserLoaded);
    userManager.events.addUserUnloaded(onUserUnloaded);

    return () => {
      userManager.events.removeUserLoaded(onUserLoaded);
      userManager.events.removeUserUnloaded(onUserUnloaded);
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
