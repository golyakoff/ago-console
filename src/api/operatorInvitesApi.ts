import { config } from "../config.js";
import { ApiProblemError, problemDetailsFrom } from "./problemDetails.js";
import { ShapeMismatchError, assertHasKeys, requiredKeysOf } from "./shapeGuard.js";

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

/**
 * `23-118`/`23-99`: the runtime shape this read promises. A `POST` in transport (the code must not ride
 * the URL - see this function's own doc comment) but a pure read in effect, so it is *not* a write echo
 * the bound excludes. `status` is the load-bearing field: dropped, no branch in `InvitePreviewPage`'s
 * `state.preview.status === ...` chain matches and the panel renders empty - a blank card with no alert
 * and no content, the `23-99` false-empty case. `siteName` dropped renders a blank shop name inside the
 * Valid branch. All four fields are present-but-maybe-null on the wire (none is `?`), so all four are
 * required keys. Rethrown as `ApiProblemError('shape.mismatch')` - the file's own error type, caught by
 * `InvitePreviewPage`'s load `catch` (which shows its generic error alert for any non-`NotFound`
 * `ApiProblemError`) instead of the blank card.
 */
const operatorInvitePreviewRequiredKeys = requiredKeysOf<OperatorInvitePreviewResponse>({
  siteName: true,
  invitedByDisplayName: true,
  expiresAt: true,
  status: true,
});

export async function previewOperatorInvite(code: string): Promise<OperatorInvitePreviewResponse> {
  const response = await fetch(`${config.apiBaseUrl}/api/v1/operator-invites/preview`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code }),
  });

  if (!response.ok) {
    throw await problemDetailsFrom(response);
  }

  const body: unknown = await response.json();
  try {
    assertHasKeys<OperatorInvitePreviewResponse>(body, operatorInvitePreviewRequiredKeys, "POST /api/v1/operator-invites/preview");
  } catch (reason) {
    if (reason instanceof ShapeMismatchError) {
      throw new ApiProblemError("shape.mismatch", reason.diagnostic, response.status);
    }
    throw reason;
  }
  return body;
}

/**
 * `25-73`: `OnboardingPage`'s own registration-collision steer - `GET /api/v1/operator-invites/pending-for-me`,
 * `RequireKeycloakIdentity` (this caller may resolve to no `operators` row yet, the identical policy
 * `redeemOperatorInvite` above already uses). The server reads the email off the *token*, never a
 * value this call supplies - there is nothing here for a caller to name an arbitrary address with.
 */
export interface HasPendingOperatorInviteResponse {
  hasPendingInvite: boolean;
}

/**
 * `23-118`/`23-99`: `hasPendingInvite` dropped reads as `undefined` and `OnboardingPage` sets it into a
 * boolean state that renders falsy - "no pending invite", indistinguishable from a caller who genuinely
 * has none: the `23-99` false-negative case for a status object whose absent boolean silently reads as
 * "not-X". Thrown as a **plain** `ShapeMismatchError`, not remapped to a `shape.mismatch`-coded error,
 * for the same reason `siteSuspensionApi.ts` gives: `OnboardingPage`'s effect `.catch(() => {})` fails
 * open on every rejection and never renders `err.message`, so there is no localized-surfacing path a
 * `shape.mismatch` code would feed - guarding here still makes the boundary reject the malformed body as
 * an error rather than resolve it into a silent false.
 */
const hasPendingOperatorInviteRequiredKeys = requiredKeysOf<HasPendingOperatorInviteResponse>({ hasPendingInvite: true });

export async function hasPendingOperatorInvite(accessToken: string): Promise<HasPendingOperatorInviteResponse> {
  const response = await fetch(`${config.apiBaseUrl}/api/v1/operator-invites/pending-for-me`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!response.ok) {
    throw await problemDetailsFrom(response);
  }

  const body: unknown = await response.json();
  assertHasKeys<HasPendingOperatorInviteResponse>(body, hasPendingOperatorInviteRequiredKeys, "GET /api/v1/operator-invites/pending-for-me");
  return body;
}

/**
 * `25-85`: the "activate it here" card's own destination - `POST /api/v1/operator-invites/redeem-pending-for-me`,
 * the identical `RequireKeycloakIdentity` policy every other call in this file uses. No code in the
 * request: `HasPendingOperatorInviteHandler`'s own design (`25-73`) never gave this console a code to
 * carry, because `OperatorInvite.CodeHash` is a one-way hash - there is no redeemable code to recover
 * from storage for *any* caller, authenticated or not. This redeems directly instead, keyed by the
 * caller's own authenticated token email - `RedeemPendingOperatorInviteForCallerHandler`'s own remarks
 * (`ago-chat`) carry the full security reasoning for why that is the same trust level this item's own
 * backlog already names as sufficient, not a new one invented for this call.
 *
 * Returns the identical shape `redeemOperatorInvite` above does on success, and throws the identical
 * `ApiProblemError` shape on failure - `RedeemInvitePage.tsx`'s own `messageFor` already maps every
 * `OperatorInvite.*` code this call can produce, `OperatorInvite.NoAutoRedeemablePendingInvite` (this
 * item's own new code, meaning "nothing to redeem automatically" rather than "you made a mistake")
 * included.
 */
export async function redeemPendingOperatorInviteForMe(accessToken: string): Promise<RedeemOperatorInviteResponse> {
  const response = await fetch(`${config.apiBaseUrl}/api/v1/operator-invites/redeem-pending-for-me`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!response.ok) {
    throw await problemDetailsFrom(response);
  }

  return (await response.json()) as RedeemOperatorInviteResponse;
}
