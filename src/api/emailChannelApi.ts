import { config } from "../config.js";
import { withActiveSiteHeader } from "./activeSite.js";
import { ApiProblemError, problemDetailsFrom } from "./problemDetails.js";

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

export async function fetchSiteBranding(accessToken: string, siteId: string): Promise<SiteBrandingDto> {
  const response = await fetch(`${config.apiBaseUrl}/api/v1/sites/${siteId}/branding`, {
    headers: emailChannelHeaders(accessToken),
  });

  if (!response.ok) {
    throw await problemDetailsFrom(response);
  }

  return (await response.json()) as SiteBrandingDto;
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
