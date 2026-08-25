import { useState } from "react";
import { keycloakRegistrationRedirect } from "../auth/userManager.js";
import { AppShell, PageHead } from "../shell/AppShell.js";
import { Alert } from "../components/Alert.js";
import { Button } from "../components/Button.js";

/**
 * `10-03`: the fourth console surface `adr/0023` did not anticipate - a public, pre-account,
 * pre-authentication route. No `RequireAuth` guard (a visitor here has no session at all, by
 * definition - `RequireAuth` itself would immediately redirect to Keycloak's *login* page, which is
 * not what a "Sign up" entry point needs), and none of the operator-only providers (`Permissions
 * Provider`, `OperatorConnectionProvider`) mount here either.
 *
 * Deliberately not linked from `/` - `RequireAuth`'s own existing behaviour redirects an unauthenticated
 * visitor straight to Keycloak's *login* page with no console-rendered landing page in between
 * (`5-06`'s own scope: "a route guard, not a branded landing page nobody asked for yet"), so there is
 * no unauthenticated screen `/` could ever show a "Sign up" link from without first building that
 * landing page - a design-system pass this item's own Out of scope explicitly defers ("reuse whatever
 * `5-07` already established... a full design pass is still not this item's job"). `/signup` exists as
 * a directly-reachable URL instead (e.g. from an external marketing link), matching the backlog's own
 * framing: "a visitor with no `ago-console` session can reach a public 'Sign up' entry point," not
 * "clicks through from the console's own login redirect."
 *
 * The button itself only ever redirects - no form, no password field, matching `adr/0028`'s decision
 * that Keycloak's own hosted registration page owns every field (email, password, confirm password,
 * reCAPTCHA) this console never re-implements.
 *
 * **The redirect can fail, and used to fail invisibly.** `keycloakRegistrationRedirect()` fetches
 * Keycloak's discovery document before it can build the request, and derives the registration URL
 * from what comes back (`registrationUrl.ts`); either step can reject - Keycloak down, a realm
 * renamed, an authorization endpoint that has moved. This page fired it as `void` and rendered
 * nothing either way, so the entire failure mode was "the Sign up button does nothing, forever."
 * A visitor who cannot start an account is the one person with no way to report that. It is now a
 * message they can read and repeat.
 *
 * `11-05`: renders `AppShell` directly, with no navigation and no identity block - this route mounts
 * outside `PermissionsProvider`/`OperatorConnectionProvider` (and outside `RequireAuth`), so there is
 * neither a permission to gate a nav item on nor anybody to name. That is precisely why the shell
 * takes what it displays as props instead of reading context (`AppShell`'s own doc comment). The
 * `10-03` note above about deferring "a full design pass" is now answered by this item.
 */
export function SignupPage() {
  const [redirecting, setRedirecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSignup = async () => {
    setError(null);
    setRedirecting(true);
    try {
      await keycloakRegistrationRedirect();
      // No `finally` clearing `redirecting`: on the success path the browser is already leaving for
      // Keycloak, and re-enabling the button underneath a navigation that is already in flight
      // invites a second one. It is cleared only where the navigation did not happen.
    } catch (err) {
      setRedirecting(false);
      setError(
        err instanceof Error
          ? `Could not open the sign-up page: ${err.message}`
          : "Could not open the sign-up page. Please try again.",
      );
    }
  };

  return (
    <AppShell>
      <PageHead
        title="Sign up for AGO Chat"
        description="Create your site and operator account. You'll fill in your email and choose a password on Keycloak's own sign-up page."
      />
      {/* No `Panel` around this. There is exactly one control on the screen, and wrapping it in a
          full-width surface renders as a mostly-empty card - found by looking at the actual rendered
          page rather than at the markup. A panel groups things; one button is not a group. */}
      <div className="ago-row">
        <Button variant="primary" disabled={redirecting} onClick={() => void handleSignup()}>
          {redirecting ? "Opening sign-up…" : "Sign up"}
        </Button>
      </div>

      {error && <Alert tone="danger">{error}</Alert>}
    </AppShell>
  );
}
