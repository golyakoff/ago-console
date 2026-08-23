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
  const logout = () => userManager.signoutRedirect();

  return <AuthContext.Provider value={{ user, isLoading, login, logout }}>{children}</AuthContext.Provider>;
}
