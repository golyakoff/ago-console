/**
 * `10-03`: turning the Authorization Code request `oidc-client-ts` builds for *login* into the same
 * request against Keycloak's hosted *registration* form. Both endpoints accept the identical query
 * parameters (`client_id`, `redirect_uri`, `state`, `code_challenge`, …) and both complete by
 * redirecting back to `redirect_uri` with `?code=&state=`, which is why `CallbackPage` needs no
 * second handler - `adr/0028`'s "the console's role stays a redirect out and a callback handler for
 * the token that comes back."
 *
 * A pure function in its own module, not three lines inside `userManager.ts`, for two reasons.
 * `userManager.ts` constructs a `UserManager` at import time and reads `window.location.origin`,
 * so the one piece of real logic in it could only be exercised through that; and this is the piece
 * with a way to be wrong.
 *
 * **It fails closed.** The obvious implementation is `url.replace("…/auth", "…/registrations")`,
 * which is what this started as. `String.replace` with no match returns the string unchanged - so
 * the day Keycloak's `authorization_endpoint` is not at the path this expects (a realm behind a
 * path-rewriting proxy, a future Keycloak that moves it, a metadata document that points somewhere
 * else entirely), the "Sign up" button would silently open Keycloak's *login* page. A visitor with
 * no account cannot log in, would not know why, and nothing anywhere would record that the console
 * had sent them to the wrong screen. Throwing turns that into a message on the screen and a rejected
 * promise `SignupPage` already surfaces. Matching on the *pathname* rather than anywhere in the URL
 * is part of the same care: `auth.example.com` is a perfectly ordinary Keycloak host name, and a
 * substring match against the whole URL would rewrite the host of one.
 */
const AUTHORIZE_PATH = "/protocol/openid-connect/auth";
const REGISTRATION_PATH = "/protocol/openid-connect/registrations";

export function registrationUrlFrom(authorizeUrl: string): string {
  const url = new URL(authorizeUrl);

  if (!url.pathname.endsWith(AUTHORIZE_PATH)) {
    throw new Error(
      `Cannot derive Keycloak's registration URL: ${url.pathname} is not ${AUTHORIZE_PATH}. ` +
        "The realm's authorization endpoint has moved, and sending you to the sign-in page instead would be worse.",
    );
  }

  url.pathname = url.pathname.slice(0, -AUTHORIZE_PATH.length) + REGISTRATION_PATH;

  return url.toString();
}
