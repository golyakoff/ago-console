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

/**
 * `23-70`: the invite landing page's own read - `POST /api/v1/operator-invites/preview`
 * (`Ago.Chat.Api.OperatorInvites.OperatorInviteEndpoints`), `AllowAnonymous()` on the server, so this
 * call sends no `Authorization` header at all - unlike every other function in this file, the caller
 * here has not signed in, and may never (`InvitePreviewPage.tsx`'s own doc comment: "a stranger opening
 * a link they were sent").
 *
 * <b>`POST` with the code in the body, not `GET` with the code in the path.</b> The route
 * `InvitePreviewPage` calls this from - `/invite/:code` - still carries the code in the browser's own
 * URL; that half is unavoidable for a link and is a separate, already-flagged question. What is
 * avoidable is this *API* call carrying it a second time, server-side, in a form request tracing and
 * access logs capture by default - a live check against the deployment's own Jaeger found `url.path`
 * recorded verbatim while `url.query` values are redacted, so neither a path segment nor a query
 * string is where this goes. `redeemOperatorInvite` right above already sends this same code in a
 * `POST` body for the identical reason; this function reads the code back off the page's own route
 * param and resubmits it the same way, rather than ever putting it on this request's own URL.
 *
 * `Status` is one of `"Valid"`/`"Expired"`/`"Redeemed"` (`OperatorInvitePreviewStatus`'s own three
 * cases on the server) - a plain string field on a `200`, never a distinct HTTP status per case, per
 * this item's own trap: "an expired or already-used invitation must say so plainly, not 404 and not
 * throw". A code that never existed at all is the one case still rejected as a real `404`, thrown as
 * an `ApiProblemError` the same way every other call in this file already throws one.
 */
export interface OperatorInvitePreviewResponse {
  siteName: string;
  invitedByDisplayName: string | null;
  expiresAt: string;
  status: "Valid" | "Expired" | "Redeemed";
}

export async function previewOperatorInvite(code: string): Promise<OperatorInvitePreviewResponse> {
  const response = await fetch(`${config.apiBaseUrl}/api/v1/operator-invites/preview`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code }),
  });

  if (!response.ok) {
    throw await problemDetailsFrom(response);
  }

  return (await response.json()) as OperatorInvitePreviewResponse;
}
