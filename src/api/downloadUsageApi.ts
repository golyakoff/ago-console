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
