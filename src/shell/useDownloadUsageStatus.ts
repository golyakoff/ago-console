import { useCallback, useEffect, useState } from "react";
import { fetchDownloadUsageStatus, type DownloadUsageStatusDto } from "../api/downloadUsageApi.js";

/**
 * `25-83`: the tenant's own download-usage read, for the shell-wide banner - the identical
 * mount-fetch-once-per-`(accessToken, siteId)` shape `useSiteSuspensionStatus.ts`'s own remarks
 * state in full for the identical situation (no `SignalR` event drives this fact either, so
 * "correct on the next mount" is the same honest answer here).
 *
 * Returns `null` before the first answer arrives, after any failure, and whenever `accessToken`/
 * `siteId` are not yet known - `null` here means "do not render the banner", never "confirmed under
 * the soft threshold" (`fetchDownloadUsageStatus`'s own remarks on why a failure must not block the
 * console, only omit a courtesy notice from it).
 */
export function useDownloadUsageStatus(accessToken: string | undefined, siteId: string | null): DownloadUsageStatusDto | null {
  const [status, setStatus] = useState<DownloadUsageStatusDto | null>(null);

  const refresh = useCallback(() => {
    if (!accessToken || !siteId) {
      return;
    }

    fetchDownloadUsageStatus(accessToken, siteId)
      .then((dto) => setStatus(dto))
      .catch((err: unknown) => {
        // Never surfaced to the operator - fetchDownloadUsageStatus's own remarks on why this banner
        // degrades to absent, not broken, on failure.
        console.warn("Failed to load this site's download usage for the console banner", err);
      });
  }, [accessToken, siteId]);

  useEffect(() => {
    if (!accessToken || !siteId) {
      return;
    }

    refresh();
  }, [accessToken, siteId, refresh]);

  return accessToken && siteId ? status : null;
}
