import { createContext, useContext } from "react";
import type { User } from "oidc-client-ts";

export interface AuthState {
  user: User | null;
  isLoading: boolean;
  login: () => Promise<void>;

  /** `23-51`: true from the moment sign-out is asked for until the browser has left for Keycloak.
   * It exists because `oidc-client-ts` clears the stored user *before* it navigates, which makes
   * `user === null` mean two different things a fraction of a second apart - `nobody is signed in`
   * and `somebody is on their way out` - and `RequireAuth` cannot tell them apart without this.
   * See `AuthProvider`'s `logout` for the race it prevents. */
  isSigningOut: boolean;
  logout: () => Promise<void>;
}

export const AuthContext = createContext<AuthState | null>(null);

/** Throws outside `AuthProvider` on purpose - every route that needs this is already inside it
 * (`main.tsx`), so a missing provider is a wiring bug worth failing loudly on, not a silently `null`
 * value every caller would need to re-check. */
export function useAuth(): AuthState {
  const context = useContext(AuthContext);
  if (context === null) {
    throw new Error("useAuth() called outside <AuthProvider>.");
  }

  return context;
}
