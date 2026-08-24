import { type ReactNode, useEffect } from "react";
import { useAuth } from "./AuthContext.js";
import { CenteredShell } from "../shell/AppShell.js";
import { Spinner } from "../components/Spinner.js";

/** Redirects to Keycloak immediately if there is no session - no login *page* to render first
 * (`5-06`'s own scope: a route guard, not a branded landing page nobody asked for yet).
 *
 * `11-05`: the "Signing in…" moment before the redirect fires is short but it is the very first
 * thing an operator ever sees of this product, so it renders inside the shell's own branded frame
 * with a real `role="status"` spinner instead of an unstyled `<p>`. Nothing about the guard itself
 * changed. */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { user, isLoading, login } = useAuth();

  useEffect(() => {
    if (!isLoading && user === null) {
      void login();
    }
  }, [isLoading, user, login]);

  if (isLoading || user === null) {
    return (
      <CenteredShell>
        <Spinner label="Signing in…" />
      </CenteredShell>
    );
  }

  return children;
}
