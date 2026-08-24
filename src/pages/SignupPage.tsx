import { keycloakRegistrationRedirect } from "../auth/userManager.js";

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
 * The button itself only ever redirects - no form, no password field, matching `adr/0027`'s decision
 * that Keycloak's own hosted registration page owns every field (email, password, confirm password,
 * reCAPTCHA) this console never re-implements.
 */
export function SignupPage() {
  return (
    <div>
      <h1>Sign up for AGO Chat</h1>
      <p>Create your site and operator account. You'll fill in your email and choose a password on Keycloak's own sign-up page.</p>
      <button type="button" onClick={() => void keycloakRegistrationRedirect()}>
        Sign up
      </button>
    </div>
  );
}
