import { type ReactNode, useEffect } from "react";
import { useAuth } from "./AuthContext.js";

/** Redirects to Keycloak immediately if there is no session - no login *page* to render first
 * (`5-06`'s own scope: a route guard, not a branded landing page nobody asked for yet). */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { user, isLoading, login } = useAuth();

  useEffect(() => {
    if (!isLoading && user === null) {
      void login();
    }
  }, [isLoading, user, login]);

  if (isLoading || user === null) {
    return <p>Signing in…</p>;
  }

  return children;
}
