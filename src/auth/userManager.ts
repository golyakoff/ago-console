import { OidcClient, UserManager, WebStorageStateStore } from "oidc-client-ts";
import { config } from "../config.js";

/**
 * `adr/0023`/`adr/0022`: Authorization Code + PKCE against Keycloak - `ago-console` is a public
 * client (no client secret, `keycloak-realm-import.json`'s own `publicClient: true`), so PKCE is
 * what proves this specific browser session requested the code it is exchanging, not a secret
 * embedded in a static bundle (which would not be a secret at all - `api-design.md`'s own "the OIDC
 * client id is public by design" reasoning). `oidc-client-ts` handles the code-verifier/challenge
 * generation and the token exchange itself - hand-rolling PKCE correctly is exactly the kind of
 * security-sensitive plumbing this project reaches for a real dependency over, the same reasoning
 * `CLAUDE.md` already applies to `Ago.Platform.Resilience` reaching for `Polly` instead of hand-rolled
 * retry loops.
 *
 * `WebStorageStateStore` backed by `sessionStorage`, not `localStorage`: an operator's own session
 * ending when the tab closes is the right default for an internal tool, and it is `oidc-client-ts`'s
 * own documented recommendation over `localStorage` for exactly this reason.
 */
export const userManager = new UserManager({
  authority: config.keycloakAuthority,
  client_id: config.keycloakClientId,
  redirect_uri: `${window.location.origin}/callback`,
  post_logout_redirect_uri: `${window.location.origin}/`,
  response_type: "code",
  scope: "openid profile email",
  userStore: new WebStorageStateStore({ store: window.sessionStorage }),
  // **Silent renew is on.** `5-06` left a note here saying it was "deliberately not wired up",
  // meaning the hidden-iframe plumbing (`silent_redirect_uri` and a route to serve it) - which is
  // still true and still not here. What that note got wrong, and `5-16` found the hard way, is the
  // conclusion drawn from it: `UserManager`'s `automaticSilentRenew` defaults to **true**, and
  // `signinSilent` only reaches for an iframe when there is no refresh token to use. Keycloak's
  // authorization-code flow returns one, so renewal happens off the refresh token roughly a minute
  // before each access token expires - no iframe, no redirect URI, nothing to wire.
  //
  // Which is the behaviour we want. It is recorded here because it is *invisible* - there is no
  // setting in this file that says it is happening - and a reader who believed the old note would
  // reason, as `5-06` and `5-07` both did, that an access token in this app never changes after
  // sign-in. Anything holding a token must treat it as a value that rotates on its own schedule;
  // `OperatorConnectionProvider` is the one place that got that wrong, and its doc comment has the
  // full story.
});

/**
 * `10-03`/`adr/0027`: redirects to Keycloak's own hosted registration form - the console never
 * collects a password (`adr/0027`'s reasoning, extended one step earlier than login: Keycloak already
 * solved account creation correctly, so this project does not rebuild it). Mechanically this is the
 * *identical* Authorization Code + PKCE request `userManager.signinRedirect()` already builds, just
 * landing on Keycloak's `/registrations` endpoint instead of `/auth` - both accept the same query
 * parameters and both complete by redirecting back to `redirect_uri` with `?code=&state=`
 * (`local-dev.md`'s own documented registration URL shape), so `CallbackPage`'s existing
 * `signinRedirectCallback()` finishes the exchange with no changes of its own - this item extends
 * `5-06`'s login flow rather than building a parallel one, matching the backlog's own framing.
 *
 * `UserManager.signinRedirect()` cannot be pointed at a different endpoint directly - it always
 * builds and navigates to the standard authorization endpoint. `OidcClient` is the lower-level class
 * `UserManager` wraps internally to actually build the request and persist its PKCE verifier/state/
 * nonce into `settings.stateStore`; constructing one directly from `userManager`'s own already-
 * configured `settings`/`metadataService` reuses that exact request-building and state-persisting
 * logic (the same `stateStore` instance `signinRedirectCallback()` already reads from on return), so
 * only the destination URL differs. This is the same well-known trick `keycloak-js`'s own `register()`
 * helper uses internally against a vanilla Keycloak realm - not something invented for this project.
 */
export async function keycloakRegistrationRedirect(): Promise<void> {
  const oidcClient = new OidcClient(userManager.settings, userManager.metadataService);
  const signinRequest = await oidcClient.createSigninRequest({});

  const registrationUrl = signinRequest.url.replace(
    "/protocol/openid-connect/auth",
    "/protocol/openid-connect/registrations",
  );

  window.location.assign(registrationUrl);
}
