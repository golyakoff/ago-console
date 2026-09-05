import { config } from "../config.js";
import { problemDetailsFrom } from "./problemDetails.js";

/**
 * `23-27`: the console's own caller for `13-01`'s `POST /api/v1/operator-invites/redeem`
 * (`Ago.Chat.Api.OperatorInvites.OperatorInviteEndpoints`), gated by `RequireKeycloakIdentity`, the
 * identical policy `sitesApi.ts#registerSite` already calls under - the caller redeeming a code has
 * no `OperatorId`/`SiteId` claim yet by definition, so `withActiveSiteHeader` (`activeSite.ts`) is
 * deliberately not used here, exactly as `registerSite` deliberately does not use it: there is no
 * active site to attach before this call succeeds, and attaching a stale one from a *different*
 * tenancy this identity already holds would only ever narrow the request incorrectly, never help it.
 *
 * Throws `ApiProblemError` (`problemDetails.ts`), not a bespoke error class - `sitesApi.ts`'s own
 * `RegisterSiteError`/`buildError` duplication (also repeated in `tenanciesApi.ts`) is exactly what
 * that file's doc comment calls "worth folding in later"; this is a new call site with no such debt
 * to carry forward, so it reuses the shared type from the start, the same choice `sitesApi.ts#eraseSite`
 * already made for the newer half of that same file.
 */
export interface RedeemOperatorInviteRequest {
  code: string;
}

export interface RedeemOperatorInviteResponse {
  operatorId: string;
  siteId: string;
}

export async function redeemOperatorInvite(
  accessToken: string,
  request: RedeemOperatorInviteRequest,
): Promise<RedeemOperatorInviteResponse> {
  const response = await fetch(`${config.apiBaseUrl}/api/v1/operator-invites/redeem`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(request),
  });

  if (!response.ok) {
    throw await problemDetailsFrom(response);
  }

  return (await response.json()) as RedeemOperatorInviteResponse;
}
