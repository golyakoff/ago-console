import { UserManager, WebStorageStateStore } from "oidc-client-ts";
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
  // Silent renew (a hidden iframe re-authenticating before the access token expires) is
  // deliberately not wired up here - it needs its own verified redirect/iframe handling, and
  // `5-06`'s own scope is the login round trip itself, not session-lifetime management once a real,
  // long-lived console session exists to maintain (`5-07`). An expired token today means the next
  // authenticated call fails and the operator logs in again - correct, just not seamless yet.
});
