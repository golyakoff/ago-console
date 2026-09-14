import { config } from "../config.js";
import { withActiveSiteHeader } from "./activeSite.js";

/**
 * `25-83`: the tenant's own read of its own account's download usage -
 * `GET /api/v1/sites/{siteId}/download-usage`, `Ago.Chat.Api.Sites.DownloadUsageEndpoints`'s exact
 * wire shape. The tenant-scoped sibling of `siteSuspensionApi.ts`'s `SiteSuspensionStatusDto` - the
 * identical "own file, own DTO" split that module's own remarks already state for a different
 * site-scoped read.
 */
export interface DownloadUsageStatusDto {
  bytesOut: number;
  softThresholdBytes: number;
  hardThresholdBytes: number;
  isSoftCrossed: boolean;
  isHardCrossed: boolean;
  isExempt: boolean;
  /** `25-84`: `"Manual"` or `"AutoBill"` - the platform owner's own per-tenant choice, read-only
   * here (`docs/backlog/25-84-*.md`'s own Out of scope: no tenant-facing control over it). What the
   * banner needs to tell "blocked, and a purchase fixes it" apart from "blocked for another
   * reason". */
  billingMode: string;
  outstandingOverageBytes: number;
  /** What the outstanding bytes cost right now, computed by the server from the currently-published
   * per-gigabyte price. `null` means no price was ever published, i.e. there is nothing to buy in
   * this deployment. **Never recomputed here** - `25-23`'s own "a real, sourced figure on the wire,
   * never invented client-side" discipline, which is what keeps the number on the button identical
   * to the number the charge is actually made for. */
  outstandingOverageRub: number | null;
  overageSettledRub: number;
  autoBillCapRub: number | null;
  /** The one blocked state a purchase cannot lift - see `downloadUsageBannerAtCap`. */
  isAtAutoBillCap: boolean;
}

/** `25-84`: what `POST .../download-overage/checkout-sessions` answers - the hosted checkout page to
 * send the operator to. Returning from it proves nothing; only the server's own webhook settles the
 * payment, which is why this console polls the usage status afterwards rather than assuming. */
export interface DownloadOverageCheckoutDto {
  confirmationUrl: string;
  amountRub: number;
  bytesOver: number;
}

function url(siteId: string): string {
  return `${config.apiBaseUrl}/api/v1/sites/${siteId}/download-usage`;
}

/**
 * `null` on any failure (a non-2xx response, or a network error) - deliberately, not a thrown error,
 * the identical "a courtesy notice, not a gate" posture `fetchSiteSuspensionStatus`'s own remarks
 * take for the identical situation: an operator who cannot reach this endpoint for any reason should
 * see the console they already see today, not a broken shell.
 */
export async function fetchDownloadUsageStatus(accessToken: string, siteId: string): Promise<DownloadUsageStatusDto> {
  const response = await fetch(url(siteId), {
    headers: withActiveSiteHeader({ Authorization: `Bearer ${accessToken}` }),
  });

  if (!response.ok) {
    throw new Error(`Failed to load this site's download usage: ${response.status}`);
  }

  return (await response.json()) as DownloadUsageStatusDto;
}

/**
 * `25-84`: starts a real checkout for whatever download overage this tenant owes right now. Throws on
 * any non-2xx - unlike `fetchDownloadUsageStatus` above (a courtesy read that degrades to absent), a
 * failed purchase is something the operator asked for and must be told about.
 */
export async function startDownloadOverageCheckout(
  accessToken: string,
  siteId: string,
): Promise<DownloadOverageCheckoutDto> {
  const response = await fetch(`${config.apiBaseUrl}/api/v1/sites/${siteId}/download-overage/checkout-sessions`, {
    method: "POST",
    headers: withActiveSiteHeader({ Authorization: `Bearer ${accessToken}` }),
  });

  if (!response.ok) {
    throw new Error(`Failed to start a download-overage checkout: ${response.status}`);
  }

  return (await response.json()) as DownloadOverageCheckoutDto;
}
