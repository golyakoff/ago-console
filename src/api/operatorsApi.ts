import { config } from "../config.js";
import { withActiveSiteHeader } from "./activeSite.js";

/**
 * `5-08`: `GET /api/v1/operators/me` (`Ago.Chat.Api.Operators.OperatorsEndpoints`, an addition this
 * item made to `ago-chat` for the exact reason `GetMyPermissionsHandler`'s own doc comment gives -
 * nothing before this let the console learn which permissions the signed-in operator holds, and
 * Keycloak's own token carries none of that). Same plain-`fetch` shape as `conversationsApi.ts`.
 */
export interface OperatorPermissionsResponse {
  operatorId: string;
  siteId: string;
  permissions: string[];
}

export async function fetchMyPermissions(accessToken: string): Promise<OperatorPermissionsResponse> {
  const response = await fetch(`${config.apiBaseUrl}/api/v1/operators/me`, {
    headers: withActiveSiteHeader({ Authorization: `Bearer ${accessToken}` }),
  });

  if (!response.ok) {
    throw new Error(`Failed to load permissions: ${response.status}`);
  }

  return (await response.json()) as OperatorPermissionsResponse;
}

export type OperatorResolutionState = "operator" | "keycloak-identity-only";

/**
 * `10-03`: the "does this freshly-authenticated token resolve to a real operator" check `CallbackPage`
 * needs, to route between state (a) (existing operator - queue) and state (b) (a real,
 * signature-valid Keycloak identity whose `sub` matches no `operators` row yet - the onboarding form).
 *
 * Deliberately reuses `GET /api/v1/operators/me` (`RequireOperatorIdentity`, `5-08`) rather than
 * decoding the token's own claims client-side - the backlog item's own Scope warns against
 * re-deriving `OperatorIdentityClaimsTransformation`'s server-side resolution in the console; a `403`
 * from this exact policy *is* that resolution, already computed server-side, reused for free rather
 * than adding a bespoke "does an operator exist for this identity" endpoint `10-02`'s own contract
 * does not provide. `RequireOperatorIdentity`'s `RequireClaim(OperatorId)` is what actually produces
 * the `403` for a Keycloak-identity-only token - ASP.NET Core's own default: authenticated but the
 * policy's claim requirement fails - never a `401`, which stays reserved for "no valid token at all"
 * (state (c), unchanged, handled by `signinRedirectCallback()`'s own rejection before this is ever
 * called).
 *
 * This does mean the same `GET /api/v1/operators/me` call happens twice on a state-(a) first login -
 * once here, once again inside `PermissionsProvider` once routed to the queue. A small, stated,
 * one-time duplicate fetch, not worth a cross-page cache for a call this cheap and this rare.
 */
export async function resolveOperatorState(accessToken: string): Promise<OperatorResolutionState> {
  const response = await fetch(`${config.apiBaseUrl}/api/v1/operators/me`, {
    headers: withActiveSiteHeader({ Authorization: `Bearer ${accessToken}` }),
  });

  if (response.ok) {
    return "operator";
  }

  if (response.status === 403) {
    return "keycloak-identity-only";
  }

  throw new Error(`Failed to resolve operator identity: ${response.status}`);
}
