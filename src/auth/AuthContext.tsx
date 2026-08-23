import { createContext, useContext } from "react";
import type { User } from "oidc-client-ts";

export interface AuthState {
  user: User | null;
  isLoading: boolean;
  login: () => Promise<void>;
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
