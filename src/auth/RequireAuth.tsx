import { type ReactNode, useEffect } from "react";
import { useAuth } from "./AuthContext.js";
import { CenteredShell } from "../shell/AppShell.js";
import { Spinner } from "../components/Spinner.js";
import { useStrings } from "../i18n/StringsContext.js";

/** Redirects to Keycloak immediately if there is no session - no login *page* to render first
 * (`5-06`'s own scope: a route guard, not a branded landing page nobody asked for yet).
 *
 * `11-05`: the "Signing in…" moment before the redirect fires is short but it is the very first
 * thing an operator ever sees of this product, so it renders inside the shell's own branded frame
 * with a real `role="status"` spinner instead of an unstyled `<p>`. Nothing about the guard itself
 * changed. */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { user, isLoading, isSigningOut, login } = useAuth();
  const strings = useStrings();

  useEffect(() => {
    // `23-51`: `isSigningOut` is the whole fix. Without it this effect fired during a sign-out -
    // `oidc-client-ts` clears the stored user before it navigates, so `user` goes null while the
    // browser is still here - and raced the sign-out redirect with a sign-in one. Keycloak's session
    // was still alive at that moment, so the sign-in won silently and the operator was handed back
    // the console they had just asked to leave. See `AuthProvider`'s `logout` for the full ordering.
    if (!isLoading && !isSigningOut && user === null) {
      void login();
    }
  }, [isLoading, isSigningOut, user, login]);

  if (isLoading || user === null) {
    return (
      <CenteredShell>
        {/* `23-51`: the label follows which way the operator is travelling. It said `Signing in…` in
            both directions until this item - an English literal on a Russian console, and wrong about
            what was happening in one of the two cases. */}
        <Spinner label={isSigningOut ? strings.authSigningOut : strings.authSigningIn} />
      </CenteredShell>
    );
  }

  return children;
}
