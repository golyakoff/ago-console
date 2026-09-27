import { config } from "../config.js";
import { withActiveSiteHeader } from "./activeSite.js";
import { ApiProblemError, problemDetailsFrom } from "./problemDetails.js";
import { ShapeMismatchError, assertHasKeys, requiredKeysOf } from "./shapeGuard.js";

/**
 * `25-160`: the console's own read/write for `Ago.Chat.Api.Branding.SiteBrandingEndpoints`'s wire shape
 * (`GET`/`PUT /api/v1/sites/{siteId}/branding`, `POST /api/v1/sites/{siteId}/branding/logo`) - the same
 * "thin wire-shape file over every endpoint one screen needs" shape `telegramChannelApi.ts` already
 * establishes for its own screen.
 */
export type LogoStatus = "None" | "Pending" | "Ready" | "Rejected";

export interface SiteBrandingDto {
  brandCompanyName: string | null;
  /** The plain, non-expiring public URL - `null` exactly when `logoStatus` has never reached `"Ready"`.
   * Pointed at directly by an `<img>` tag, the same "no second mechanism" shape this item's own Scope
   * names for the console's own preview. */
  logoUrl: string | null;
  logoStatus: LogoStatus;
  /** Non-null exactly when `logoStatus` is `"Rejected"`. */
  logoRejectionReason: string | null;
}

function emailChannelHeaders(accessToken: string, contentType?: string): HeadersInit {
  return withActiveSiteHeader({
    Authorization: `Bearer ${accessToken}`,
    ...(contentType ? { "Content-Type": contentType } : {}),
  });
}

/**
 * `23-118`/`23-99`: the runtime shape `GET /branding` promises. Every field is present-but-nullable
 * (none is `?`), so all four are required keys - the mapped `RequiredKeys<SiteBrandingDto>` type this
 * literal satisfies keeps it in step with the DTO. `logoStatus` is the load-bearing one: dropped, it
 * reads as an absent (falsy) status and the screen renders the "no logo" state for a shop that has one -
 * a false negative, the exact `23-99` bound for a single object whose absent field silently renders blank.
 */
const siteBrandingRequiredKeys = requiredKeysOf<SiteBrandingDto>({
  brandCompanyName: true,
  logoUrl: true,
  logoStatus: true,
  logoRejectionReason: true,
});

/**
 * `23-118`: rethrows a `shape.mismatch` as `ApiProblemError` - the same type every other rejection in
 * this file already produces (`problemDetailsFrom`), so `EmailChannelPage`'s existing `catch` needs no
 * second error vocabulary (mirrors `conversationsApi.ts#rethrowAsApiProblem`).
 */
function rethrowAsApiProblem(reason: unknown, status: number): never {
  if (reason instanceof ShapeMismatchError) {
    throw new ApiProblemError("shape.mismatch", reason.diagnostic, status);
  }
  throw reason;
}

export async function fetchSiteBranding(accessToken: string, siteId: string): Promise<SiteBrandingDto> {
  const response = await fetch(`${config.apiBaseUrl}/api/v1/sites/${siteId}/branding`, {
    headers: emailChannelHeaders(accessToken),
  });

  if (!response.ok) {
    throw await problemDetailsFrom(response);
  }

  const body: unknown = await response.json();
  try {
    assertHasKeys<SiteBrandingDto>(body, siteBrandingRequiredKeys, "GET /api/v1/sites/{siteId}/branding");
  } catch (reason) {
    rethrowAsApiProblem(reason, response.status);
  }
  return body;
}

export async function updateSiteBrandCompanyName(
  accessToken: string,
  siteId: string,
  brandCompanyName: string | null,
): Promise<{ brandCompanyName: string | null }> {
  const response = await fetch(`${config.apiBaseUrl}/api/v1/sites/${siteId}/branding`, {
    method: "PUT",
    headers: emailChannelHeaders(accessToken, "application/json"),
    body: JSON.stringify({ brandCompanyName }),
  });

  if (!response.ok) {
    throw await problemDetailsFrom(response);
  }

  return (await response.json()) as { brandCompanyName: string | null };
}

/**
 * `25-160`: posts the raw file bytes, not `multipart/form-data` - `SiteBrandingEndpoints`'s own remarks
 * on why. `file.type` is what the server's own `SiteLogoOptions.AllowedContentTypes` map checks -
 * this call sends exactly what the browser reports for the file the tenant picked, never a name-derived
 * guess.
 */
export async function uploadSiteLogo(accessToken: string, siteId: string, file: File): Promise<{ logoStatus: LogoStatus }> {
  const response = await fetch(`${config.apiBaseUrl}/api/v1/sites/${siteId}/branding/logo`, {
    method: "POST",
    headers: emailChannelHeaders(accessToken, file.type),
    body: file,
  });

  if (!response.ok) {
    throw await problemDetailsFrom(response);
  }

  return (await response.json()) as { logoStatus: LogoStatus };
}

export { ApiProblemError };
